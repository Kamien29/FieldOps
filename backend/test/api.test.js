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
