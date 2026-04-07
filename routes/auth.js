const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../services/db');
const authMW  = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password)
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });

  const user = db.prepare(
    'SELECT * FROM users WHERE username = ? AND active = 1'
  ).get(username);

  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

  const token = jwt.sign(
    { id: user.id, name: user.name, role: user.role, section: user.section },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, role: user.role, section: user.section },
  });
});

// GET /api/auth/me
router.get('/me', authMW(), (req, res) => {
  const user = db.prepare(
    'SELECT id,name,username,role,section,phone,wa_notify,active FROM users WHERE id=?'
  ).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json(user);
});

module.exports = router;
