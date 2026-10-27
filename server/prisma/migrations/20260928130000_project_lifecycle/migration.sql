ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_status varchar(40) NOT NULL DEFAULT 'NEW';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_submitted_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_submitted_by_name varchar(160);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_sent_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_sent_by_name varchar(160);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_drawing_version integer;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_bom_version integer;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_approved_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_approval_remarks text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_approved_drawing_version integer;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_approved_bom_version integer;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS approved_drawing_version integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS approved_bom_version integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS design_completed_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS design_completed_by_name varchar(160);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS final_drawing_version integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS final_layout_version integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS final_bom_version integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closure_remarks text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closed_by_name varchar(160);

ALTER TABLE design_files DROP CONSTRAINT IF EXISTS design_files_kind_check;
ALTER TABLE design_files ADD CONSTRAINT design_files_kind_check
  CHECK (kind IN ('DRAWING', 'BOM', 'LAYOUT'));

CREATE TABLE IF NOT EXISTS presales_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind varchar(20) NOT NULL CHECK (kind IN ('PRE_DRAWING', 'PRE_BOM')),
  drawing_name varchar(240),
  file_name varchar(240) NOT NULL,
  stored_name varchar(240) NOT NULL,
  storage_path text NOT NULL,
  mime_type varchar(120),
  file_size integer,
  file_type varchar(16),
  version integer NOT NULL CHECK (version > 0),
  status varchar(40) NOT NULL,
  remarks text,
  uploaded_by uuid,
  uploaded_by_name varchar(160),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  archived boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS presales_files_lead_kind_version_key
  ON presales_files (lead_id, kind, version);

CREATE TABLE IF NOT EXISTS project_stage_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage varchar(32) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'PENDING',
  started_at timestamptz,
  target_at timestamptz,
  completed_at timestamptz,
  assigned_name varchar(160),
  remarks text,
  updated_by_name varchar(160),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, stage)
);

CREATE TABLE IF NOT EXISTS workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  project_id uuid,
  action varchar(80) NOT NULL,
  previous_status varchar(80),
  new_status varchar(80),
  remarks text,
  user_id uuid,
  user_name varchar(160),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_events_lead_idx ON workflow_events (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_events_project_idx ON workflow_events (project_id, created_at DESC);

UPDATE leads l
SET workflow_status = 'CUSTOMER_APPROVED'
WHERE EXISTS (
  SELECT 1 FROM projects p
  WHERE p.lead_id = l.id
    AND UPPER(REPLACE(COALESCE(p.order_status, ''), ' ', '_')) IN ('ORDER_CONFIRMED', 'CONFIRMED')
);
