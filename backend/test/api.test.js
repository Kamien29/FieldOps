import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { seedIfEmpty, DEMO_PASSWORD } from '../src/seed.js';
import { createServer } from '../src/server.js';

let server, base, db, token, token2;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function call(method, path, { body, tok = token, key } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

before(async () => {
  db = openDb(':memory:');
  seedIfEmpty(db);
  server = createServer(db);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  token = (await call('POST', '/api/login', { tok: null, body: { email: 'jan@fieldops.local', password: DEMO_PASSWORD } })).json.token;
  token2 = (await call('POST', '/api/login', { tok: null, body: { email: 'anna@fieldops.local', password: DEMO_PASSWORD } })).json.token;
});
after(() => server.close());

test('login rejects bad password', async () => {
  const r = await call('POST', '/api/login', { tok: null, body: { email: 'jan@fieldops.local', password: 'x' } });
  assert.equal(r.status, 401);
});

test('requires auth and returns only own jobs', async () => {
  assert.equal((await call('GET', '/api/jobs', { tok: null })).status, 401);
  assert.equal((await call('GET', '/api/jobs', { tok: 'garbage.token' })).status, 401);
  const r = await call('GET', '/api/jobs');
  assert.equal(r.status, 200);
  assert.equal(r.json.jobs.length, 5);
  assert.ok(r.json.jobs.every((j) => j.id.startsWith('J-1')));
});

test('delta sync with since', async () => {
  const all = await call('GET', '/api/jobs');
  const none = await call('GET', `/api/jobs?since=${encodeURIComponent(new Date(Date.now() + 60000).toISOString())}`);
  assert.equal(none.json.jobs.length, 0);
  assert.ok(all.json.serverTime);
});

test("cannot touch another user's job", async () => {
  const r = await call('POST', '/api/jobs/J-2001/status', { body: { status: 'in_progress', baseVersion: 1 }, key: 'k-other-1' });
  assert.equal(r.status, 404);
});

test('status change bumps version; idempotent replay returns same result', async () => {
  const body = { status: 'in_progress', baseVersion: 1 };
  const a = await call('POST', '/api/jobs/J-1001/status', { body, key: 'idem-status-1' });
  assert.equal(a.status, 200);
  assert.equal(a.json.job.version, 2);
  const b = await call('POST', '/api/jobs/J-1001/status', { body, key: 'idem-status-1' });
  assert.equal(b.status, 200);
  assert.equal(b.json.job.version, 2); // not 3
  assert.equal(db.prepare("SELECT version FROM jobs WHERE id='J-1001'").get().version, 2);
});

test('requires Idempotency-Key and baseVersion', async () => {
  assert.equal((await call('POST', '/api/jobs/J-1001/status', { body: { status: 'done', baseVersion: 2 } })).status, 400);
  assert.equal((await call('POST', '/api/jobs/J-1001/status', { body: { status: 'done' }, key: 'k-nobase-1' })).status, 400);
  assert.equal((await call('POST', '/api/jobs/J-1001/status', { body: { status: 'bogus', baseVersion: 2 }, key: 'k-bad-st-1' })).status, 400);
});

test('stale baseVersion -> 409 with server copy; resend with new base succeeds', async () => {
  const stale = await call('POST', '/api/jobs/J-1001/status', { body: { status: 'done', baseVersion: 1 }, key: 'k-stale-1' });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error, 'conflict');
  assert.equal(stale.json.server.version, 2);
  // same key is NOT cached for 409, so "keep mine" can reuse it
  const ok = await call('POST', '/api/jobs/J-1001/status', { body: { status: 'done', baseVersion: 2 }, key: 'k-stale-1' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.job.status, 'done');
  assert.equal(ok.json.job.version, 3);
});

test('photo upload + report with signature, QR, location', async () => {
  const up = await call('POST', '/api/jobs/J-1002/photos', { body: { id: 'photo-0001-aaaa', mime: 'image/png', dataBase64: PNG } });
  assert.equal(up.status, 201);
  const again = await call('POST', '/api/jobs/J-1002/photos', { body: { id: 'photo-0001-aaaa', mime: 'image/png', dataBase64: PNG } });
  assert.equal(again.status, 200);

  const report = {
    note: 'Wymieniono pompę', lat: 50.04, lng: 21.99, deviceCode: 'DEV-42',
    signatureSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', photoIds: ['photo-0001-aaaa'], baseVersion: 1,
  };
  const r = await call('PUT', '/api/jobs/J-1002/report', { body: report, key: 'k-report-1' });
  assert.equal(r.status, 200);
  assert.equal(r.json.job.report.deviceCode, 'DEV-42');
  assert.deepEqual(r.json.job.report.photoIds, ['photo-0001-aaaa']);

  const img = await fetch(`${base}/api/photos/photo-0001-aaaa`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  const other = await fetch(`${base}/api/photos/photo-0001-aaaa`, { headers: { Authorization: `Bearer ${token2}` } });
  assert.equal(other.status, 404);
});

test('report validation: unknown photo, bad coords, missing note', async () => {
  const base1 = { note: 'x', baseVersion: 2 };
  assert.equal((await call('PUT', '/api/jobs/J-1002/report', { body: { ...base1, photoIds: ['nope-nope-nope'] }, key: 'k-v-1' })).status, 422);
  assert.equal((await call('PUT', '/api/jobs/J-1002/report', { body: { ...base1, lat: 200 }, key: 'k-v-2' })).status, 400);
  assert.equal((await call('PUT', '/api/jobs/J-1002/report', { body: { baseVersion: 2 }, key: 'k-v-3' })).status, 400);
});

test('invalid JSON and unknown route', async () => {
  const res = await fetch(base + '/api/login', { method: 'POST', body: '{oops' });
  assert.equal(res.status, 400);
  assert.equal((await call('GET', '/api/nothing')).status, 404);
});

// ---------------- Tydzień 1: rejestracja, sesja, zlecenia ----------------

const raw = (method, path, { body, headers = {} } = {}) =>
  fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const NEW_USER = { name: 'Ewa Test', email: 'Ewa.Test@Example.com', password: 'tajnehaslo1' };
const JOB_BODY = {
  title: 'Wymiana filtra', description: 'Filtr w centrali wentylacyjnej', customer: 'Klient Zeta',
  address: 'ul. Testowa 1, Rzeszów', scheduledAt: '2026-12-01T09:30:00.000Z',
};

test('register validates input and rejects duplicate e-mail', async () => {
  const bad = (b) => call('POST', '/api/register', { tok: null, body: b });
  assert.equal((await bad({ ...NEW_USER, name: '  ' })).json.error, 'invalid_name');
  assert.equal((await bad({ ...NEW_USER, email: 'nie-email' })).json.error, 'invalid_email');
  assert.equal((await bad({ ...NEW_USER, password: 'krotkie' })).json.error, 'invalid_password');
  assert.equal((await bad({ ...NEW_USER, password: 12345678 })).json.error, 'invalid_password');

  const ok = await bad(NEW_USER);
  assert.equal(ok.status, 201);
  assert.equal(ok.json.user.email, 'ewa.test@example.com'); // znormalizowany
  assert.ok(ok.json.token);
  assert.equal(JSON.stringify(ok.json).includes('password'), false);

  const dup = await bad({ ...NEW_USER, email: 'EWA.TEST@example.com' });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.error, 'email_taken');
});

test('password is stored hashed, never in plain text', () => {
  const row = db.prepare('SELECT password_hash FROM users WHERE email=?').get('ewa.test@example.com');
  assert.ok(row.password_hash.includes(':'));
  assert.equal(row.password_hash.includes(NEW_USER.password), false);
});

test('new user can log in and starts with an empty, isolated job list', async () => {
  const l = await call('POST', '/api/login', { tok: null, body: { email: 'ewa.test@example.com', password: NEW_USER.password } });
  assert.equal(l.status, 200);
  const jobs = await call('GET', '/api/jobs', { tok: l.json.token });
  assert.deepEqual(jobs.json.jobs, []);
});

test('session cookie: HttpOnly, works for /api/me, mutations need X-Requested-With, logout clears it', async () => {
  const res = await raw('POST', '/api/login', { body: { email: 'jan@fieldops.local', password: DEMO_PASSWORD } });
  const setCookie = res.headers.get('set-cookie');
  assert.match(setCookie, /fieldops_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(';')[0];

  const me = await raw('GET', '/api/me', { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, 'jan@fieldops.local');

  const noHeader = await raw('POST', '/api/jobs', { body: JOB_BODY, headers: { Cookie: cookie } });
  assert.equal(noHeader.status, 403);
  assert.equal((await noHeader.json()).error, 'csrf_blocked');
  const withHeader = await raw('POST', '/api/jobs', { body: JOB_BODY, headers: { Cookie: cookie, 'X-Requested-With': 'fieldops-web' } });
  assert.equal(withHeader.status, 201);

  const out = await raw('POST', '/api/logout');
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);

  assert.equal((await raw('GET', '/api/me')).status, 401);
  assert.equal((await raw('GET', '/api/me', { headers: { Cookie: 'fieldops_session=garbage.1.x' } })).status, 401);
});

test('create job: required fields validated, status forced to new, owned by creator', async () => {
  for (const field of ['title', 'description', 'customer', 'address', 'scheduledAt']) {
    const r = await call('POST', '/api/jobs', { body: { ...JOB_BODY, [field]: '' } });
    assert.equal(r.status, 400, field);
    assert.equal(r.json.error, `invalid_${field}`);
  }
  assert.equal((await call('POST', '/api/jobs', { body: { ...JOB_BODY, scheduledAt: 'wczoraj' } })).json.error, 'invalid_scheduledAt');
  assert.equal((await call('POST', '/api/jobs', { tok: null, body: JOB_BODY })).status, 401);

  const r = await call('POST', '/api/jobs', { body: { ...JOB_BODY, status: 'done' } });
  assert.equal(r.status, 201);
  assert.equal(r.json.job.status, 'new');
  assert.equal(r.json.job.version, 1);
  assert.equal(r.json.job.customer, 'Klient Zeta');
  assert.ok(r.json.job.createdAt);

  const mine = await call('GET', `/api/jobs/${r.json.job.id}`);
  assert.equal(mine.status, 200);
  assert.equal(mine.json.job.description, JOB_BODY.description);
  assert.equal((await call('GET', `/api/jobs/${r.json.job.id}`, { tok: token2 })).status, 404);
});

test('job details by id: other user and unknown id are 404', async () => {
  assert.equal((await call('GET', '/api/jobs/J-2001')).status, 404);
  assert.equal((await call('GET', '/api/jobs/J-NOPE')).status, 404);
  assert.equal((await call('GET', '/api/jobs/J-1001', { tok: null })).status, 401);
  assert.equal((await call('GET', '/api/jobs/J-1003')).json.job.status, 'in_progress');
});

test('pagination: totals, sort by date, bounds; no params keeps the mobile response shape', async () => {
  const all = await call('GET', '/api/jobs');
  assert.equal(all.json.pagination, undefined);
  const total = all.json.jobs.length;
  assert.ok(total >= 7);

  const p1 = await call('GET', '/api/jobs?page=1&limit=3');
  assert.equal(p1.status, 200);
  assert.equal(p1.json.jobs.length, 3);
  assert.deepEqual(p1.json.pagination, { page: 1, limit: 3, total, totalPages: Math.ceil(total / 3) });
  const dates = p1.json.jobs.map((j) => j.scheduledAt);
  assert.deepEqual(dates, [...dates].sort());

  const ids = new Set();
  for (let page = 1; page <= p1.json.pagination.totalPages; page++) {
    (await call('GET', `/api/jobs?page=${page}&limit=3`)).json.jobs.forEach((j) => ids.add(j.id));
  }
  assert.equal(ids.size, total); // brak duplikatów i pominięć między stronami

  const beyond = await call('GET', '/api/jobs?page=99&limit=3');
  assert.deepEqual(beyond.json.jobs, []);
  assert.equal(beyond.json.pagination.total, total);
  assert.equal((await call('GET', '/api/jobs?page=0')).json.error, 'invalid_page');
  assert.equal((await call('GET', '/api/jobs?limit=101')).json.error, 'invalid_limit');
  assert.equal((await call('GET', '/api/jobs?limit=abc')).json.error, 'invalid_limit');
});
