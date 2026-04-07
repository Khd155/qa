const jwt = require('jsonwebtoken');

const HIERARCHY = { supervisor: 1, section_manager: 2, general_manager: 3 };

function auth(minRole = null) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
      return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });

    const token = header.split(' ')[1];
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_set_in_env');
      req.user = payload;

      if (!process.env.JWT_SECRET) {
        console.error('[SECURITY] JWT_SECRET not set in environment!');
        return res.status(500).json({ error: 'إعداد الخادم غير مكتمل' });
      }

      if (minRole) {
        const userLevel = HIERARCHY[payload.role] || 0;
        const reqLevel  = HIERARCHY[minRole]       || 0;
        if (userLevel < reqLevel)
          return res.status(403).json({ error: 'صلاحيات غير كافية' });
      }
      next();
    } catch (err) {
      const msg = err.name === 'TokenExpiredError' ? 'انتهت الجلسة' : 'رمز غير صالح';
      res.status(401).json({ error: msg });
    }
  };
}

module.exports = auth;
