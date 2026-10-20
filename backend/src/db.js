import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

function jobsDdl(name, ifNotExists = '') {
  return `CREATE TABLE ${ifNotExists}${name} (
      id TEXT PRIMARY KEY,
      assigned_to TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, customer TEXT NOT NULL, address TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','done','cancelled')),
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      device_id TEXT REFERENCES devices(id)
    )`;
}

export function openDb(file = process.env.DB_FILE || './data/fieldops.db') {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      serial TEXT NOT NULL COLLATE NOCASE, name TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
      generated INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE (user_id, serial)
    );
    ${jobsDdl('jobs', 'IF NOT EXISTS ')};
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
  migrate(db);
  return db;
}

/** Dodaje kolumny tygodnia 1 do baz utworzonych wcześniejszą wersją schematu. */
function migrate(db) {
  const cols = db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name);
  if (!cols.includes('description')) db.exec("ALTER TABLE jobs ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  if (!cols.includes('created_at')) db.exec("ALTER TABLE jobs ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
  db.exec("UPDATE jobs SET created_at = updated_at WHERE created_at = ''");

  // Tydzień 2: status 'cancelled' i device_id. SQLite nie zmienia CHECK, więc przebudowujemy tabelę (z zachowaniem danych).
  const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='jobs'").get().sql;
  if (!ddl.includes("'cancelled'")) {
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      db.exec('BEGIN');
      db.exec(jobsDdl('jobs_new'));
      db.exec(`INSERT INTO jobs_new (id,assigned_to,title,customer,address,scheduled_at,description,created_at,status,version,updated_at)
               SELECT id,assigned_to,title,customer,address,scheduled_at,description,created_at,status,version,updated_at FROM jobs`);
      db.exec('DROP TABLE jobs');
      db.exec('ALTER TABLE jobs_new RENAME TO jobs');
      db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_user_updated ON jobs(assigned_to, updated_at)');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_device ON jobs(device_id)');
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
