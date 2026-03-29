-- Daily Notes — task list with rollover (apply in Supabase SQL editor)
-- No dependency on get_admin_crew_ids(): open RLS below is intentional for this table.

CREATE TABLE IF NOT EXISTS daily_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  origin_date date NOT NULL,
  completed_on_date date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_tasks_title_length CHECK (char_length(trim(title)) > 0),
  CONSTRAINT daily_tasks_completed_after_origin CHECK (completed_on_date IS NULL OR completed_on_date >= origin_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_tasks_origin ON daily_tasks(origin_date);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_completed_day ON daily_tasks(completed_on_date);

-- Hot path: pending tasks rolling into a day (completed_on_date IS NULL AND origin_date <= :date)
CREATE INDEX IF NOT EXISTS idx_daily_tasks_pending_by_origin
  ON daily_tasks (origin_date)
  WHERE completed_on_date IS NULL;

CREATE OR REPLACE FUNCTION daily_tasks_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_tasks_updated ON daily_tasks;
CREATE TRIGGER trg_daily_tasks_updated
  BEFORE UPDATE ON daily_tasks
  FOR EACH ROW EXECUTE FUNCTION daily_tasks_set_updated_at();

ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view daily tasks" ON daily_tasks;
DROP POLICY IF EXISTS "Anyone can insert daily tasks" ON daily_tasks;
DROP POLICY IF EXISTS "Anyone can update daily tasks" ON daily_tasks;
DROP POLICY IF EXISTS "Anyone can delete daily tasks" ON daily_tasks;

CREATE POLICY "Anyone can view daily tasks"
  ON daily_tasks FOR SELECT USING (true);

CREATE POLICY "Anyone can insert daily tasks"
  ON daily_tasks FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update daily tasks"
  ON daily_tasks FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete daily tasks"
  ON daily_tasks FOR DELETE USING (true);
