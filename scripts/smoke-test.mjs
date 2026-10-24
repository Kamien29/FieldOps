/** Read-only production smoke test. Never creates users or changes records. */
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https:\/\/[^/]+$/.test(base)) {
  console.error('Usage: node scripts/smoke-test.mjs https://your-project.vercel.app');
  process.exit(2);
}
const checks = [
  { path: '/api/health', expected: 200, type: 'json', verify: x => x?.ok === true },
  { path: '/api/me', expected: 401, type: 'json', verify: x => x?.error === 'unauthorized' },
  { path: '/login', expected: 200, type: 'text', verify: x => /<html|<!doctype/i.test(x) },
  { path: '/profile', expected: 200, type: 'text', verify: x => /<html|<!doctype/i.test(x) },
];
let failed = 0;
for (const check of checks) {
  try {
    const response = await fetch(base + check.path, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const payload = check.type === 'json' ? await response.json() : await response.text();
    const ok = response.status === check.expected && check.verify(payload);
    console.log(`${ok ? 'OK' : 'FAIL'} ${check.path}: HTTP ${response.status}`);
    if (!ok) failed++;
  } catch (e) { failed++; console.log(`FAIL ${check.path}: ${e.message}`); }
}
if (failed) {
  console.error(`${failed} check(s) failed. Check Vercel Logs and environment variables.`);
  process.exitCode = 1;
} else console.log('Public routes and database connectivity passed the basic smoke test.');
