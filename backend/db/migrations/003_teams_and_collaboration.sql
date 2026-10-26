-- FieldOps: teams, invitations, optional org ownership, job handoffs and chat.
-- Additive migration: keeps existing users, jobs, photos and reports unchanged.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data BYTEA;

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE TABLE IF NOT EXISTS organization_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL,
  invited_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TEXT NOT NULL,
  responded_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invitation_pending ON organization_invitations(organization_id,lower(email)) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_org_invitation_email ON organization_invitations(lower(email),status);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_jobs_organization ON jobs(organization_id);

CREATE TABLE IF NOT EXISTS job_offers (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  recipient_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT REFERENCES organizations(id),
  job_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  created_at TEXT NOT NULL,
  responded_at TEXT,
  CHECK (sender_id <> recipient_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_offers_pending ON job_offers(job_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_job_offers_recipient ON job_offers(recipient_id,status);
CREATE INDEX IF NOT EXISTS idx_job_offers_sender ON job_offers(sender_id,status);

CREATE TABLE IF NOT EXISTS organization_messages (
  id BIGSERIAL PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  recipient_id TEXT REFERENCES users(id),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_org_messages_channel ON organization_messages(organization_id,recipient_id,id DESC);
CREATE INDEX IF NOT EXISTS idx_org_messages_sender ON organization_messages(sender_id);
