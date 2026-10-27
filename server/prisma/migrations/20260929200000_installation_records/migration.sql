CREATE TABLE IF NOT EXISTS otr_installation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  progress_pct numeric(5,1) NOT NULL,
  stage varchar(40) NOT NULL,
  readiness varchar(40) NOT NULL,
  readiness_reason text,
  status varchar(40) NOT NULL,
  handover_status varchar(40) NOT NULL,
  delay_reason text,
  planned_at timestamptz NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  assigned_user_id uuid,
  assigned_name varchar(160),
  remarks text,
  created_by uuid,
  created_by_name varchar(160),
  updated_by uuid,
  updated_by_name varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by_name varchar(160),
  CONSTRAINT otr_installation_records_progress_check CHECK (progress_pct >= 0 AND progress_pct <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS otr_installation_records_active_project_idx
  ON otr_installation_records (project_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS otr_installation_records_project_idx ON otr_installation_records (project_id);
CREATE INDEX IF NOT EXISTS otr_installation_records_stage_idx ON otr_installation_records (stage);
CREATE INDEX IF NOT EXISTS otr_installation_records_status_idx ON otr_installation_records (status);
CREATE INDEX IF NOT EXISTS otr_installation_records_readiness_idx ON otr_installation_records (readiness);
CREATE INDEX IF NOT EXISTS otr_installation_records_handover_idx ON otr_installation_records (handover_status);
CREATE INDEX IF NOT EXISTS otr_installation_records_assignee_idx ON otr_installation_records (assigned_user_id);
CREATE INDEX IF NOT EXISTS otr_installation_records_planned_idx ON otr_installation_records (planned_at);

CREATE TABLE IF NOT EXISTS otr_installation_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES otr_installation_records(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name varchar(240) NOT NULL,
  stored_name varchar(240) NOT NULL,
  storage_path text NOT NULL,
  mime_type varchar(120),
  file_size integer,
  uploaded_by uuid,
  uploaded_by_name varchar(160),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  archived boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS otr_installation_photos_record_idx
  ON otr_installation_photos (installation_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS otr_installation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES otr_installation_records(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action varchar(80) NOT NULL,
  field_name varchar(80),
  previous_value text,
  new_value text,
  remarks text,
  user_id uuid,
  user_name varchar(160),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otr_installation_events_record_idx
  ON otr_installation_events (installation_id, created_at DESC);

INSERT INTO "Lookup" ("id", "type", "code", "label", "sortOrder", "active", "updatedAt")
VALUES
  (gen_random_uuid(), 'INSTALLATION_STAGE', 'NOT_STARTED', 'Not Started', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'INSTALLATION_STAGE', 'INSTALLATION', 'Installation', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'INSTALLATION_STAGE', 'COMPLETED', 'Completed', 3, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SITE_READINESS', 'READY', 'Ready', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SITE_READINESS', 'NOT_READY', 'Not Ready', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'INSTALLATION_STATUS', 'NOT_STARTED', 'Not Started', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'INSTALLATION_STATUS', 'IN_PROGRESS', 'In Progress', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'INSTALLATION_STATUS', 'ON_HOLD', 'On Hold', 3, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'INSTALLATION_STATUS', 'COMPLETED', 'Completed', 4, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'HANDOVER_STATUS', 'PENDING', 'Pending', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'HANDOVER_STATUS', 'IN_PROGRESS', 'In Progress', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'HANDOVER_STATUS', 'COMPLETED', 'Completed', 3, true, CURRENT_TIMESTAMP)
ON CONFLICT ("type", "code") DO NOTHING;
