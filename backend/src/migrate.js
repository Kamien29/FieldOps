import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getPool } from './db.js';

function assertMigrationTarget() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for migrations.');
  }
  const url = new URL(process.env.DATABASE_URL);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const isLocalDemo = ['localhost', '127.0.0.1', '::1'].includes(host) && database === 'fieldops_demo';
  // Remote schemas are changed ONLY on an explicit one-time operator command.
  // Never set ALLOW_REMOTE_MIGRATIONS in Vercel environment variables.
  if (!isLocalDemo && process.env.ALLOW_REMOTE_MIGRATIONS !== 'YES') {
    throw new Error('Remote migration blocked. Back up Neon first, then run with ALLOW_REMOTE_MIGRATIONS=YES.');
  }
  if (!isLocalDemo) console.warn('WARNING: applying SQL migrations to a remote PostgreSQL database:', host, '/', database);
}

try {
  assertMigrationTarget();
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
