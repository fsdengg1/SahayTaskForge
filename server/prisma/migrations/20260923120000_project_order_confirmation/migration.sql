ALTER TABLE projects ADD COLUMN IF NOT EXISTS order_status varchar;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS order_confirmed_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS order_confirmed_by text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS order_confirmed_by_name varchar;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS order_id varchar;

CREATE UNIQUE INDEX IF NOT EXISTS projects_order_id_key ON projects (order_id) WHERE order_id IS NOT NULL;
