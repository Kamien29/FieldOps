import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { one, all, query, transaction } from './db.js';
import { TOKEN_TTL_SECONDS, hashPassword, signToken, verifyPassword, verifyToken } from './auth.js';

const MAX_BODY = 15 * 1024 * 1024;
const MAX_PHOTO = 10 * 1024 * 1024;
const STATUSES = ['new', 'in_progress', 'done'];
const MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_COOKIE = 'fieldops_session';
const error = (status, code, extra = {}) => Object.assign(new Error(code), { status, code, extra });

async function readJson(req) {
  // Vercel sometimes pre-parses JSON bodies; still cap the received payload.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      if (Buffer.byteLength(JSON.stringify(req.body)) > MAX_BODY) throw error(413, 'payload_too_large');
      return req.body;
    }
    const data = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    if (Buffer.byteLength(data) > MAX_BODY) throw error(413, 'payload_too_large');
    try { return JSON.parse(data); } catch { throw error(400, 'invalid_json'); }
  }
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let exceeded = false;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) exceeded = true; else chunks.push(c); });
    req.on('end', () => {
      if (exceeded) return reject(error(413, 'payload_too_large'));
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(error(400, 'invalid_json')); }
    });
    req.on('error', reject);
  });
}
function cookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return '';
}
function sessionCookie(req, token, maxAge = TOKEN_TTL_SECONDS) {
  const secure = process.env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
function send(res, status, body, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
const required = (value, max, field) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw error(400, `invalid_${field}`);
  return value.trim();
};
const optionalText = (value, max, field) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > max) throw error(400, `invalid_${field}`);
  return value;
};
const optionalNumber = (value, min, max, field) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw error(400, `invalid_${field}`);
  return value;
};
const now = () => new Date().toISOString();
async function jobJson(row, db) {
  const report = await one('SELECT * FROM reports WHERE job_id=$1', [row.id], db);
  return {
    id: row.id, title: row.title, description: row.description ?? '', customer: row.customer,
    address: row.address, scheduledAt: row.scheduled_at, status: row.status, version: row.version,
    createdAt: row.created_at || null, updatedAt: row.updated_at,
    report: report ? {
      note: report.note, lat: report.lat, lng: report.lng, deviceCode: report.device_code,
      signatureSvg: report.signature_svg, photoIds: JSON.parse(report.photo_ids), updatedAt: report.updated_at,
    } : null,
  };
}
async function jobJsonList(rows, db) { return Promise.all(rows.map(r => jobJson(r, db))); }
async function ownedJob(jobId, userId, db, lock = false) {
  const row = await one(`SELECT * FROM jobs WHERE id=$1 AND assigned_to=$2${lock ? ' FOR UPDATE' : ''}`, [jobId, userId], db);
  if (!row) throw error(404, 'job_not_found');
  return row;
}
async function checkVersion(row, body, db) {
  if (!Number.isInteger(body.baseVersion)) throw error(400, 'baseVersion_required');
  if (row.version !== body.baseVersion) throw error(409, 'conflict', { server: await jobJson(row, db) });
}
async function touchJob(id, client, status) {
  const t = now();
  if (status) {
    await query('UPDATE jobs SET status=$1, version=version+1, updated_at=$2 WHERE id=$3', [status, t, id], client);
  } else {
    await query('UPDATE jobs SET version=version+1, updated_at=$1 WHERE id=$2', [t, id], client);
  }
  return one('SELECT * FROM jobs WHERE id=$1', [id], client);
}
async function idempotent(req, userId, fn) {
  const raw = req.headers['idempotency-key'];
  if (!raw || typeof raw !== 'string' || raw.length > 100) throw error(400, 'idempotency_key_required');
  const key = `${userId}:${raw}`;
  return transaction(async (client) => {
    // Serializes duplicates even when two requests reach different Vercel functions.
    await query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key], client);
    const previous = await one('SELECT status, body FROM idempotency WHERE key=$1', [key], client);
    if (previous) return { status: previous.status, body: JSON.parse(previous.body) };
    const result = await fn(client);
    await query('INSERT INTO idempotency (key, status, body, created_at) VALUES ($1,$2,$3,$4)',
      [key, result.status, JSON.stringify(result.body), now()], client);
    return result;
  });
}

async function route(req, res) {
  const parsed = new URL(req.url, 'http://localhost');
  const p = parsed.pathname; const m = req.method;
  if (m === 'GET' && (p === '/api/health' || p === '/health')) {
    await query('SELECT 1');
    return send(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/login') {
    const { email, password } = await readJson(req);
    if (typeof email !== 'string' || typeof password !== 'string') throw error(400, 'invalid_credentials_format');
    const user = await one('SELECT * FROM users WHERE email=$1', [email.trim().toLowerCase()]);
    if (!user || !verifyPassword(password, user.password_hash)) throw error(401, 'invalid_credentials');
    const token = signToken(user.id);
    return send(res, 200, { token, user: { id: user.id, name: user.name, email: user.email } }, { 'Set-Cookie': sessionCookie(req, token) });
  }
  if (m === 'POST' && p === '/api/register') {
    const body = await readJson(req);
    const name = required(body.name, 100, 'name');
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email) || email.length > 254) throw error(400, 'invalid_email');
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 200) throw error(400, 'invalid_password');
    const id = `u-${randomUUID()}`;
    try {
      await query('INSERT INTO users(id, email, name, password_hash) VALUES($1,$2,$3,$4)', [id, email, name, hashPassword(body.password)]);
    } catch (err) {
      if (err.code === '23505') throw error(409, 'email_taken');
      throw err;
    }
    const token = signToken(id);
    return send(res, 201, { token, user: { id, name, email } }, { 'Set-Cookie': sessionCookie(req, token) });
  }
  if (m === 'POST' && p === '/api/logout') {
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }
  const bearerHeader = req.headers.authorization || '';
  const bearer = bearerHeader.startsWith('Bearer ') ? bearerHeader.slice(7) : '';
  const cookieToken = bearer ? '' : cookie(req, SESSION_COOKIE);
  const userId = verifyToken(bearer || cookieToken);
  if (!userId || !await one('SELECT 1 FROM users WHERE id=$1', [userId])) throw error(401, 'unauthorized');
  if (cookieToken && m !== 'GET' && m !== 'HEAD' && req.headers['x-requested-with'] !== 'fieldops-web') throw error(403, 'csrf_blocked');

  if (m === 'GET' && p === '/api/me') {
    const user = await one('SELECT id,name,email FROM users WHERE id=$1', [userId]);
    return send(res, 200, { user });
  }
  if (m === 'GET' && p === '/api/jobs') {
    const serverTime = now();
    const since = parsed.searchParams.get('since') || '';
    const pageParam = parsed.searchParams.get('page');
    const limitParam = parsed.searchParams.get('limit');
    if (pageParam !== null || limitParam !== null) {
      const page = pageParam === null ? 1 : Number(pageParam);
      const limit = limitParam === null ? 10 : Number(limitParam);
      if (!Number.isSafeInteger(page) || page < 1) throw error(400, 'invalid_page');
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw error(400, 'invalid_limit');
      const count = await one('SELECT COUNT(*)::integer AS total FROM jobs WHERE assigned_to=$1 AND updated_at >= $2', [userId, since]);
      const rows = await all('SELECT * FROM jobs WHERE assigned_to=$1 AND updated_at >= $2 ORDER BY scheduled_at,id LIMIT $3 OFFSET $4', [userId, since, limit, (page - 1) * limit]);
      const total = count.total;
      return send(res, 200, { serverTime, jobs: await jobJsonList(rows), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
    }
    const rows = await all('SELECT * FROM jobs WHERE assigned_to=$1 AND updated_at >= $2 ORDER BY scheduled_at,id', [userId, since]);
    return send(res, 200, { serverTime, jobs: await jobJsonList(rows) });
  }
  if (m === 'POST' && p === '/api/jobs') {
    const body = await readJson(req);
    const title = required(body.title, 200, 'title');
    const description = required(body.description, 5000, 'description');
    const customer = required(body.customer, 200, 'customer');
    const address = required(body.address, 300, 'address');
    const date = typeof body.scheduledAt === 'string' ? new Date(body.scheduledAt) : null;
    if (!date || !Number.isFinite(date.getTime()) || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) throw error(400, 'invalid_scheduledAt');
    const id = `J-${randomBytes(6).toString('hex').toUpperCase()}`; const t = now();
    await query(`INSERT INTO jobs(id,assigned_to,title,customer,address,scheduled_at,description,status,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id,userId,title,customer,address,date.toISOString(),description,'new',t,t]);
    return send(res, 201, { job: await jobJson(await one('SELECT * FROM jobs WHERE id=$1', [id])) });
  }
  let mt;
  if (m === 'GET' && (mt = p.match(/^\/api\/jobs\/([^/]+)$/))) {
    return send(res, 200, { job: await jobJson(await ownedJob(mt[1], userId)) });
  }
  if (m === 'POST' && (mt = p.match(/^\/api\/jobs\/([^/]+)\/status$/))) {
    const body = await readJson(req);
    const result = await idempotent(req, userId, async (client) => {
      const row = await ownedJob(mt[1], userId, client, true);
      if (!STATUSES.includes(body.status)) throw error(400, 'invalid_status');
      await checkVersion(row, body, client);
      return { status: 200, body: { job: await jobJson(await touchJob(row.id, client, body.status), client) } };
    });
    return send(res, result.status, result.body);
  }
  if (m === 'PUT' && (mt = p.match(/^\/api\/jobs\/([^/]+)\/report$/))) {
    const body = await readJson(req);
    const result = await idempotent(req, userId, async (client) => {
      const row = await ownedJob(mt[1], userId, client, true);
      const note = optionalText(body.note, 10000, 'note');
      if (note === null) throw error(400, 'invalid_note');
      const lat = optionalNumber(body.lat, -90, 90, 'lat');
      const lng = optionalNumber(body.lng, -180, 180, 'lng');
      const device = optionalText(body.deviceCode, 200, 'deviceCode');
      const signature = optionalText(body.signatureSvg, 200000, 'signatureSvg');
      const ids = body.photoIds ?? [];
      if (!Array.isArray(ids) || ids.length > 50 || ids.some(i => typeof i !== 'string')) throw error(400, 'invalid_photoIds');
      for (const id of ids) {
        if (!await one('SELECT 1 FROM photos WHERE id=$1 AND job_id=$2', [id,row.id], client)) throw error(422, 'unknown_photo', { photoId: id });
      }
      await checkVersion(row, body, client);
      await query(`INSERT INTO reports(job_id,note,lat,lng,device_code,signature_svg,photo_ids,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(job_id) DO UPDATE
        SET note=EXCLUDED.note,lat=EXCLUDED.lat,lng=EXCLUDED.lng,device_code=EXCLUDED.device_code,
            signature_svg=EXCLUDED.signature_svg,photo_ids=EXCLUDED.photo_ids,updated_at=EXCLUDED.updated_at`,
      [row.id,note,lat,lng,device,signature,JSON.stringify(ids),now()], client);
      return { status: 200, body: { job: await jobJson(await touchJob(row.id, client), client) } };
    });
    return send(res, result.status, result.body);
  }
  if (m === 'POST' && (mt = p.match(/^\/api\/jobs\/([^/]+)\/photos$/))) {
    const body = await readJson(req);
    const row = await ownedJob(mt[1], userId);
    if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw error(400, 'invalid_photo_id');
    if (!MIMES.includes(body.mime)) throw error(400, 'invalid_mime');
    if (typeof body.dataBase64 !== 'string' || !body.dataBase64 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.dataBase64)) throw error(400,'invalid_data');
    const data = Buffer.from(body.dataBase64,'base64');
    if (!data.length) throw error(400, 'invalid_data');
    if (data.length > MAX_PHOTO) throw error(413, 'payload_too_large');
    const existing = await one('SELECT job_id FROM photos WHERE id=$1', [body.id]);
    if (existing && existing.job_id !== row.id) throw error(409, 'id_taken');
    if (!existing) {
      try { await query('INSERT INTO photos(id,job_id,mime,data,created_at) VALUES($1,$2,$3,$4,$5)', [body.id,row.id,body.mime,data,now()]); }
      catch (err) {
        if (err.code !== '23505') throw err;
        const conflict = await one('SELECT job_id FROM photos WHERE id=$1', [body.id]);
        if (!conflict || conflict.job_id !== row.id) throw error(409,'id_taken');
        return send(res, 200, { id: body.id });
      }
    }
    return send(res, existing ? 200 : 201, { id: body.id });
  }
  if (m === 'GET' && (mt = p.match(/^\/api\/photos\/([^/]+)$/))) {
    const ph = await one('SELECT p.mime,p.data FROM photos p JOIN jobs j ON j.id=p.job_id WHERE p.id=$1 AND j.assigned_to=$2', [mt[1],userId]);
    if (!ph) throw error(404,'photo_not_found');
    res.writeHead(200, { 'Content-Type': ph.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(ph.data);
  }
  throw error(404,'not_found');
}
export async function handleRequest(req, res) {
  try { await route(req, res); }
  catch (e) {
    if (e.status) return send(res, e.status, { error: e.code, ...e.extra });
    console.error('FieldOps API request failed', e);
    send(res, 500, { error: 'internal_error' });
  }
}
export function createServer() { return http.createServer(handleRequest); }
