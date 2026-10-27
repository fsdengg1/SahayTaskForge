CREATE TABLE IF NOT EXISTS otr_procurement_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  po_number varchar(80) NOT NULL,
  material_id uuid REFERENCES materials(id),
  material_name varchar(240) NOT NULL,
  material_key varchar(200) NOT NULL,
  unit varchar(40),
  quantity numeric(14,3) NOT NULL,
  vendor_id uuid REFERENCES vendors(id),
  vendor_name varchar(240),
  po_at timestamptz,
  expected_at timestamptz,
  status varchar(40) NOT NULL,
  remarks text,
  created_by uuid,
  created_by_name varchar(160),
  updated_by uuid,
  updated_by_name varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by_name varchar(160),
  CONSTRAINT otr_procurement_records_qty_check CHECK (quantity > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS otr_procurement_active_line_idx
  ON otr_procurement_records (project_id, lower(po_number), material_key)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS otr_procurement_project_idx ON otr_procurement_records (project_id);
CREATE INDEX IF NOT EXISTS otr_procurement_status_idx ON otr_procurement_records (status);
CREATE INDEX IF NOT EXISTS otr_procurement_vendor_idx ON otr_procurement_records (vendor_id);
CREATE INDEX IF NOT EXISTS otr_procurement_material_idx ON otr_procurement_records (material_id);
CREATE INDEX IF NOT EXISTS otr_procurement_po_idx ON otr_procurement_records (po_at);
CREATE INDEX IF NOT EXISTS otr_procurement_expected_idx ON otr_procurement_records (expected_at);

CREATE TABLE IF NOT EXISTS otr_procurement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES otr_procurement_records(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS otr_procurement_events_record_idx
  ON otr_procurement_events (record_id, created_at DESC);

INSERT INTO "Lookup" ("id", "type", "code", "label", "sortOrder", "active", "updatedAt")
VALUES
  (gen_random_uuid(), 'PROCUREMENT_LINE_STATUS', 'PENDING', 'Pending', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PROCUREMENT_LINE_STATUS', 'ORDERED', 'Ordered', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PROCUREMENT_LINE_STATUS', 'IN_PRODUCTION', 'In Production', 3, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PROCUREMENT_LINE_STATUS', 'PARTIALLY_RECEIVED', 'Partially Received', 4, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PROCUREMENT_LINE_STATUS', 'RECEIVED', 'Received', 5, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PROCUREMENT_LINE_STATUS', 'COMPLETED', 'Completed', 6, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PROCUREMENT_LINE_STATUS', 'ON_HOLD', 'On Hold', 7, true, CURRENT_TIMESTAMP)
ON CONFLICT ("type", "code") DO NOTHING;
