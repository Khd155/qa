require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const rateLimit = require('express-rate-limit');

// ── Security check ────────────────────────────────────────────────
if (!process.env.JWT_SECRET) {
  console.error('⛔ JWT_SECRET غير محدد في .env — يرجى تعيينه قبل التشغيل');
  if (process.env.NODE_ENV === 'production') process.exit(1);
  else console.warn('⚠️  تشغيل تطويري بدون JWT_SECRET — غير آمن للإنتاج');
}

// Initialize DB first (creates tables + seeds)
require('./services/db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Rate limiting on auth
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'محاولات كثيرة، انتظر 15 دقيقة' },
}));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────────
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/users',   require('./routes/users'));
app.use('/api/reports', require('./routes/reports'));

// WhatsApp Webhook — standalone at /webhook
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe'
      && req.query['hub.verify_token'] === process.env.WA_VERIFY_TOKEN)
    return res.status(200).send(req.query['hub.challenge']);
  res.sendStatus(403);
});
app.post('/webhook', (req, res) => {
  console.log('[WA Webhook]', JSON.stringify(req.body).substring(0, 300));
  res.sendStatus(200);
});

// ── Global Error Handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'خطأ في الخادم'
      : err.message,
  });
});

// ── SPA Fallback ──────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log('\n🕌 ════════════════════════════════════════');
  console.log(`   نظام بلاغات المخيم — حج 1446هـ`);
  console.log(`   المنفذ: ${PORT}`);
  console.log(`   الرابط: http://localhost:${PORT}`);
  console.log(`   البيئة: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   واتساب: ${process.env.WA_PHONE_NUMBER_ID ? '✅ مُفعَّل' : '⚠️  محاكاة فقط'}`);
  console.log('🕌 ════════════════════════════════════════\n');
  console.log('   اليوزرات الافتراضية:');
  console.log('   admin       / Admin@1446  (مدير عام)');
  console.log('   men_manager / Men@1446   (مدير الرجال)');
  console.log('   women_mgr   / Women@1446 (مدير النساء)');
  console.log('   musab       / Pass@1446  (مشرف)\n');
});
