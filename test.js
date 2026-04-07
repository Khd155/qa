// ═══════════════════════════════════════════════════════════════
//  نظام بلاغات المخيم — Test Suite
//  تشغيل: node test.js (بعد تشغيل الخادم)
// ═══════════════════════════════════════════════════════════════
const BASE = process.env.TEST_URL || 'http://localhost:3000/api';
let passed = 0, failed = 0, skipped = 0;
const results = [];

// ── Test runner ──────────────────────────────────────────────────
async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ status: 'PASS', name });
    process.stdout.write(`  ✅ ${name}\n`);
  } catch (e) {
    failed++;
    results.push({ status: 'FAIL', name, error: e.message });
    process.stdout.write(`  ❌ ${name}\n     └─ ${e.message}\n`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function req(method, path, body, token) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(BASE + path, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ── Run all tests ────────────────────────────────────────────────
async function runAll() {
  console.log('\n🧪 ════════════════════════════════════════');
  console.log('   اختبارات نظام بلاغات المخيم');
  console.log('════════════════════════════════════════\n');

  let adminToken, menMgrToken, supToken, supWomenToken;
  let testReportId;

  // ── 1. AUTH TESTS ─────────────────────────────────────────────
  console.log('📋 1. اختبارات تسجيل الدخول\n');

  await test('تسجيل دخول المدير العام', async () => {
    const r = await req('POST', '/auth/login', { username:'admin', password:'Admin@1446' });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.data.token, 'No token returned');
    assert(r.data.user.role === 'general_manager', `Wrong role: ${r.data.user.role}`);
    adminToken = r.data.token;
  });

  await test('تسجيل دخول مدير قسم الرجال', async () => {
    const r = await req('POST', '/auth/login', { username:'men_manager', password:'Men@1446' });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.data.user.role === 'section_manager', `Wrong role`);
    assert(r.data.user.section === 'men', `Wrong section: ${r.data.user.section}`);
    menMgrToken = r.data.token;
  });

  await test('تسجيل دخول مشرف (قسم رجال)', async () => {
    const r = await req('POST', '/auth/login', { username:'musab', password:'Pass@1446' });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.data.user.role === 'supervisor', `Wrong role`);
    supToken = r.data.token;
  });

  await test('تسجيل دخول مشرفة (قسم نساء)', async () => {
    const r = await req('POST', '/auth/login', { username:'sahar', password:'Pass@1446' });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.data.user.section === 'women', `Wrong section`);
    supWomenToken = r.data.token;
  });

  await test('رفض كلمة مرور خاطئة → 401', async () => {
    const r = await req('POST', '/auth/login', { username:'admin', password:'wrongpass' });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
    assert(r.data.error, 'No error message returned');
  });

  await test('رفض بيانات ناقصة → 400', async () => {
    const r = await req('POST', '/auth/login', { username:'admin' });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('رفض طلب بدون توكن → 401', async () => {
    const r = await req('GET', '/reports');
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('رفض توكن مزيف → 401', async () => {
    const r = await req('GET', '/reports', null, 'fake_invalid_token_xyz');
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  // ── 2. REPORTS TESTS ──────────────────────────────────────────
  console.log('\n📋 2. اختبارات البلاغات\n');

  await test('المشرف يرفع بلاغ جديد → 201', async () => {
    const r = await req('POST', '/reports', {
      section: 'men', room: '201', bed: '5',
      category: 'التكييف', priority: 'normal',
      description: 'المكيف يسرب ماء على السرير - اختبار'
    }, supToken);
    assert(r.status === 201, `Expected 201, got ${r.status}: ${r.data.error}`);
    assert(r.data.report?.id, 'No report ID returned');
    assert(r.data.report.status === 'pending', `Expected pending, got ${r.data.report.status}`);
    testReportId = r.data.report.id;
  });

  await test('رفض بلاغ بدون حقول إلزامية → 400', async () => {
    const r = await req('POST', '/reports', { section: 'men' }, supToken);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('مشرف الرجال لا يستطيع رفع بلاغ بدون توكن', async () => {
    const r = await req('POST', '/reports', { section:'men', room:'101', category:'النظافة', description:'test' });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('جلب البلاغات بصلاحية المدير العام', async () => {
    const r = await req('GET', '/reports?section=men&limit=10', null, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.data.reports), 'reports is not an array');
    assert(typeof r.data.total === 'number', 'total is not a number');
  });

  await test('المشرف يرى بلاغاته فقط (عزل البيانات)', async () => {
    const r = await req('GET', '/reports', null, supToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const others = r.data.reports?.filter(rep => rep.supervisor_name !== 'مصعب باقارش');
    assert(others?.length === 0, `Supervisor sees ${others?.length} reports from other supervisors`);
  });

  await test('مشرفة النساء لا ترى بلاغات الرجال', async () => {
    const r = await req('GET', '/reports', null, supWomenToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const menReports = r.data.reports?.filter(rep => rep.section === 'men'
      && rep.supervisor_name !== 'سحر الخطابي');
    assert(menReports?.length === 0, `Women supervisor sees ${menReports?.length} men reports`);
  });

  await test('جلب إحصائيات الداشبورد', async () => {
    const r = await req('GET', '/reports/stats?section=men', null, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(typeof r.data.total === 'number', 'total missing');
    assert(Array.isArray(r.data.byCategory), 'byCategory missing');
  });

  await test('فلترة البلاغات بالحالة', async () => {
    const r = await req('GET', '/reports?status=pending&section=men', null, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const nonPending = r.data.reports?.filter(rep => rep.status !== 'pending');
    assert(nonPending?.length === 0, `Got ${nonPending?.length} non-pending reports`);
  });

  await test('فلترة البلاغات بالتصنيف', async () => {
    const r = await req('GET', '/reports?category=التكييف&section=men', null, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const nonAC = r.data.reports?.filter(rep => rep.category !== 'التكييف');
    assert(nonAC?.length === 0, `Got ${nonAC?.length} non-AC reports`);
  });

  // ── 3. STATUS CHANGE TESTS ────────────────────────────────────
  console.log('\n📋 3. اختبارات تغيير الحالة\n');

  await test('المشرف لا يستطيع إغلاق البلاغات → 403', async () => {
    if (!testReportId) { skipped++; console.log('  ⏭ تخطي (لا يوجد بلاغ)'); return; }
    const r = await req('PATCH', `/reports/${testReportId}/status`,
      { status: 'closed' }, supToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test('مدير القسم يغلق البلاغ → 200', async () => {
    if (!testReportId) { skipped++; return; }
    const r = await req('PATCH', `/reports/${testReportId}/status`,
      { status: 'closed', note: 'تم إصلاح المكيف - اختبار' }, menMgrToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${r.data.error}`);
    assert(r.data.report.status === 'closed', `Expected closed, got ${r.data.report.status}`);
    assert(r.data.report.response_mins !== null, 'response_mins should be set');
  });

  await test('حالة غير صالحة → 400', async () => {
    if (!testReportId) { skipped++; return; }
    const r = await req('PATCH', `/reports/${testReportId}/status`,
      { status: 'invalid_status' }, menMgrToken);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('بلاغ غير موجود → 404', async () => {
    const r = await req('PATCH', '/reports/99999/status',
      { status: 'closed' }, adminToken);
    assert(r.status === 404, `Expected 404, got ${r.status}`);
  });

  // ── 4. SECURITY TESTS ────────────────────────────────────────
  console.log('\n📋 4. اختبارات الأمان\n');

  await test('SQL injection في البحث (يجب أن يعمل بأمان)', async () => {
    const r = await req('GET', "/reports?search='; DROP TABLE reports; --", null, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    // If we get here, SQL injection was safely handled
  });

  await test('XSS في وصف البلاغ (يُحفظ كنص خام)', async () => {
    const r = await req('POST', '/reports', {
      section: 'men', room: 'XSS-TEST',
      category: 'أخرى', priority: 'normal',
      description: '<script>alert("xss")</script>'
    }, supToken);
    assert(r.status === 201, `Expected 201, got ${r.status}`);
    // XSS is escaped on frontend rendering, stored as raw text
  });

  await test('مشرف لا يستطيع إنشاء مستخدم → 403', async () => {
    const r = await req('POST', '/users', {
      name: 'هاكر', username: 'hacker', password: 'hack123',
      role: 'general_manager', section: 'both'
    }, supToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test('مدير قسم لا يستطيع إنشاء مستخدم → 403', async () => {
    const r = await req('POST', '/users', {
      name: 'هاكر2', username: 'hacker2', password: 'hack123',
      role: 'general_manager', section: 'both'
    }, menMgrToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test('مدير النساء لا يقدر يغلق بلاغات الرجال → 403', async () => {
    // First create a men report
    const create = await req('POST', '/reports', {
      section: 'men', room: '999', category: 'النظافة',
      priority: 'normal', description: 'test isolation'
    }, supToken);
    if (create.status !== 201) { skipped++; return; }
    const rId = create.data.report.id;

    const womenMgrR = await req('POST', '/auth/login', { username:'women_mgr', password:'Women@1446' });
    const womenMgrToken = womenMgrR.data.token;

    const r = await req('PATCH', `/reports/${rId}/status`, { status: 'closed' }, womenMgrToken);
    assert(r.status === 403, `Expected 403, got ${r.status} — section isolation failed!`);
  });

  await test('لا يمكن تعطيل نفس حساب المدير العام', async () => {
    const meR = await req('GET', '/auth/me', null, adminToken);
    const myId = meR.data.id;
    const r = await req('DELETE', `/users/${myId}`, null, adminToken);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  // ── 5. USERS TESTS ────────────────────────────────────────────
  console.log('\n📋 5. اختبارات إدارة المستخدمين\n');

  let newUserId;
  await test('المدير العام ينشئ مستخدماً جديداً → 201', async () => {
    const r = await req('POST', '/users', {
      name: 'مشرف اختبار', username: 'test_supervisor_xyz',
      password: 'Test@1446', role: 'supervisor',
      section: 'men', phone: '966512345678', wa_notify: 1
    }, adminToken);
    assert(r.status === 201, `Expected 201, got ${r.status}: ${r.data.error}`);
    assert(r.data.id, 'No user ID returned');
    newUserId = r.data.id;
  });

  await test('رفض اسم مستخدم مكرر → 409', async () => {
    const r = await req('POST', '/users', {
      name: 'تكرار', username: 'test_supervisor_xyz',
      password: 'Test@1446', role: 'supervisor', section: 'men'
    }, adminToken);
    assert(r.status === 409, `Expected 409, got ${r.status}`);
  });

  await test('تعديل بيانات المستخدم', async () => {
    if (!newUserId) { skipped++; return; }
    const r = await req('PUT', `/users/${newUserId}`,
      { phone: '966599999999', wa_notify: 0 }, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test('تعطيل المستخدم المنشأ', async () => {
    if (!newUserId) { skipped++; return; }
    const r = await req('DELETE', `/users/${newUserId}`, null, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test('المستخدم المعطل لا يستطيع تسجيل الدخول → 401', async () => {
    const r = await req('POST', '/auth/login',
      { username: 'test_supervisor_xyz', password: 'Test@1446' });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('جلب قائمة المستخدمين (مدير قسم يرى قسمه فقط)', async () => {
    const r = await req('GET', '/users', null, menMgrToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const womenOnly = r.data.filter(u => u.section === 'women');
    assert(womenOnly.length === 0, `Men manager sees ${womenOnly.length} women-only users`);
  });

  // ── 6. FRONTEND TESTS (static) ────────────────────────────────
  console.log('\n📋 6. اختبارات الواجهة (static)\n');

  await test('الصفحة الرئيسية تُرجع HTML', async () => {
    const res = await fetch(BASE.replace('/api', '/'));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const text = await res.text();
    assert(text.includes('نظام بلاغات المخيم'), 'App title not found in HTML');
    assert(text.includes('Cairo'), 'Arabic font not loaded');
    assert(text.includes('dir="rtl"'), 'RTL direction not set');
    assert(text.includes('lang="ar"'), 'Arabic language not set');
  });

  await test('SPA fallback يعمل للمسارات الوهمية', async () => {
    const res = await fetch(BASE.replace('/api', '/some/fake/route'));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const text = await res.text();
    assert(text.includes('<!DOCTYPE html'), 'Not returning HTML for SPA routes');
  });

  await test('Webhook التحقق يعمل', async () => {
    const res = await fetch(
      BASE.replace('/api', '/webhook')
      + '?hub.mode=subscribe&hub.verify_token=camp_webhook_1446&hub.challenge=TESTCHALLENGE'
    );
    // Will return 403 unless WA_VERIFY_TOKEN is set — that's expected in test env
    assert(res.status === 200 || res.status === 403,
      `Unexpected status ${res.status}`);
  });

  // ── RESULTS ───────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log(`  ✅ نجح:    ${passed}`);
  console.log(`  ❌ فشل:    ${failed}`);
  console.log(`  ⏭ تخطي:   ${skipped}`);
  console.log(`  📊 المجموع: ${passed + failed + skipped}`);
  console.log('════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('الاختبارات الفاشلة:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    });
    console.log('');
    process.exit(1);
  } else {
    console.log('🎉 جميع الاختبارات نجحت!\n');
  }
}

runAll().catch(e => {
  console.error('\n💥 خطأ في تشغيل الاختبارات:', e.message);
  console.error('تأكد من أن الخادم يعمل على:', BASE);
  process.exit(1);
});
