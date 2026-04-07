const express = require('express');
const db      = require('../services/db');
const auth    = require('../middleware/auth');
const wa      = require('../services/whatsapp');

const router = express.Router();

// GET /api/reports/stats  — must be before /:id
router.get('/stats', auth(), (req, res) => {
  const { role, section } = req.user;
  const qs = req.query.section;

  let where = ''; const params = [];
  if (role === 'supervisor') {
    where = 'WHERE supervisor_id=?'; params.push(req.user.id);
  } else if (role === 'section_manager' && section !== 'both') {
    where = 'WHERE section=?'; params.push(section);
  } else if (qs) {
    where = 'WHERE section=?'; params.push(qs);
  }

  const stats = db.prepare(`
    SELECT
      COUNT(*) total,
      SUM(CASE WHEN status='pending'     THEN 1 ELSE 0 END) pending,
      SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) in_progress,
      SUM(CASE WHEN status='closed'      THEN 1 ELSE 0 END) closed,
      SUM(CASE WHEN priority='urgent'    THEN 1 ELSE 0 END) urgent,
      AVG(CASE WHEN response_mins IS NOT NULL THEN response_mins END) avg_mins
    FROM reports ${where}
  `).get(...params);

  const byCategory = db.prepare(`
    SELECT category, COUNT(*) count FROM reports ${where}
    GROUP BY category ORDER BY count DESC
  `).all(...params);

  res.json({ ...stats, byCategory });
});

// GET /api/reports
router.get('/', auth(), (req, res) => {
  const { role, section, id: userId } = req.user;
  const { status, category, priority, search, section: qs, limit = 100, offset = 0 } = req.query;

  const where = []; const params = [];

  // Role-based isolation
  if (role === 'supervisor') {
    where.push('supervisor_id=?'); params.push(userId);
  } else if (role === 'section_manager' && section !== 'both') {
    where.push('section=?'); params.push(section);
  } else if (qs) {
    where.push('section=?'); params.push(qs);
  }

  if (status)   { where.push('status=?');           params.push(status); }
  if (category) { where.push('category=?');          params.push(category); }
  if (priority) { where.push('priority=?');          params.push(priority); }
  if (search)   { where.push('description LIKE ?');  params.push(`%${search}%`); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const reports = db.prepare(`
    SELECT r.*,
      u.name  assigned_name,
      c.name  closed_by_name
    FROM reports r
    LEFT JOIN users u ON r.assigned_to = u.id
    LEFT JOIN users c ON r.closed_by   = c.id
    ${whereStr}
    ORDER BY
      CASE WHEN r.status='pending' AND r.priority='urgent' THEN 0
           WHEN r.status='pending' THEN 1
           ELSE 2 END,
      r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  const total = db.prepare(`SELECT COUNT(*) c FROM reports ${whereStr}`).get(...params);

  res.json({ reports, total: total.c });
});

// POST /api/reports
router.post('/', auth(), async (req, res) => {
  try {
    const { section, room, bed, category, priority, description } = req.body || {};

    if (!room || !category || !description)
      return res.status(400).json({ error: 'الحقول الإلزامية: room, category, description' });

    const supervisorId   = req.user.id;
    const supervisorName = req.user.name;

    const reportSection = req.user.role === 'supervisor'
      ? (req.user.section === 'both' ? (section || 'men') : req.user.section)
      : (section || 'men');

    if (!['men', 'women'].includes(reportSection))
      return res.status(400).json({ error: 'القسم يجب أن يكون men أو women' });

    const result = db.prepare(`
      INSERT INTO reports (section, supervisor_id, supervisor_name, room, bed, category, priority, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(reportSection, supervisorId, supervisorName, room, bed || '', category, priority || 'normal', description);

    const report = db.prepare('SELECT * FROM reports WHERE id=?').get(result.lastInsertRowid);

    setImmediate(async () => {
      try {
        const supervisor = db.prepare('SELECT phone FROM users WHERE id=?').get(supervisorId);
        if (supervisor?.phone) {
          await wa.sendText(supervisor.phone, wa.msgAck(report));
        }
        const managers = db.prepare(`
          SELECT id, phone FROM users
          WHERE active=1 AND wa_notify=1
            AND phone IS NOT NULL AND phone != ''
            AND (role = 'general_manager'
                 OR (role = 'section_manager' AND (section=? OR section='both')))
        `).all(reportSection);
        const msg = wa.msgNewReport(report);
        const logStmt = db.prepare(
          'INSERT INTO notifications_log (report_id, user_id, phone, status, message) VALUES (?,?,?,?,?)'
        );
        for (const mgr of managers) {
          const waResult = await wa.sendText(mgr.phone, msg);
          logStmt.run(report.id, mgr.id, mgr.phone, waResult ? 'sent' : 'failed', msg.substring(0, 200));
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (e) {
        console.error('[notify error]', e.message);
      }
    });

    res.status(201).json({ report, message: 'تم رفع البلاغ وإشعار الإدارة' });
  } catch (e) {
    console.error('[POST /reports]', e.message);
    res.status(500).json({ error: 'خطأ في حفظ البلاغ' });
  }
});

// PATCH /api/reports/:id/status
router.patch('/:id/status', auth('section_manager'), async (req, res) => {
  try {
    const { status, note } = req.body || {};
    const validStatuses = ['pending', 'in_progress', 'closed'];

    if (!status || !validStatuses.includes(status))
      return res.status(400).json({ error: 'الحالة يجب أن تكون: pending, in_progress, closed' });

    const report = db.prepare('SELECT * FROM reports WHERE id=?').get(req.params.id);
    if (!report) return res.status(404).json({ error: 'البلاغ غير موجود' });

    if (req.user.role === 'section_manager' && req.user.section !== 'both'
        && report.section !== req.user.section) {
      return res.status(403).json({ error: 'هذا البلاغ ليس من قسمك' });
    }

    const now = new Date().toISOString();
    let closedAt = null, responseMins = null;

    if (status === 'closed') {
      closedAt     = now;
      responseMins = Math.round((Date.now() - new Date(report.created_at).getTime()) / 60000);
    }

    db.prepare(`
      UPDATE reports
      SET status=?, updated_at=?, closed_by=?, closed_note=?, closed_at=?, response_mins=?
      WHERE id=?
    `).run(
      status, now,
      status === 'closed' ? req.user.id : report.closed_by,
      note || '',
      closedAt, responseMins,
      report.id
    );

    const updated = db.prepare('SELECT * FROM reports WHERE id=?').get(report.id);

    if (status === 'closed') {
      setImmediate(async () => {
        try {
          const sup = db.prepare('SELECT phone FROM users WHERE id=?').get(report.supervisor_id);
          if (sup?.phone) await wa.sendText(sup.phone, wa.msgClosed(updated, note));
        } catch (e) { console.error('[close notify]', e.message); }
      });
    }

    res.json({ report: updated });
  } catch (e) {
    console.error('[PATCH /reports/status]', e.message);
    res.status(500).json({ error: 'خطأ في تحديث حالة البلاغ' });
  }
});

// PATCH /api/reports/:id/assign
router.patch('/:id/assign', auth('section_manager'), (req, res) => {
  const { assigned_to } = req.body || {};
  const report = db.prepare('SELECT * FROM reports WHERE id=?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'البلاغ غير موجود' });

  db.prepare(`
    UPDATE reports SET assigned_to=?, status='in_progress', updated_at=? WHERE id=?
  `).run(assigned_to || null, new Date().toISOString(), report.id);

  res.json({ message: 'تم التعيين وتحديث الحالة' });
});

module.exports = router;
