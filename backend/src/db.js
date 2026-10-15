import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function openDb(file = process.env.DB_FILE || './data/fieldops.db') {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      assigned_to TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, customer TEXT NOT NULL, address TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','done')),
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_user_updated ON jobs(assigned_to, updated_at);
    CREATE TABLE IF NOT EXISTS reports (
      job_id TEXT PRIMARY KEY REFERENCES jobs(id),
      note TEXT NOT NULL DEFAULT '', lat REAL, lng REAL, device_code TEXT, signature_svg TEXT,
      photo_ids TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id),
      mime TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS idempotency (
      key TEXT PRIMARY KEY, status INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  return db;
}

export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
