-- Planner cost catalogue (MVP)
-- Reusable quote items. Assigned lines remain in planner_activities.cost_entries JSONB.

CREATE TABLE IF NOT EXISTS planner_cost_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('machinery', 'labour', 'materials')),
  name text NOT NULL,
  description text,
  unit text NOT NULL,
  unit_rate numeric(14, 2) NOT NULL CHECK (unit_rate >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planner_cost_catalogue_category
  ON planner_cost_catalogue(category, is_active, sort_order, name);

ALTER TABLE planner_cost_catalogue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view planner cost catalogue"
ON planner_cost_catalogue FOR SELECT
USING (true);

CREATE POLICY "Planner admins manage planner cost catalogue"
ON planner_cost_catalogue FOR ALL
USING (has_role('planner', 'admin'))
WITH CHECK (has_role('planner', 'admin'));

CREATE OR REPLACE FUNCTION update_planner_cost_catalogue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_planner_cost_catalogue_updated ON planner_cost_catalogue;
CREATE TRIGGER trg_planner_cost_catalogue_updated
BEFORE UPDATE ON planner_cost_catalogue
FOR EACH ROW EXECUTE FUNCTION update_planner_cost_catalogue_updated_at();

