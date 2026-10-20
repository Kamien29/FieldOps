import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getPool } from './db.js';

const file = fileURLToPath(new URL('../db/migrations/001_initial.sql', import.meta.url));
try {
  const sql = await readFile(file, 'utf8');
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Prevent concurrent deploys from applying the same migration at once.
    await client.query('SELECT pg_advisory_xact_lock(20261020, 1)');
    await client.query(sql);
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
