-- People leaves + QR tokens (OnSite Planner)
-- Applied on Supabase as migration planner_people_leaves_and_qr_tokens (+ RLS fixes).

CREATE TABLE IF NOT EXISTS planner_people_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  person_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planner_people_leaves_end_after_start CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_planner_people_leaves_crew ON planner_people_leaves(crew_id);
CREATE INDEX IF NOT EXISTS idx_planner_people_leaves_dates ON planner_people_leaves(start_date, end_date);

CREATE TABLE IF NOT EXISTS planner_leave_qr_tokens (
  token text PRIMARY KEY,
  crew_id uuid NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planner_leave_qr_tokens_crew ON planner_leave_qr_tokens(crew_id);

ALTER TABLE planner_people_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_leave_qr_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view planner people leaves"
ON planner_people_leaves FOR SELECT
USING (true);

-- No INSERT/UPDATE policies for anon: Next.js API uses service role (bypasses RLS).
-- No SELECT on planner_leave_qr_tokens for anon: token validation only server-side.
