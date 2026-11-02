CREATE TABLE IF NOT EXISTS fieldops_attachments (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  message_id BIGINT REFERENCES organization_messages(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 1500000),
  data BYTEA NOT NULL,
  created_at TEXT NOT NULL,
  CHECK ((job_id IS NOT NULL AND organization_id IS NULL AND message_id IS NULL) OR
         (job_id IS NULL AND organization_id IS NOT NULL AND message_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_fieldops_att_job ON fieldops_attachments(job_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fieldops_att_chat ON fieldops_attachments(organization_id,message_id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handoff_device_snapshot JSONB;
