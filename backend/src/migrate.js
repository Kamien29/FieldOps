import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getPool } from './db.js';

function assertLocalDemoDatabase() {
  if (process.env.NODE_ENV === 'production' || !process.env.DATABASE_URL) {
    throw new Error('Migrations are restricted to the local demo database.');
  }
  const url = new URL(process.env.DATABASE_URL);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!['localhost', '127.0.0.1', '::1'].includes(host) || database !== 'fieldops_demo') {
    throw new Error('Migrations are restricted to localhost database fieldops_demo.');
  }
}

try {
  assertLocalDemoDatabase();
  const migrations = [
    '../db/migrations/001_initial.sql',
    '../db/migrations/002_report_completion.sql',
  ];
  const statements = await Promise.all(
    migrations.map((path) => readFile(fileURLToPath(new URL(path, import.meta.url)), 'utf8')),
  );
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Prevent concurrent deploys from applying the same migration at once.
    await client.query('SELECT pg_advisory_xact_lock(20261020, 1)');
    for (const statement of statements) await client.query(statement);
    await client.query('COMMIT');
    console.log('FieldOps PostgreSQL schema ready');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  await pool.end();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
