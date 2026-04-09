CREATE TABLE IF NOT EXISTS planner_daily_cost_actuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_date date NOT NULL,
  wbs_code text NOT NULL,
  category text NOT NULL CHECK (category IN ('machinery', 'labour', 'materials')),
  item_name text NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL,
  unit_rate numeric NOT NULL,
  override_unit_rate numeric NULL,
  amount numeric NOT NULL,
  catalogue_item_id uuid NULL,
  resource_crew text NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS planner_daily_cost_actuals_date_idx
ON planner_daily_cost_actuals (cost_date);

CREATE INDEX IF NOT EXISTS planner_daily_cost_actuals_wbs_idx
ON planner_daily_cost_actuals (wbs_code);
