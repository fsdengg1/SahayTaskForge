ALTER TABLE projects ADD COLUMN IF NOT EXISTS po_number varchar(80);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS currency varchar(8) DEFAULT 'INR';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS currency_value numeric(14, 2);
