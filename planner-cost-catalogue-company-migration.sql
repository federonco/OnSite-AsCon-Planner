ALTER TABLE planner_cost_catalogue
  ADD COLUMN IF NOT EXISTS company text;

CREATE INDEX IF NOT EXISTS idx_planner_cost_catalogue_company
  ON planner_cost_catalogue(company);

