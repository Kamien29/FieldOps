import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { tx } from './db.js';
import { TOKEN_TTL_SECONDS, hashPassword, signToken, verifyPassword, verifyToken } from './auth.js';

const MAX_BODY = 15 * 1024 * 1024;
const STATUSES = ['new', 'in_progress', 'done'];
const MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_COOKIE = 'fieldops_session';
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const httpError = (status, code, extra = {}) => Object.assign(new Error(code), { status, code, extra });

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) tooLarge = true;
      else chunks.push(c);
    });
    req.on('end', () => {
      if (tooLarge) return reject(httpError(413, 'payload_too_large'));
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(httpError(400, 'invalid_json')); }
    });
    req.on('error', reject);
  });
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

/** Sesja przeglądarki: ciasteczko HttpOnly (JS nie ma do niego dostępu), SameSite=Strict. */
function sessionCookie(req, token, maxAge = TOKEN_TTL_SECONDS) {
  const secure = process.env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isBuf ? 'application/octet-stream' : 'application/json', ...headers });
  res.end(isBuf ? body : JSON.stringify(body));
}

export function createServer(db) {
  const q = (sql) => db.prepare(sql);

  function jobJson(row) {
    const r = q('SELECT * FROM reports WHERE job_id=?').get(row.id);
    return {
      id: row.id, title: row.title, description: row.description ?? '', customer: row.customer, address: row.address,
      scheduledAt: row.scheduled_at, status: row.status, version: row.version,
      createdAt: row.created_at || null, updatedAt: row.updated_at,
      report: r ? {
        note: r.note, lat: r.lat, lng: r.lng, deviceCode: r.device_code,
        signatureSvg: r.signature_svg, photoIds: JSON.parse(r.photo_ids), updatedAt: r.updated_at,
      } : null,
    };
  }

  function ownedJob(id, userId) {
    const row = q('SELECT * FROM jobs WHERE id=? AND assigned_to=?').get(id, userId);
    if (!row) throw httpError(404, 'job_not_found');
    return row;
  }

  function checkVersion(row, body) {
    if (!Number.isInteger(body.baseVersion)) throw httpError(400, 'baseVersion_required');
    if (row.version !== body.baseVersion) throw httpError(409, 'conflict', { server: jobJson(row) });
  }

  /** Replays the stored response for a repeated Idempotency-Key (only 2xx responses are stored). */
  function idempotent(req, userId, fn) {
    const raw = req.headers['idempotency-key'];
    if (!raw || typeof raw !== 'string' || raw.length > 100) throw httpError(400, 'idempotency_key_required');
    const key = `${userId}:${raw}`;
    return tx(db, () => {
      const prev = q('SELECT status, body FROM idempotency WHERE key=?').get(key);
      if (prev) return { status: prev.status, body: JSON.parse(prev.body), replay: true };
      const out = fn();
      q('INSERT INTO idempotency VALUES (?,?,?,?)').run(key, out.status, JSON.stringify(out.body), new Date().toISOString());
      return out;
    });
  }

  const touchJob = (id, patch = {}) => {
    const now = new Date().toISOString();
    if (patch.status) q('UPDATE jobs SET status=?, version=version+1, updated_at=? WHERE id=?').run(patch.status, now, id);
    else q('UPDATE jobs SET version=version+1, updated_at=? WHERE id=?').run(now, id);
    return q('SELECT * FROM jobs WHERE id=?').get(id);
  };

  const num = (v, min, max, name) => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw httpError(400, `invalid_${name}`);
    return v;
  };
  const str = (v, max, name) => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string' || v.length > max) throw httpError(400, `invalid_${name}`);
    return v;
  };

  const requiredStr = (v, max, name) => {
    if (typeof v !== 'string' || !v.trim() || v.trim().length > max) throw httpError(400, `invalid_${name}`);
    return v.trim();
  };

  const sessionResponse = (req, res, status, userRow) => {
    const token = signToken(userRow.id);
    return send(res, status, { token, user: { id: userRow.id, name: userRow.name, email: userRow.email } },
      { 'Set-Cookie': sessionCookie(req, token) });
  };

  async function route(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const m = req.method;

    if (m === 'GET' && p === '/health') return send(res, 200, { ok: true });

    if (m === 'POST' && p === '/api/login') {
      const { email, password } = await readJson(req);
      if (typeof email !== 'string' || typeof password !== 'string') throw httpError(400, 'invalid_credentials_format');
      const u = q('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());
      if (!u || !verifyPassword(password, u.password_hash)) throw httpError(401, 'invalid_credentials');
      return sessionResponse(req, res, 200, u);
    }

    if (m === 'POST' && p === '/api/register') {
      const body = await readJson(req);
      const name = requiredStr(body.name, 100, 'name');
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!EMAIL_RE.test(email) || email.length > 254) throw httpError(400, 'invalid_email');
      if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 200) throw httpError(400, 'invalid_password');
      if (q('SELECT 1 FROM users WHERE email=?').get(email)) throw httpError(409, 'email_taken');
      const id = `u-${randomUUID()}`;
      try {
        q('INSERT INTO users VALUES (?,?,?,?)').run(id, email, name, hashPassword(body.password));
      } catch (e) {
        if (/UNIQUE/i.test(String(e.message))) throw httpError(409, 'email_taken');
        throw e;
      }
      return sessionResponse(req, res, 201, { id, name, email });
    }

    if (m === 'POST' && p === '/api/logout') {
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
    }

    // ---- authenticated routes ----
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const cookieToken = bearer ? '' : readCookie(req, SESSION_COOKIE);
    const userId = verifyToken(bearer || cookieToken);
    if (!userId || !q('SELECT 1 FROM users WHERE id=?').get(userId)) throw httpError(401, 'unauthorized');
    // Sesja z ciasteczka: zmiany wymagają nagłówka, którego nie da się wysłać formularzem z obcej strony (CSRF).
    if (cookieToken && m !== 'GET' && m !== 'HEAD' && !req.headers['x-requested-with']) throw httpError(403, 'csrf_blocked');

    if (m === 'GET' && p === '/api/me') {
      const u = q('SELECT id, name, email FROM users WHERE id=?').get(userId);
      return send(res, 200, { user: { id: u.id, name: u.name, email: u.email } });
    }

    if (m === 'GET' && p === '/api/jobs') {
      const serverTime = new Date().toISOString(); // taken BEFORE the query so no update can fall in a gap
      const since = url.searchParams.get('since') || '';
      const pageParam = url.searchParams.get('page');
      const limitParam = url.searchParams.get('limit');
      if (pageParam !== null || limitParam !== null) {
        // Paginacja (web): bez parametrów page/limit endpoint działa jak dotąd (synchronizacja mobile).
        const page = pageParam === null ? 1 : Number(pageParam);
        const limit = limitParam === null ? DEFAULT_PAGE_SIZE : Number(limitParam);
        if (!Number.isInteger(page) || page < 1) throw httpError(400, 'invalid_page');
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) throw httpError(400, 'invalid_limit');
        const total = Number(q('SELECT COUNT(*) AS c FROM jobs WHERE assigned_to=? AND updated_at >= ?').get(userId, since).c);
        const rows = q('SELECT * FROM jobs WHERE assigned_to=? AND updated_at >= ? ORDER BY scheduled_at, id LIMIT ? OFFSET ?')
          .all(userId, since, limit, (page - 1) * limit);
        return send(res, 200, {
          serverTime, jobs: rows.map(jobJson),
          pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        });
      }
      const rows = q('SELECT * FROM jobs WHERE assigned_to=? AND updated_at >= ? ORDER BY scheduled_at, id').all(userId, since);
      return send(res, 200, { serverTime, jobs: rows.map(jobJson) });
    }

    if (m === 'POST' && p === '/api/jobs') {
      const body = await readJson(req);
      const title = requiredStr(body.title, 200, 'title');
      const description = requiredStr(body.description, 5000, 'description');
      const customer = requiredStr(body.customer, 200, 'customer');
      const address = requiredStr(body.address, 300, 'address');
      const when = typeof body.scheduledAt === 'string' ? new Date(body.scheduledAt) : null;
      if (!when || Number.isNaN(when.getTime()) || when.getUTCFullYear() < 2000 || when.getUTCFullYear() > 2100) throw httpError(400, 'invalid_scheduledAt');
      const id = `J-${randomBytes(6).toString('hex').toUpperCase()}`;
      const now = new Date().toISOString();
      // Status początkowy zawsze 'new' („do wykonania”) – klient nie narzuca statusu.
      q('INSERT INTO jobs (id,assigned_to,title,customer,address,scheduled_at,description,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(id, userId, title, customer, address, when.toISOString(), description, 'new', now, now);
      return send(res, 201, { job: jobJson(q('SELECT * FROM jobs WHERE id=?').get(id)) });
    }

    let mt;
    if (m === 'GET' && (mt = p.match(/^\/api\/jobs\/([^/]+)$/))) {
      return send(res, 200, { job: jobJson(ownedJob(mt[1], userId)) });
    }

    if (m === 'POST' && (mt = p.match(/^\/api\/jobs\/([^/]+)\/status$/))) {
      const body = await readJson(req);
      const row = ownedJob(mt[1], userId);
      const out = idempotent(req, userId, () => {
        if (!STATUSES.includes(body.status)) throw httpError(400, 'invalid_status');
        checkVersion(row, body);
        return { status: 200, body: { job: jobJson(touchJob(row.id, { status: body.status })) } };
      });
      return send(res, out.status, out.body);
    }

    if (m === 'PUT' && (mt = p.match(/^\/api\/jobs\/([^/]+)\/report$/))) {
      const body = await readJson(req);
      const row = ownedJob(mt[1], userId);
      const out = idempotent(req, userId, () => {
        const note = str(body.note, 10000, 'note');
        if (note === null) throw httpError(400, 'invalid_note');
        const lat = num(body.lat, -90, 90, 'lat');
        const lng = num(body.lng, -180, 180, 'lng');
        const deviceCode = str(body.deviceCode, 200, 'deviceCode');
        const sig = str(body.signatureSvg, 200000, 'signatureSvg');
        const ids = body.photoIds ?? [];
        if (!Array.isArray(ids) || ids.length > 50 || ids.some((i) => typeof i !== 'string')) throw httpError(400, 'invalid_photoIds');
        for (const id of ids) {
          if (!q('SELECT 1 FROM photos WHERE id=? AND job_id=?').get(id, row.id)) throw httpError(422, 'unknown_photo', { photoId: id });
        }
        checkVersion(row, body);
        q(`INSERT INTO reports (job_id,note,lat,lng,device_code,signature_svg,photo_ids,updated_at)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(job_id) DO UPDATE SET note=excluded.note, lat=excluded.lat, lng=excluded.lng,
             device_code=excluded.device_code, signature_svg=excluded.signature_svg,
             photo_ids=excluded.photo_ids, updated_at=excluded.updated_at`)
          .run(row.id, note, lat, lng, deviceCode, sig, JSON.stringify(ids), new Date().toISOString());
        return { status: 200, body: { job: jobJson(touchJob(row.id)) } };
      });
      return send(res, out.status, out.body);
    }

    if (m === 'POST' && (mt = p.match(/^\/api\/jobs\/([^/]+)\/photos$/))) {
      const body = await readJson(req);
      const row = ownedJob(mt[1], userId);
      if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw httpError(400, 'invalid_photo_id');
      if (!MIMES.includes(body.mime)) throw httpError(400, 'invalid_mime');
      if (typeof body.dataBase64 !== 'string' || !body.dataBase64) throw httpError(400, 'invalid_data');
      const data = Buffer.from(body.dataBase64, 'base64');
      if (!data.length) throw httpError(400, 'invalid_data');
      const existing = q('SELECT job_id FROM photos WHERE id=?').get(body.id);
      if (existing && existing.job_id !== row.id) throw httpError(409, 'id_taken');
      if (!existing) q('INSERT INTO photos VALUES (?,?,?,?,?)').run(body.id, row.id, body.mime, data, new Date().toISOString());
      return send(res, existing ? 200 : 201, { id: body.id });
    }

    if (m === 'GET' && (mt = p.match(/^\/api\/photos\/([^/]+)$/))) {
      const ph = q('SELECT p.* FROM photos p JOIN jobs j ON j.id=p.job_id WHERE p.id=? AND j.assigned_to=?').get(mt[1], userId);
      if (!ph) throw httpError(404, 'photo_not_found');
      res.writeHead(200, { 'Content-Type': ph.mime });
      return res.end(Buffer.from(ph.data));
    }

    throw httpError(404, 'not_found');
  }

  return http.createServer((req, res) => {
    route(req, res).catch((e) => {
      if (e.status) return send(res, e.status, { error: e.code, ...e.extra });
      console.error(e);
      send(res, 500, { error: 'internal_error' });
    });
  });
}
