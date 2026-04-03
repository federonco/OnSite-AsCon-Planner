-- Optional: extend import_meta documentation for Primavera XER (V1).
-- The application stores XER provenance in planner_activities.import_meta (jsonb).
-- Run planner-import-meta-migration.sql first if import_meta does not exist.

COMMENT ON COLUMN planner_activities.import_meta IS
  'Provenance: XML imports use { source, source_uid, source_wbs, source_file_name }; '
  'XER imports use { source: "xer_import", source_project_id, source_task_id, source_wbs_id, '
  'source_wbs_path, source_file_name, source_calendar_id, source_calendar_name, ... }.';
