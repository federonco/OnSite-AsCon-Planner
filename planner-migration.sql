-- OnSite-P (Planner) Migration
-- Tables for construction planning: activities and dependencies
--
-- RLS below calls get_admin_crew_ids() — that function must exist in the shared
-- OnSite Supabase (it may be implemented on top of user_app_roles / has_role;
-- do not duplicate role logic here). If your project never had it, apply the
-- ecosystem migration that defines it before these policies, or adjust policies
-- with your DBA.

-- ============================================================
-- 1. planner_activities
-- ============================================================
CREATE TABLE planner_activities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id             uuid NOT NULL REFERENCES crews(id),
  name                text NOT NULL,
  start_date          date NOT NULL,
  end_date            date NOT NULL,
  duration_days       integer GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
  status              text NOT NULL DEFAULT 'planned'
                        CHECK (status IN ('planned', 'in_progress', 'done', 'blocked')),
  drainer_section_id  uuid REFERENCES drainer_sections(id),
  drainer_segment_id  uuid REFERENCES alignment_segments(id),
  progress_percent    integer DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  notes               text,
  wbs_code            text,
  is_baseline         boolean NOT NULL DEFAULT false,
  parent_activity_id  uuid REFERENCES planner_activities(id) ON DELETE SET NULL,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_planner_activities_crew ON planner_activities(crew_id);
CREATE INDEX idx_planner_activities_dates ON planner_activities(start_date, end_date);
CREATE INDEX idx_planner_activities_parent ON planner_activities(parent_activity_id);
CREATE INDEX idx_planner_activities_status ON planner_activities(status);

-- Auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION update_planner_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_planner_activities_updated
  BEFORE UPDATE ON planner_activities
  FOR EACH ROW EXECUTE FUNCTION update_planner_updated_at();

-- ============================================================
-- 2. planner_dependencies (schema now, UI Phase 2)
-- ============================================================
CREATE TABLE planner_dependencies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_id  uuid NOT NULL REFERENCES planner_activities(id) ON DELETE CASCADE,
  successor_id    uuid NOT NULL REFERENCES planner_activities(id) ON DELETE CASCADE,
  type            text NOT NULL DEFAULT 'FS'
                    CHECK (type IN ('FS', 'SS', 'FF', 'SF')),
  lag_days        integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_dependency CHECK (predecessor_id <> successor_id),
  CONSTRAINT unique_dependency UNIQUE (predecessor_id, successor_id)
);

CREATE INDEX idx_planner_deps_predecessor ON planner_dependencies(predecessor_id);
CREATE INDEX idx_planner_deps_successor ON planner_dependencies(successor_id);

-- ============================================================
-- 3. RLS Policies
-- ============================================================
ALTER TABLE planner_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_dependencies ENABLE ROW LEVEL SECURITY;

-- Activities: everyone can view all crews
CREATE POLICY "Anyone can view planner activities"
ON planner_activities FOR SELECT
USING (true);

-- Activities: crew editors can insert for their crews
CREATE POLICY "Crew editors can insert activities"
ON planner_activities FOR INSERT
WITH CHECK (
  crew_id IN (SELECT get_admin_crew_ids())
);

-- Activities: crew editors can update their crew's activities
CREATE POLICY "Crew editors can update activities"
ON planner_activities FOR UPDATE
USING (crew_id IN (SELECT get_admin_crew_ids()));

-- Activities: crew editors can delete their crew's activities
CREATE POLICY "Crew editors can delete activities"
ON planner_activities FOR DELETE
USING (crew_id IN (SELECT get_admin_crew_ids()));

-- Dependencies: everyone can view
CREATE POLICY "Anyone can view dependencies"
ON planner_dependencies FOR SELECT
USING (true);

-- Dependencies: editors can insert if they own the predecessor
CREATE POLICY "Editors can insert dependencies"
ON planner_dependencies FOR INSERT
WITH CHECK (
  predecessor_id IN (
    SELECT id FROM planner_activities
    WHERE crew_id IN (SELECT get_admin_crew_ids())
  )
);

-- Dependencies: editors can update if they own the predecessor
CREATE POLICY "Editors can update dependencies"
ON planner_dependencies FOR UPDATE
USING (
  predecessor_id IN (
    SELECT id FROM planner_activities
    WHERE crew_id IN (SELECT get_admin_crew_ids())
  )
);

-- Dependencies: editors can delete if they own the predecessor
CREATE POLICY "Editors can delete dependencies"
ON planner_dependencies FOR DELETE
USING (
  predecessor_id IN (
    SELECT id FROM planner_activities
    WHERE crew_id IN (SELECT get_admin_crew_ids())
  )
);
