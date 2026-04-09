-- Extend planner_cost_catalogue to preserve workbook fields

ALTER TABLE planner_cost_catalogue
  ADD COLUMN IF NOT EXISTS cost_code text,
  ADD COLUMN IF NOT EXISTS source_group text,
  ADD COLUMN IF NOT EXISTS source_meta jsonb;

CREATE INDEX IF NOT EXISTS idx_planner_cost_catalogue_cost_code
  ON planner_cost_catalogue(cost_code);

