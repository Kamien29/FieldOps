import { randomBytes, randomUUID } from 'node:crypto';
import { getPool } from './db.js';
import { hashPassword } from './auth.js';

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);
const databaseUrl = process.env.DATABASE_URL;
if (process.env.NODE_ENV === 'production' || process.env.FIELDOPS_DEMO_SEED !== '1' || !databaseUrl) {
  throw new Error('Demo seed requires a non-production environment and FIELDOPS_DEMO_SEED=1.');
}

const parsedUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''));
if (!allowedHosts.has(parsedUrl.hostname) || databaseName !== 'fieldops_demo') {
  throw new Error('Demo seed is restricted to localhost database fieldops_demo.');
}

const pool = getPool();
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(20261020, 2)');
  const existing = await client.query('SELECT COUNT(*)::integer AS count FROM users');
  if (existing.rows[0].count !== 0) {
    throw new Error('Demo seed refused: database already contains users.');
  }

  const userId = `u-${randomUUID()}`;
  const jobId = `J-${randomUUID().slice(0, 8).toUpperCase()}`;
  const password = randomBytes(18).toString('base64url');
  const timestamp = new Date().toISOString();
  await client.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)', [
    userId, 'demo@fieldops.local', 'Serwisant Demo', hashPassword(password),
  ]);
  await client.query(`INSERT INTO jobs(id,assigned_to,title,customer,address,scheduled_at,description,status,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,'in_progress',$8,$8)`, [
    jobId, userId, 'Przegląd urządzenia testowego', 'Firma Demo',
    'ul. Testowa 1, Miasto Testowe', new Date(Date.now() + 86400000).toISOString(),
    'Fikcyjne zlecenie demonstracyjne.', timestamp,
  ]);
  await client.query('COMMIT');
  console.log(`Demo account: demo@fieldops.local`);
  console.log(`Temporary demo password: ${password}`);
  console.log(`Demo job: ${jobId}`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
