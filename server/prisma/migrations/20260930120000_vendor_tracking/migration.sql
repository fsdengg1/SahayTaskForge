CREATE TABLE IF NOT EXISTS otr_vendor_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id uuid NOT NULL REFERENCES otr_procurement_records(id) ON DELETE CASCADE,
  manufacturing_status varchar(40) NOT NULL DEFAULT 'NOT_STARTED',
  dispatch_at timestamptz,
  delivery_at timestamptz,
  status varchar(40) NOT NULL DEFAULT 'PENDING',
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

CREATE UNIQUE INDEX IF NOT EXISTS otr_vendor_tracks_active_procurement_idx
  ON otr_vendor_tracks (procurement_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS otr_vendor_tracks_procurement_idx ON otr_vendor_tracks (procurement_id);
CREATE INDEX IF NOT EXISTS otr_vendor_tracks_status_idx ON otr_vendor_tracks (status);
CREATE INDEX IF NOT EXISTS otr_vendor_tracks_mfg_idx ON otr_vendor_tracks (manufacturing_status);

CREATE TABLE IF NOT EXISTS otr_vendor_track_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES otr_vendor_tracks(id) ON DELETE CASCADE,
  procurement_id uuid NOT NULL REFERENCES otr_procurement_records(id) ON DELETE CASCADE,
  action varchar(80) NOT NULL,
  field_name varchar(80),
  previous_value text,
  new_value text,
  user_id uuid,
  user_name varchar(160),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otr_vendor_track_events_idx
  ON otr_vendor_track_events (track_id, created_at DESC);

INSERT INTO "Lookup" ("id", "type", "code", "label", "sortOrder", "active", "updatedAt")
VALUES
  (gen_random_uuid(), 'VENDOR_MANUFACTURING_STATUS', 'NOT_STARTED', 'Not Started', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'VENDOR_MANUFACTURING_STATUS', 'IN_PROGRESS', 'In Progress', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'VENDOR_MANUFACTURING_STATUS', 'COMPLETED', 'Completed', 3, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'VENDOR_MANUFACTURING_STATUS', 'ON_HOLD', 'On Hold', 4, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'VENDOR_TRACK_STATUS', 'PENDING', 'Pending', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'VENDOR_TRACK_STATUS', 'IN_PROGRESS', 'In Progress', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'VENDOR_TRACK_STATUS', 'DELIVERED', 'Delivered', 3, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'VENDOR_TRACK_STATUS', 'DELAYED', 'Delayed', 4, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'VENDOR_TRACK_STATUS', 'ON_HOLD', 'On Hold', 5, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'VENDOR_TRACK_STATUS', 'COMPLETED', 'Completed', 6, true, CURRENT_TIMESTAMP)
ON CONFLICT ("type", "code") DO NOTHING;
