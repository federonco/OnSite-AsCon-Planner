ALTER TABLE IF EXISTS planner_wbs
ADD COLUMN IF NOT EXISTS budget_amount numeric NULL;

CREATE INDEX IF NOT EXISTS planner_wbs_budget_amount_idx
ON planner_wbs (budget_amount);
