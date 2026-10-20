import pg from 'pg';

const { Pool } = pg;
let pool;
export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX || 3),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    // Neon pooled URLs usually supply TLS. Do not turn off certificate verification.
  });
  return pool;
}
export async function query(sql, params = [], client = getPool()) {
  return client.query(sql, params);
}
export async function one(sql, params = [], client = getPool()) {
  return (await query(sql, params, client)).rows[0] ?? null;
}
export async function all(sql, params = [], client = getPool()) {
  return (await query(sql, params, client)).rows;
}
export async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rollbackError) { console.error('Rollback failed', rollbackError); }
    throw err;
  } finally { client.release(); }
}
