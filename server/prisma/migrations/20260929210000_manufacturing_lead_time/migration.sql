ALTER TABLE projects ADD COLUMN IF NOT EXISTS po_date date;

CREATE TABLE IF NOT EXISTS otr_manufacturing_lead_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  po_at timestamptz,
  drawing_approval_at timestamptz,
  material_ready_at timestamptz,
  manufacturing_started_at timestamptz,
  manufacturing_completed_at timestamptz,
  dispatch_at timestamptz,
  delivery_at timestamptz,
  status varchar(40) NOT NULL,
  status_locked boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_by_name varchar(160),
  updated_by uuid,
  updated_by_name varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by_name varchar(160)
);

CREATE UNIQUE INDEX IF NOT EXISTS otr_mfg_lead_active_project_idx
  ON otr_manufacturing_lead_times (project_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS otr_mfg_lead_project_idx ON otr_manufacturing_lead_times (project_id);
CREATE INDEX IF NOT EXISTS otr_mfg_lead_status_idx ON otr_manufacturing_lead_times (status);
CREATE INDEX IF NOT EXISTS otr_mfg_lead_po_idx ON otr_manufacturing_lead_times (po_at);
CREATE INDEX IF NOT EXISTS otr_mfg_lead_delivery_idx ON otr_manufacturing_lead_times (delivery_at);

CREATE TABLE IF NOT EXISTS otr_manufacturing_lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES otr_manufacturing_lead_times(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action varchar(80) NOT NULL,
  field_name varchar(80),
  previous_value text,
  new_value text,
  user_id uuid,
  user_name varchar(160),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otr_mfg_lead_events_record_idx
  ON otr_manufacturing_lead_events (record_id, created_at DESC);

INSERT INTO "Lookup" ("id", "type", "code", "label", "sortOrder", "active", "updatedAt")
VALUES
  (gen_random_uuid(), 'MANUFACTURING_LEAD_STATUS', 'NOT_STARTED', 'Not Started', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MANUFACTURING_LEAD_STATUS', 'DRAWING_APPROVAL', 'Drawing Approval', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MANUFACTURING_LEAD_STATUS', 'MATERIAL_READY', 'Material Ready', 3, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MANUFACTURING_LEAD_STATUS', 'MANUFACTURING', 'Manufacturing', 4, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MANUFACTURING_LEAD_STATUS', 'DISPATCHED', 'Dispatched', 5, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MANUFACTURING_LEAD_STATUS', 'DELIVERED', 'Delivered', 6, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MANUFACTURING_LEAD_STATUS', 'ON_HOLD', 'On Hold', 7, true, CURRENT_TIMESTAMP)
ON CONFLICT ("type", "code") DO NOTHING;
