const axios = require('axios');

const BASE_URL = () =>
  `https://graph.facebook.com/v19.0/${process.env.WA_PHONE_NUMBER_ID}/messages`;

const HEADERS = () => ({
  Authorization:  `Bearer ${process.env.WA_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
});

const CAT_EMOJI = {
  التكييف:'❄️', الكهرباء:'⚡', النظافة:'🧹',
  مفقودات:'🔍', عربية:'♿', أخرى:'📌',
};

function formatPhone(raw) {
  let p = String(raw || '').replace(/[\s\-\(\)]/g, '');
  if (!p) return null;
  if (p.startsWith('+'))  p = p.slice(1);
  if (p.startsWith('0'))  p = '966' + p.slice(1);
  if (!p.startsWith('966')) p = '966' + p;
  return p;
}

async function sendText(phone, message) {
  const formatted = formatPhone(phone);
  if (!formatted) return null;

  if (!process.env.WA_PHONE_NUMBER_ID || !process.env.WA_ACCESS_TOKEN) {
    console.log(`[WA-MOCK] → ${formatted}: ${message.substring(0, 70)}...`);
    return { mock: true };
  }

  try {
    const { data } = await axios.post(BASE_URL(), {
      messaging_product: 'whatsapp',
      to:   formatted,
      type: 'text',
      text: { body: message },
    }, { headers: HEADERS(), timeout: 8000 });
    return data;
  } catch (err) {
    console.error(`[WA] ${formatted}:`, err.response?.data?.error?.message || err.message);
    return null;
  }
}

async function sendBulk(phones, message, delayMs = 300) {
  const results = [];
  for (const phone of phones) {
    if (!phone) continue;
    results.push(await sendText(phone, message));
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  }
  return results;
}

// ── Message templates ──────────────────────────────────────────────
function msgNewReport(report) {
  const sec = report.section === 'men' ? 'الرجال' : 'النساء';
  const pri = report.priority === 'urgent' ? '🚨 عاجل' : '🟡 عادي';
  return [
    `🕌 *نظام بلاغات المخيم*`,
    `━━━━━━━━━━━━━━`,
    `📢 *بلاغ جديد #${report.id}*`,
    `👤 المشرف: ${report.supervisor_name}`,
    `🏠 القسم: ${sec} | غرفة ${report.room}${report.bed ? ' / سرير ' + report.bed : ''}`,
    `${CAT_EMOJI[report.category] || '📌'} الفئة: ${report.category}`,
    `⚡ الأولوية: ${pri}`,
    `📝 ${report.description}`,
    `━━━━━━━━━━━━━━`,
    `🕐 ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`,
    `يرجى الدخول للنظام للمعالجة ✅`,
  ].join('\n');
}

function msgAck(report) {
  return [
    `✅ *تم استلام بلاغك #${report.id}*`,
    `━━━━━━━━━━━━━━`,
    `📝 ${report.description.substring(0, 100)}`,
    `━━━━━━━━━━━━━━`,
    `جاري إشعار المسؤولين وسيتم المعالجة فوراً 🚀`,
    `شكراً لتعاونك 🙏`,
  ].join('\n');
}

function msgClosed(report, note) {
  const lines = [
    `✅ *تم إغلاق البلاغ #${report.id}*`,
    `━━━━━━━━━━━━━━`,
    `📝 ${report.description.substring(0, 80)}`,
    `⏱ مدة المعالجة: ${report.response_mins || '—'} دقيقة`,
  ];
  if (note) lines.push(`💬 ملاحظة: ${note}`);
  lines.push(`━━━━━━━━━━━━━━`, `شكراً لمتابعتك 🙏`);
  return lines.join('\n');
}

module.exports = { sendText, sendBulk, msgNewReport, msgAck, msgClosed, formatPhone };
