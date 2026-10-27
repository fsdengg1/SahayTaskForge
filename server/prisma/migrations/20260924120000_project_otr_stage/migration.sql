ALTER TABLE projects ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS otr_stage varchar;
