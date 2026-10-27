ALTER TABLE design_activities DROP CONSTRAINT IF EXISTS design_activities_status_check;
ALTER TABLE design_activities ADD CONSTRAINT design_activities_status_check
  CHECK (status IN (
    'NOT_STARTED', 'PENDING', 'IN_PROGRESS', 'ON_HOLD',
    'REVISION_REQUIRED', 'COMPLETED', 'APPROVED'
  ));

ALTER TABLE design_activities ADD COLUMN IF NOT EXISTS assigned_user_id uuid;
ALTER TABLE design_activities ADD COLUMN IF NOT EXISTS assigned_name varchar(160);
ALTER TABLE design_activities ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE design_activities ADD COLUMN IF NOT EXISTS target_at timestamptz;
ALTER TABLE design_activities ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE design_activities ADD COLUMN IF NOT EXISTS pending_reason text;

CREATE INDEX IF NOT EXISTS design_activities_status_idx
  ON design_activities (status);
CREATE INDEX IF NOT EXISTS design_activities_assignee_idx
  ON design_activities (assigned_user_id);
CREATE INDEX IF NOT EXISTS design_activities_target_idx
  ON design_activities (target_at);

CREATE INDEX IF NOT EXISTS projects_order_id_idx
  ON projects (order_id);

ALTER TABLE design_activity_events ADD COLUMN IF NOT EXISTS previous_target_at timestamptz;
ALTER TABLE design_activity_events ADD COLUMN IF NOT EXISTS new_target_at timestamptz;
ALTER TABLE design_activity_events ADD COLUMN IF NOT EXISTS previous_responsible_name varchar(160);
ALTER TABLE design_activity_events ADD COLUMN IF NOT EXISTS new_responsible_name varchar(160);
ALTER TABLE design_activity_events ADD COLUMN IF NOT EXISTS previous_pending_reason text;
ALTER TABLE design_activity_events ADD COLUMN IF NOT EXISTS new_pending_reason text;

CREATE INDEX IF NOT EXISTS design_activity_events_activity_idx
  ON design_activity_events (project_id, activity, created_at DESC);
