-- Run once with npm run migrate; rerunning is safe. No demo users are created.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  serial TEXT NOT NULL,
  name TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  generated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_user_serial_ci ON devices (user_id, LOWER(serial));
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  assigned_to TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  customer TEXT NOT NULL,
  address TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','done','cancelled')),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  device_id TEXT REFERENCES devices(id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_user_updated ON jobs(assigned_to, updated_at);
CREATE INDEX IF NOT EXISTS idx_jobs_device ON jobs(device_id);
CREATE TABLE IF NOT EXISTS reports (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id),
  note TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  device_code TEXT,
  signature_svg TEXT,
  photo_ids TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  mime TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_job ON photos(job_id);
CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT PRIMARY KEY,
  status INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
