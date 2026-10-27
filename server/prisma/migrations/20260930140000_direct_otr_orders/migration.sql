ALTER TABLE projects ADD COLUMN IF NOT EXISTS otr_source varchar(20);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS otr_customer varchar(200);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS otr_location varchar(200);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS otr_product varchar(200);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS otr_po_status varchar(40);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS otr_project_value numeric(14, 2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS otr_remarks text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS otr_request_id uuid;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS otr_archived_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS projects_otr_request_id_key
  ON projects (otr_request_id)
  WHERE otr_request_id IS NOT NULL;
