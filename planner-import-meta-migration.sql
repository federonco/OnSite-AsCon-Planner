-- Optional: run on Supabase after deploy — stores MS Project XML import provenance.
-- Safe to run multiple times.

ALTER TABLE planner_activities
  ADD COLUMN IF NOT EXISTS import_meta jsonb;

COMMENT ON COLUMN planner_activities.import_meta IS
  'Provenance for imported rows, e.g. { "source": "xml_import", "source_uid", "source_wbs", "source_file_name" }';
