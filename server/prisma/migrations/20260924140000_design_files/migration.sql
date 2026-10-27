CREATE TABLE IF NOT EXISTS design_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind varchar(16) NOT NULL,
  drawing_name varchar(240),
  file_name varchar(240) NOT NULL,
  stored_name varchar(240) NOT NULL,
  storage_path text NOT NULL,
  mime_type varchar(120),
  file_size integer,
  file_type varchar(16),
  version integer NOT NULL,
  status varchar(40) NOT NULL,
  remarks text,
  uploaded_by uuid,
  uploaded_by_name varchar(160),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  archived boolean NOT NULL DEFAULT false,
  CONSTRAINT design_files_kind_check CHECK (kind IN ('DRAWING', 'BOM')),
  CONSTRAINT design_files_version_positive CHECK (version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS design_files_project_kind_version_key
  ON design_files (project_id, kind, version);

CREATE INDEX IF NOT EXISTS design_files_project_kind_idx
  ON design_files (project_id, kind, archived, version DESC);
