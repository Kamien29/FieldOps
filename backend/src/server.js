import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { one, all, query, transaction } from './db.js';
import { TOKEN_TTL_SECONDS, hashPassword, signToken, verifyPassword, verifyToken } from './auth.js';
import {
  decodePhotoUpload, MAX_PHOTO_BYTES_PER_JOB, MAX_PHOTOS_PER_JOB,
} from './report-validation.js';
import { createReport } from './report-service.js';

const MAX_BODY = 15 * 1024 * 1024;
const STATUSES = ['new', 'in_progress', 'done', 'cancelled'];
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
const now = () => new Date().toISOString();
async function jobJson(row, db) {
  const report = await one('SELECT * FROM reports WHERE job_id=$1', [row.id], db);
  return {
    id: row.id, title: row.title, description: row.description ?? '', customer: row.customer,
    address: row.address, scheduledAt: row.scheduled_at, status: row.status, version: row.version,
    deviceId: row.device_id ?? null,
    createdAt: row.created_at || null, updatedAt: row.updated_at,
    report: report ? {
      note: report.note, lat: report.lat, lng: report.lng,
      locationAccuracy: report.location_accuracy, deviceCode: report.device_code,
      recipientFullName: report.recipient_full_name, signatureSvg: report.signature_svg,
      photoIds: JSON.parse(report.photo_ids), createdAt: report.created_at,
      completedAt: report.completed_at, updatedAt: report.updated_at,
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
  if (m === 'PATCH' && p === '/api/me') {
    const body = await readJson(req);
    const name = required(body.name, 100, 'name');
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email) || email.length > 254) throw error(400, 'invalid_email');
    const wantsPasswordChange = body.newPassword !== undefined && body.newPassword !== '';
    if (body.newPassword !== undefined && typeof body.newPassword !== 'string') throw error(400, 'invalid_password');
    if (wantsPasswordChange && (body.newPassword.length < 8 || body.newPassword.length > 200)) {
      throw error(400, 'invalid_password');
    }
    const updatedUser = await transaction(async (client) => {
      const current = await one('SELECT id,name,email,password_hash FROM users WHERE id=$1 FOR UPDATE', [userId], client);
      if (!current) throw error(401, 'unauthorized');
      const emailChanged = email !== current.email;
      // Re-authenticate sensitive account changes, not only new password changes.
      if ((emailChanged || wantsPasswordChange) &&
          (typeof body.currentPassword !== 'string' ||
           !verifyPassword(body.currentPassword, current.password_hash))) {
        throw error(403, 'invalid_current_password');
      }
      const passwordHash = wantsPasswordChange ? hashPassword(body.newPassword) : current.password_hash;
      try {
        await query('UPDATE users SET name=$1,email=$2,password_hash=$3 WHERE id=$4',
          [name,email,passwordHash,userId],client);
      } catch (e) {
        if (e.code === '23505') throw error(409, 'email_taken');
        throw e;
      }
      return {id:userId,name,email};
    });
    return send(res, 200, {user:updatedUser});
  }

  // Device registry: all reads and writes are scoped to the authenticated user.
  if (m === 'GET' && p === '/api/devices') {
    const devices = await all('SELECT id,serial,name,model,location,created_at,updated_at FROM devices WHERE user_id=$1 ORDER BY LOWER(name), id', [userId]);
    return send(res, 200, { devices });
  }
  if (m === 'GET' && p === '/api/devices/identify') {
    const serial = (parsed.searchParams.get('serial') || '').trim();
    if (!serial || serial.length > 200) throw error(400, 'invalid_serial');
    const device = await one('SELECT id,serial,name,model,location FROM devices WHERE user_id=$1 AND LOWER(serial)=LOWER($2)', [userId, serial]);
    if (!device) throw error(404, 'device_not_found');
    return send(res, 200, { device });
  }
  if (m === 'POST' && p === '/api/devices') {
    const b = await readJson(req);
    const serial = required(b.serial, 200, 'serial');
    const name = required(b.name, 200, 'name');
    const model = optionalText(b.model, 200, 'model') ?? '';
    const location = optionalText(b.location, 300, 'location') ?? '';
    const id = `d-${randomUUID()}`, t = now();
    try {
      await query('INSERT INTO devices(id,user_id,serial,name,model,location,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id,userId,serial,name,model,location,t,t]);
    } catch (e) {
      if (e.code === '23505') throw error(409, 'serial_taken');
      throw e;
    }
    return send(res, 201, { device: await one('SELECT id,serial,name,model,location FROM devices WHERE id=$1', [id]) });
  }
  let deviceMatch;
  if (m === 'PATCH' && (deviceMatch = p.match(/^\/api\/devices\/([^/]+)$/))) {
    const b = await readJson(req);
    const result = await transaction(async (client) => {
      const old = await one('SELECT * FROM devices WHERE id=$1 AND user_id=$2 FOR UPDATE', [deviceMatch[1],userId], client);
      if (!old) throw error(404, 'device_not_found');
      const serial = b.serial === undefined ? old.serial : required(b.serial, 200, 'serial');
      const name = b.name === undefined ? old.name : required(b.name, 200, 'name');
      const model = b.model === undefined ? old.model : optionalText(b.model, 200, 'model') ?? '';
      const location = b.location === undefined ? old.location : optionalText(b.location, 300, 'location') ?? '';
      try {
        await query('UPDATE devices SET serial=$1,name=$2,model=$3,location=$4,updated_at=$5 WHERE id=$6 AND user_id=$7', [serial,name,model,location,now(),old.id,userId], client);
      } catch (e) {
        if (e.code === '23505') throw error(409, 'serial_taken');
        throw e;
      }
      return one('SELECT id,serial,name,model,location FROM devices WHERE id=$1', [old.id], client);
    });
    return send(res, 200, { device: result });
  }
  if (m === 'DELETE' && (deviceMatch = p.match(/^\/api\/devices\/([^/]+)$/))) {
    await transaction(async (client) => {
      const d = await one('SELECT id FROM devices WHERE id=$1 AND user_id=$2 FOR UPDATE', [deviceMatch[1],userId], client);
      if (!d) throw error(404, 'device_not_found');
      await query('UPDATE jobs SET device_id=NULL,version=version+1,updated_at=$1 WHERE assigned_to=$2 AND device_id=$3', [now(),userId,d.id], client);
      await query('DELETE FROM devices WHERE id=$1 AND user_id=$2', [d.id,userId], client);
    });
    return send(res, 200, { ok: true });
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
    const description = optionalText(body.description, 5000, 'description') ?? '';
    const customer = required(body.customer, 200, 'customer');
    const address = required(body.address, 300, 'address');
    const date = typeof body.scheduledAt === 'string' ? new Date(body.scheduledAt) : null;
    if (!date || !Number.isFinite(date.getTime()) || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) throw error(400, 'invalid_scheduledAt');
    const deviceId = body.deviceId ?? null;
    if (deviceId !== null && (typeof deviceId !== 'string' ||
        !await one('SELECT 1 FROM devices WHERE id=$1 AND user_id=$2', [deviceId, userId]))) {
      throw error(400, 'invalid_device');
    }
    const id = `J-${randomBytes(6).toString('hex').toUpperCase()}`; const t = now();
    await query(`INSERT INTO jobs(id,assigned_to,title,customer,address,scheduled_at,description,status,created_at,updated_at,device_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id,userId,title,customer,address,date.toISOString(),description,'new',t,t,deviceId]);
    return send(res, 201, { job: await jobJson(await one('SELECT * FROM jobs WHERE id=$1', [id])) });
  }
  let mt;
  if (m === 'GET' && (mt = p.match(/^\/api\/jobs\/([^/]+)$/))) {
    return send(res, 200, { job: await jobJson(await ownedJob(mt[1], userId)) });
  }

  if (m === 'PATCH' && (mt = p.match(/^\/api\/jobs\/([^/]+)$/))) {
    const b = await readJson(req);
    const result = await idempotent(req, userId, async (client) => {
      const old = await ownedJob(mt[1], userId, client, true);
      await checkVersion(old, b, client);
      const title = b.title === undefined ? old.title : required(b.title, 200, 'title');
      const description = b.description === undefined ? old.description : optionalText(b.description, 5000, 'description') ?? '';
      const customer = b.customer === undefined ? old.customer : required(b.customer, 200, 'customer');
      const address = b.address === undefined ? old.address : required(b.address, 300, 'address');
      const dt = b.scheduledAt === undefined ? new Date(old.scheduled_at) : new Date(b.scheduledAt);
      if (!Number.isFinite(dt.getTime()) || dt.getUTCFullYear() < 2000 || dt.getUTCFullYear() > 2100) throw error(400,'invalid_scheduledAt');
      const deviceId = b.deviceId === undefined ? old.device_id : b.deviceId;
      if (deviceId !== null && (typeof deviceId !== 'string' ||
          !await one('SELECT 1 FROM devices WHERE id=$1 AND user_id=$2', [deviceId,userId], client))) {
        throw error(400, 'invalid_device');
      }
      await query(`UPDATE jobs SET title=$1,description=$2,customer=$3,address=$4,scheduled_at=$5,
        device_id=$6,version=version+1,updated_at=$7 WHERE id=$8 AND assigned_to=$9`,
        [title,description,customer,address,dt.toISOString(),deviceId,now(),old.id,userId], client);
      return { status: 200, body: { job: await jobJson(await ownedJob(old.id,userId,client), client) } };
    });
    return send(res,result.status,result.body);
  }
  if (m === 'DELETE' && (mt = p.match(/^\/api\/jobs\/([^/]+)$/))) {
    const result = await idempotent(req, userId, async (client) => {
      const old = await ownedJob(mt[1], userId, client, true);
      await query('DELETE FROM photos WHERE job_id=$1', [old.id],client);
      await query('DELETE FROM reports WHERE job_id=$1', [old.id],client);
      await query('DELETE FROM jobs WHERE id=$1 AND assigned_to=$2', [old.id,userId],client);
      return { status: 200, body: { ok: true } };
    });
    return send(res,result.status,result.body);
  }
  if (m === 'POST' && (mt = p.match(/^\/api\/jobs\/([^/]+)\/status$/))) {
    const body = await readJson(req);
    const result = await idempotent(req, userId, async (client) => {
      const row = await ownedJob(mt[1], userId, client, true);
      if (!STATUSES.includes(body.status)) throw error(400, 'invalid_status');
      await checkVersion(row, body, client);
      if (body.status === 'done' && !await one('SELECT 1 FROM reports WHERE job_id=$1', [row.id], client)) {
        throw error(409, 'report_required');
      }
      return { status: 200, body: { job: await jobJson(await touchJob(row.id, client, body.status), client) } };
    });
    return send(res, result.status, result.body);
  }
  if (m === 'PUT' && (mt = p.match(/^\/api\/jobs\/([^/]+)\/report$/))) {
    const body = await readJson(req);
    const result = await idempotent(req, userId, async (client) => {
      return createReport({
        client, userId, jobId: mt[1], body, ownedJob, one, query, checkVersion, touchJob, jobJson, now,
      });
    });
    return send(res, result.status, result.body);
  }
  if (m === 'POST' && (mt = p.match(/^\/api\/jobs\/([^/]+)\/photos$/))) {
    const body = await readJson(req);
    const photo = decodePhotoUpload(body);
    const status = await transaction(async (client) => {
      const row = await ownedJob(mt[1], userId, client, true);
      if (row.status !== 'in_progress') throw error(409, 'job_not_in_progress');
      const existing = await one('SELECT job_id,mime,data FROM photos WHERE id=$1', [photo.id], client);
      if (existing) {
        if (existing.job_id !== row.id || existing.mime !== photo.mime || !Buffer.from(existing.data).equals(photo.data)) {
          throw error(409, 'photo_id_taken');
        }
        return 200;
      }
      const totals = await one(
        'SELECT COUNT(*)::integer AS count, COALESCE(SUM(octet_length(data)),0)::bigint AS bytes FROM photos WHERE job_id=$1',
        [row.id], client);
      if (totals.count >= MAX_PHOTOS_PER_JOB) throw error(413, 'too_many_photos');
        if (Number(totals.bytes) + photo.data.length > MAX_PHOTO_BYTES_PER_JOB) throw error(413, 'photo_total_too_large');
        try {
          await query('INSERT INTO photos(id,job_id,mime,data,created_at) VALUES($1,$2,$3,$4,$5)',
            [photo.id,row.id,photo.mime,photo.data,now()], client);
        } catch (err) {
          if (err.code === '23505') throw error(409, 'photo_id_taken');
          throw err;
        }
      return 201;
    });
    return send(res, status, { id: photo.id });
  }
  if (m === 'GET' && (mt = p.match(/^\/api\/photos\/([^/]+)$/))) {
    const ph = await one('SELECT p.mime,p.data FROM photos p JOIN jobs j ON j.id=p.job_id WHERE p.id=$1 AND j.assigned_to=$2', [mt[1],userId]);
    if (!ph) throw error(404,'photo_not_found');
    res.writeHead(200, { 'Content-Type': ph.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(ph.data);
  }
  if (m === 'DELETE' && (mt = p.match(/^\/api\/jobs\/([^/]+)\/photos\/([^/]+)$/))) {
    await transaction(async (client) => {
      const row = await ownedJob(mt[1], userId, client, true);
      if (row.status !== 'in_progress' ||
          await one('SELECT 1 FROM reports WHERE job_id=$1', [row.id], client)) {
        throw error(409, 'photo_delete_not_allowed');
      }
      await query('DELETE FROM photos WHERE id=$1 AND job_id=$2', [mt[2],row.id], client);
    });
    return send(res, 200, { ok: true });
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
