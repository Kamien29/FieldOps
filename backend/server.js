import http from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = join(ROOT, 'data');
mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, 'fieldops.sqlite'));
db.exec(`
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 name TEXT NOT NULL,
 salt TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS devices (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 serial TEXT NOT NULL,
 name TEXT NOT NULL,
 model TEXT NOT NULL DEFAULT '',
 location TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id, serial)
);
CREATE TABLE IF NOT EXISTS jobs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
 title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 client_name TEXT NOT NULL,
 address TEXT NOT NULL,
 due_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'to_do',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS jobs_user_due ON jobs(user_id, due_date);
`);
const sessions = new Map();

function passwordHash(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}
function safeEqual(a, b) {
  const aa = Buffer.from(a, 'hex'), bb = Buffer.from(b, 'hex');
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function createUser({ email, password, name }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw httpError(400, 'Podaj poprawny adres e-mail.');
  if (String(password || '').length < 8) throw httpError(400, 'Hasło musi mieć co najmniej 8 znaków.');
  if (cleanName.length < 2) throw httpError(400, 'Podaj imię lub nazwę użytkownika.');
  const salt = randomBytes(16).toString('hex');
  try {
    const result = db.prepare('INSERT INTO users(email,name,salt,password_hash) VALUES(?,?,?,?)')
      .run(cleanEmail, cleanName, salt, passwordHash(password, salt));
    return { id: Number(result.lastInsertRowid), email: cleanEmail, name: cleanName };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw httpError(409, 'Konto z tym adresem e-mail już istnieje.');
    throw e;
  }
}
function httpError(status, message, details = undefined) {
  const e = new Error(message); e.status = status; e.details = details; return e;
}
function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw httpError(413, 'Żądanie jest za duże.');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw httpError(400, 'Niepoprawny JSON.'); }
}
function auth(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const userId = sessions.get(token);
  if (!userId) throw httpError(401, 'Wymagane logowanie.');
  return { id: userId, token };
}
function ownDevice(userId, id) {
  if (!id) return null;
  const d = db.prepare('SELECT * FROM devices WHERE id=? AND user_id=?').get(Number(id), userId);
  if (!d) throw httpError(400, 'Wybrane urządzenie nie istnieje lub nie należy do tego użytkownika.');
  return d;
}
function parseJobInput(input, userId, partial = false) {
  const fields = {};
  for (const key of ['title','description','client_name','address','due_date','device_id']) {
    if (Object.hasOwn(input, key)) fields[key] = input[key];
  }
  const required = ['title','client_name','address','due_date'];
  if (!partial) for (const k of required) if (!String(fields[k] ?? '').trim()) throw httpError(400, `Pole ${k} jest wymagane.`);
  for (const k of required) if (Object.hasOwn(fields,k) && !String(fields[k] ?? '').trim()) throw httpError(400, `Pole ${k} jest wymagane.`);
  if (Object.hasOwn(fields, 'due_date') && !/^\d{4}-\d{2}-\d{2}$/.test(String(fields.due_date))) throw httpError(400, 'Termin musi mieć format RRRR-MM-DD.');
  if (Object.hasOwn(fields, 'device_id')) {
    fields.device_id = fields.device_id === '' || fields.device_id === null ? null : Number(fields.device_id);
    if (fields.device_id) ownDevice(userId, fields.device_id);
  }
  if (Object.hasOwn(fields, 'title')) fields.title = String(fields.title).trim();
  if (Object.hasOwn(fields, 'description')) fields.description = String(fields.description || '');
  if (Object.hasOwn(fields, 'client_name')) fields.client_name = String(fields.client_name).trim();
  if (Object.hasOwn(fields, 'address')) fields.address = String(fields.address).trim();
  return fields;
}
function jobRow(row) {
  return { ...row, id: Number(row.id), user_id: Number(row.user_id),
    device_id: row.device_id === null ? null : Number(row.device_id),
    device: row.device_name ? { id: Number(row.device_id), serial: row.device_serial, name: row.device_name, model: row.device_model } : null };
}
const jobSelect = `SELECT j.*, d.name AS device_name, d.serial AS device_serial, d.model AS device_model
 FROM jobs j LEFT JOIN devices d ON d.id=j.device_id`;
function getJob(userId, id) {
  const row = db.prepare(`${jobSelect} WHERE j.id=? AND j.user_id=?`).get(Number(id), userId);
  if (!row) throw httpError(404, 'Nie znaleziono zlecenia.');
  return jobRow(row);
}
function seed() {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n) return;
  const user = createUser({ email: 'demo@fieldops.local', password: 'Demo123!', name: 'Serwisant Demo' });
  const d1 = db.prepare('INSERT INTO devices(user_id,serial,name,model,location) VALUES(?,?,?,?,?)').run(user.id,'FO-AC-001','Klimatyzator','AC-900','Rzeszów');
  const d2 = db.prepare('INSERT INTO devices(user_id,serial,name,model,location) VALUES(?,?,?,?,?)').run(user.id,'FO-PUMP-002','Pompa obiegowa','P-120','Łańcut');
  const ins = db.prepare('INSERT INTO jobs(user_id,device_id,title,description,client_name,address,due_date,status) VALUES(?,?,?,?,?,?,?,?)');
  ins.run(user.id, Number(d1.lastInsertRowid), 'Przegląd klimatyzacji', 'Przegląd okresowy i kontrola filtrów.', 'Jan Kowalski', 'ul. Kwiatowa 12, Rzeszów', '2026-10-22', 'to_do');
  ins.run(user.id, Number(d2.lastInsertRowid), 'Diagnostyka pompy', 'Sprawdzić hałas i ciśnienie.', 'Firma Alfa', 'ul. Długa 4, Łańcut', '2026-10-23', 'in_progress');
}
seed();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = decodeURIComponent(url.pathname);
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,authorization', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' });
      return res.end();
    }
    if (path === '/health' && req.method === 'GET') return json(res, 200, { ok: true, service: 'fieldops-api' });
    if (path === '/api/register' && req.method === 'POST') {
      const u = createUser(await body(req));
      const token = randomBytes(32).toString('hex'); sessions.set(token, u.id);
      return json(res, 201, { data: { user: u, token } });
    }
    if (path === '/api/login' && req.method === 'POST') {
      const b = await body(req);
      const u = db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get(String(b.email || '').trim());
      if (!u || !safeEqual(passwordHash(String(b.password || ''), u.salt), u.password_hash)) throw httpError(401, 'Nieprawidłowy e-mail lub hasło.');
      const token = randomBytes(32).toString('hex'); sessions.set(token, Number(u.id));
      return json(res, 200, { data: { user: { id: Number(u.id), email: u.email, name: u.name }, token } });
    }
    if (path === '/api/logout' && req.method === 'POST') {
      const a = auth(req); sessions.delete(a.token); return json(res, 200, { data: { success: true } });
    }
    if (path.startsWith('/api/')) {
      const user = auth(req);
      if (path === '/api/me' && req.method === 'GET') {
        const u = db.prepare('SELECT id,email,name FROM users WHERE id=?').get(user.id);
        return json(res, 200, { data: u });
      }
      if (path === '/api/devices' && req.method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim();
        const rows = db.prepare(`SELECT * FROM devices WHERE user_id=? AND (?='' OR name LIKE ? OR serial LIKE ? OR model LIKE ?) ORDER BY name`)
          .all(user.id, q, `%${q}%`, `%${q}%`, `%${q}%`);
        return json(res, 200, { data: rows.map(r => ({...r, id:Number(r.id), user_id:Number(r.user_id)})) });
      }
      if (path === '/api/devices' && req.method === 'POST') {
        const b = await body(req);
        const serial = String(b.serial || '').trim(), name = String(b.name || '').trim();
        if (!serial || !name) throw httpError(400, 'Numer identyfikacyjny i nazwa urządzenia są wymagane.');
        try {
          const r = db.prepare('INSERT INTO devices(user_id,serial,name,model,location) VALUES(?,?,?,?,?)')
            .run(user.id, serial, name, String(b.model||''), String(b.location||''));
          const d = db.prepare('SELECT * FROM devices WHERE id=?').get(Number(r.lastInsertRowid));
          return json(res, 201, { data: {...d, id:Number(d.id), user_id:Number(d.user_id)} });
        } catch(e) { if(String(e.message).includes('UNIQUE')) throw httpError(409, 'Ten numer urządzenia jest już używany na tym koncie.'); throw e; }
      }
      const deviceMatch = path.match(/^\/api\/devices\/(\d+)$/);
      if (deviceMatch && req.method === 'PATCH') {
        const id = Number(deviceMatch[1]), b = await body(req);
        const old = db.prepare('SELECT * FROM devices WHERE id=? AND user_id=?').get(id,user.id);
        if (!old) throw httpError(404,'Nie znaleziono urządzenia.');
        const serial = String(b.serial ?? old.serial).trim(), name = String(b.name ?? old.name).trim();
        if (!serial || !name) throw httpError(400,'Numer i nazwa urządzenia są wymagane.');
        try {
          db.prepare('UPDATE devices SET serial=?,name=?,model=?,location=? WHERE id=? AND user_id=?')
            .run(serial,name,String(b.model ?? old.model),String(b.location ?? old.location),id,user.id);
          const d=db.prepare('SELECT * FROM devices WHERE id=?').get(id);
          return json(res,200,{data:{...d,id:Number(d.id),user_id:Number(d.user_id)}});
        } catch(e) { if(String(e.message).includes('UNIQUE')) throw httpError(409,'Numer urządzenia już istnieje.'); throw e; }
      }
      if (deviceMatch && req.method === 'DELETE') {
        const r = db.prepare('DELETE FROM devices WHERE id=? AND user_id=?').run(Number(deviceMatch[1]),user.id);
        if (!r.changes) throw httpError(404,'Nie znaleziono urządzenia.');
        return json(res,200,{data:{success:true}});
      }
      if (path === '/api/devices/identify' && req.method === 'GET') {
        const serial = String(url.searchParams.get('serial') || '').trim();
        if (!serial) throw httpError(400,'Podaj numer identyfikacyjny.');
        const d = db.prepare('SELECT * FROM devices WHERE user_id=? AND serial=?').get(user.id,serial);
        return d ? json(res,200,{data:{...d,id:Number(d.id),user_id:Number(d.user_id)}}) : json(res,404,{error:{message:'Nie znaleziono urządzenia. Możesz dodać je do rejestru.'},data:null});
      }
      if (path === '/api/jobs' && req.method === 'GET') {
        const status = url.searchParams.get('status') || '';
        const from = url.searchParams.get('from') || '', to = url.searchParams.get('to') || '';
        const device = url.searchParams.get('device_id') || '';
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 10)));
        const where = ['j.user_id=?'], args = [user.id];
        if (status) { where.push('j.status=?'); args.push(status); }
        if (from) { where.push('j.due_date>=?'); args.push(from); }
        if (to) { where.push('j.due_date<=?'); args.push(to); }
        if (device) { where.push('j.device_id=?'); args.push(Number(device)); }
        const clause = where.join(' AND ');
        const total = Number(db.prepare(`SELECT COUNT(*) n FROM jobs j WHERE ${clause}`).get(...args).n);
        const rows = db.prepare(`${jobSelect} WHERE ${clause} ORDER BY j.due_date ASC, j.id DESC LIMIT ? OFFSET ?`).all(...args,limit,(page-1)*limit);
        return json(res,200,{data:rows.map(jobRow),meta:{page,limit,total,totalPages:Math.max(1,Math.ceil(total/limit))}});
      }
      if (path === '/api/jobs' && req.method === 'POST') {
        const b = await body(req), f = parseJobInput(b,user.id);
        const r = db.prepare(`INSERT INTO jobs(user_id,device_id,title,description,client_name,address,due_date,status)
          VALUES(?,?,?,?,?,?,?,'to_do')`).run(user.id,f.device_id??null,f.title,f.description||'',f.client_name,f.address,f.due_date);
        return json(res,201,{data:getJob(user.id,Number(r.lastInsertRowid))});
      }
      const jobMatch = path.match(/^\/api\/jobs\/(\d+)$/);
      if (jobMatch) {
        const id = Number(jobMatch[1]);
        if (req.method === 'GET') return json(res,200,{data:getJob(user.id,id)});
        if (req.method === 'PATCH') {
          const old = getJob(user.id,id), b = await body(req);
          if (Object.hasOwn(b,'status')) {
            const allowed = { to_do:['in_progress','cancelled'], in_progress:['done','cancelled'], done:['cancelled'], cancelled:[] };
            if (!allowed[old.status]?.includes(b.status)) throw httpError(409,`Niedozwolona zmiana statusu: ${old.status} → ${b.status}.`);
          }
          const f = parseJobInput(b,user.id,true);
          const allowedFields = ['title','description','client_name','address','due_date','device_id'];
          const updates = [];
          const values = [];
          for (const k of allowedFields) if (Object.hasOwn(f,k)) { updates.push(`${k}=?`); values.push(f[k]); }
          if (Object.hasOwn(b,'status')) {
            if (!['to_do','in_progress','done','cancelled'].includes(b.status)) throw httpError(400,'Nieznany status zlecenia.');
            updates.push('status=?'); values.push(b.status);
          }
          if (!updates.length) throw httpError(400,'Brak pól do aktualizacji.');
          updates.push('updated_at=CURRENT_TIMESTAMP');
          db.prepare(`UPDATE jobs SET ${updates.join(',')} WHERE id=? AND user_id=?`).run(...values,id,user.id);
          return json(res,200,{data:getJob(user.id,id)});
        }
        if (req.method === 'DELETE') {
          const job = getJob(user.id,id);
          // Raporty nie są jeszcze częścią zakresu tygodni 1-2; pole report_id rezerwuje tę regułę na przyszłość.
          if (job.report_id) throw httpError(409,'Nie można usunąć zlecenia, które ma raport.');
          db.prepare('DELETE FROM jobs WHERE id=? AND user_id=?').run(id,user.id);
          return json(res,200,{data:{success:true}});
        }
      }
      throw httpError(404,'Nie znaleziono endpointu API.');
    }

    // Serve static frontend
    const requested = path === '/' ? '/frontend/index.html' : path;
    const safePath = normalize(join(ROOT, requested));
    if (!safePath.startsWith(ROOT) || !existsSync(safePath)) throw httpError(404,'Nie znaleziono strony.');
    const ext = extname(safePath);
    const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
    res.writeHead(200, {'content-type':types[ext]||'application/octet-stream'});
    res.end(readFileSync(safePath));
  } catch (e) {
    json(res,e.status||500,{error:{message:e.message||'Błąd serwera.', ...(e.details?{details:e.details}:{})}});
  }
});
const port = Number(process.env.PORT || 3000);
server.listen(port,'0.0.0.0',()=>console.log(`FieldOps API działa na http://localhost:${port}`));
