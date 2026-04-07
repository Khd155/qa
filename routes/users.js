const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../services/db');
const auth    = require('../middleware/auth');

const router = express.Router();

// GET /api/users
router.get('/', auth('section_manager'), (req, res) => {
  const { role, section } = req.user;
  let query  = 'SELECT id,name,username,role,section,phone,wa_notify,active,created_at FROM users';
  const params = [];

  if (role === 'section_manager') {
    query += ' WHERE section = ? OR section = "both"';
    params.push(section);
  }
  query += ' ORDER BY CASE role WHEN "general_manager" THEN 1 WHEN "section_manager" THEN 2 ELSE 3 END, name';

  res.json(db.prepare(query).all(...params));
});

// POST /api/users
router.post('/', auth('general_manager'), (req, res) => {
  const { name, username, password, role, section, phone, wa_notify } = req.body || {};

  if (!name || !username || !password || !role)
    return res.status(400).json({ error: 'الحقول الإلزامية: name, username, password, role' });

  const validRoles = ['supervisor', 'section_manager', 'general_manager'];
  if (!validRoles.includes(role))
    return res.status(400).json({ error: 'دور غير صالح' });

  try {
    const result = db.prepare(`
      INSERT INTO users (name, username, password, role, section, phone, wa_notify)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, username,
      bcrypt.hashSync(password, 10),
      role, section || 'both',
      phone || '', wa_notify !== undefined ? (wa_notify ? 1 : 0) : 1
    );
    res.status(201).json({ id: result.lastInsertRowid, message: 'تم إنشاء المستخدم' });
  } catch (e) {
    if (e.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
    res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
  }
});

// PUT /api/users/:id
router.put('/:id', auth('general_manager'), (req, res) => {
  const { name, phone, role, section, wa_notify, active, password } = req.body || {};
  const sets = [], vals = [];

  if (name      !== undefined) { sets.push('name=?');      vals.push(name); }
  if (phone     !== undefined) { sets.push('phone=?');     vals.push(phone); }
  if (role      !== undefined) { sets.push('role=?');      vals.push(role); }
  if (section   !== undefined) { sets.push('section=?');   vals.push(section); }
  if (wa_notify !== undefined) { sets.push('wa_notify=?'); vals.push(wa_notify ? 1 : 0); }
  if (active    !== undefined) { sets.push('active=?');    vals.push(active ? 1 : 0); }
  if (password)                { sets.push('password=?');  vals.push(bcrypt.hashSync(password, 10)); }

  if (!sets.length)
    return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });

  vals.push(req.params.id);
  db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).run(...vals);
  res.json({ message: 'تم التحديث' });
});

// DELETE /api/users/:id (soft delete)
router.delete('/:id', auth('general_manager'), (req, res) => {
  const targetId = Number(req.params.id);

  if (targetId === req.user.id)
    return res.status(400).json({ error: 'لا يمكنك تعطيل حسابك الخاص' });

  db.prepare('UPDATE users SET active=0 WHERE id=?').run(targetId);
  res.json({ message: 'تم تعطيل المستخدم' });
});

module.exports = router;
