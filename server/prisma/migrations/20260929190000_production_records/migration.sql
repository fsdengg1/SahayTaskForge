CREATE TABLE IF NOT EXISTS production_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage varchar(40) NOT NULL,
  progress_pct numeric(5,1) NOT NULL,
  material_status varchar(40) NOT NULL,
  qc_status varchar(40) NOT NULL,
  status varchar(40) NOT NULL,
  started_at timestamptz,
  planned_at timestamptz,
  completed_at timestamptz,
  follow_up_at timestamptz,
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
  CONSTRAINT production_records_progress_check CHECK (progress_pct >= 0 AND progress_pct <= 100),
  CONSTRAINT production_records_material_check CHECK (material_status IN ('AVAILABLE', 'PARTIAL', 'PENDING')),
  CONSTRAINT production_records_qc_check CHECK (qc_status IN ('PENDING', 'IN_PROGRESS', 'PASSED', 'FAILED', 'REWORK')),
  CONSTRAINT production_records_status_check CHECK (
    status IN ('NOT_STARTED', 'IN_PROGRESS', 'ON_TRACK', 'MONITORING', 'ON_HOLD', 'COMPLETED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS production_records_active_project_idx
  ON production_records (project_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS production_records_project_idx ON production_records (project_id);
CREATE INDEX IF NOT EXISTS production_records_stage_idx ON production_records (stage);
CREATE INDEX IF NOT EXISTS production_records_status_idx ON production_records (status);
CREATE INDEX IF NOT EXISTS production_records_assignee_idx ON production_records (assigned_user_id);
CREATE INDEX IF NOT EXISTS production_records_planned_idx ON production_records (planned_at);

CREATE TABLE IF NOT EXISTS production_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid NOT NULL REFERENCES production_records(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS production_events_production_idx
  ON production_events (production_id, created_at DESC);

INSERT INTO "Lookup" ("id", "type", "code", "label", "sortOrder", "active", "updatedAt")
VALUES
  (gen_random_uuid(), 'PRODUCTION_STAGE', 'MATERIAL', 'Material', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PRODUCTION_STAGE', 'CUTTING', 'Cutting', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PRODUCTION_STAGE', 'FABRICATION', 'Fabrication', 3, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PRODUCTION_STAGE', 'WELDING', 'Welding', 4, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PRODUCTION_STAGE', 'ASSEMBLY', 'Assembly', 5, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PRODUCTION_STAGE', 'PAINTING', 'Painting', 6, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PRODUCTION_STAGE', 'PACKING', 'Packing', 7, true, CURRENT_TIMESTAMP)
ON CONFLICT ("type", "code") DO NOTHING;
