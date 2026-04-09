-- Planner WBS master list (MVP)
-- Activities still store `wbs_code` as text; this table enables predefined selectors + user-managed additions.

CREATE TABLE IF NOT EXISTS planner_wbs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planner_wbs_active_sort
  ON planner_wbs(is_active, sort_order, code);

ALTER TABLE planner_wbs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view planner WBS"
ON planner_wbs FOR SELECT
USING (true);

CREATE POLICY "Planner admins manage planner WBS"
ON planner_wbs FOR ALL
USING (has_role('planner', 'admin'))
WITH CHECK (has_role('planner', 'admin'));

CREATE OR REPLACE FUNCTION update_planner_wbs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_planner_wbs_updated ON planner_wbs;
CREATE TRIGGER trg_planner_wbs_updated
BEFORE UPDATE ON planner_wbs
FOR EACH ROW EXECUTE FUNCTION update_planner_wbs_updated_at();

