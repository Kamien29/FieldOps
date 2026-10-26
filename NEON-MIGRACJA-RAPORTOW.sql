ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS recipient_full_name TEXT NOT NULL DEFAULT '';

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS created_at TEXT;

UPDATE reports
SET created_at = COALESCE(updated_at, CURRENT_TIMESTAMP::text)
WHERE created_at IS NULL;

ALTER TABLE reports
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP::text,
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS completed_at TEXT;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS location_accuracy DOUBLE PRECISION;

UPDATE reports r
SET completed_at = r.updated_at
FROM jobs j
WHERE j.id = r.job_id
  AND j.status = 'done'
  AND r.completed_at IS NULL;
