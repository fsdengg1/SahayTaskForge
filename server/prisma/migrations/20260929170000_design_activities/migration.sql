ALTER TABLE design_files DROP CONSTRAINT IF EXISTS design_files_kind_check;
ALTER TABLE design_files ADD CONSTRAINT design_files_kind_check
  CHECK (kind IN ('DRAWING', 'BOM', 'LAYOUT', 'SHOP', 'MANUFACTURING_DRAWING', 'INSTALLATION_DRAWING'));

CREATE TABLE IF NOT EXISTS design_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  activity varchar(40) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'PENDING',
  remarks text,
  updated_by uuid,
  updated_by_name varchar(160),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_activities_project_activity_key UNIQUE (project_id, activity),
  CONSTRAINT design_activities_activity_check CHECK (
    activity IN ('SHOP', 'BOM', 'MANUFACTURING_DRAWING', 'INSTALLATION_DRAWING')
  ),
  CONSTRAINT design_activities_status_check CHECK (
    status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'APPROVED', 'REVISION_REQUIRED')
  )
);

CREATE INDEX IF NOT EXISTS design_activities_project_idx
  ON design_activities (project_id, activity);

CREATE TABLE IF NOT EXISTS design_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  activity varchar(40),
  previous_status varchar(40),
  new_status varchar(40),
  remarks text,
  user_id uuid,
  user_name varchar(160),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_activity_events_project_idx
  ON design_activity_events (project_id, created_at DESC);

ALTER TABLE project_stage_work ADD COLUMN IF NOT EXISTS assigned_user_id uuid;
