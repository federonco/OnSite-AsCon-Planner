-- ============================================================
-- Pipeline Tracker — Supabase Migration
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================
-- Compatible with existing OnSite schema:
--   regions → crews → drainer_sections → drainer_pipe_records
-- ============================================================

-- 1. ALIGNMENT SEGMENTS
-- Each 12.2m pipe along the surveyed alignment
CREATE TABLE IF NOT EXISTS alignment_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES drainer_sections(id) ON DELETE CASCADE,
  segment_number integer NOT NULL,
  chainage_start numeric NOT NULL,
  chainage_end numeric NOT NULL,
  lat_start double precision,
  lng_start double precision,
  lat_end double precision,
  lng_end double precision,
  pipe_type text DEFAULT 'MSCL DN1600',
  created_at timestamptz DEFAULT now(),

  UNIQUE (section_id, segment_number)
);

CREATE INDEX idx_alignment_segments_section ON alignment_segments(section_id);
CREATE INDEX idx_alignment_segments_chainage ON alignment_segments(chainage_start);

-- 2. ALIGNMENT CHECKPOINTS
-- Bends, fittings, crossings, valves, tie-ins (admin-managed)
CREATE TABLE IF NOT EXISTS alignment_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES drainer_sections(id) ON DELETE CASCADE,
  chainage numeric NOT NULL,
  lat double precision,
  lng double precision,
  type text NOT NULL CHECK (type IN ('bend', 'fitting', 'crossing', 'valve', 'tie-in', 'other')),
  label text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_alignment_checkpoints_section ON alignment_checkpoints(section_id);
CREATE INDEX idx_alignment_checkpoints_chainage ON alignment_checkpoints(chainage);

-- 3. ALIGNMENT PROGRESS
-- Status tracking per segment (history-preserving)
CREATE TABLE IF NOT EXISTS alignment_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid NOT NULL REFERENCES alignment_segments(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'installed', 'backfilled')),
  status_date date DEFAULT CURRENT_DATE,
  updated_by text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_alignment_progress_segment ON alignment_progress(segment_id);
CREATE INDEX idx_alignment_progress_status ON alignment_progress(status);
CREATE INDEX idx_alignment_progress_date ON alignment_progress(status_date);

-- ============================================================
-- RLS POLICIES
-- Same pattern as existing OnSite tables
-- ============================================================

ALTER TABLE alignment_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE alignment_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE alignment_progress ENABLE ROW LEVEL SECURITY;

-- alignment_segments: SELECT
CREATE POLICY "segments_select_by_crew"
ON alignment_segments FOR SELECT
USING (
  section_id IN (
    SELECT id FROM drainer_sections
    WHERE crew_id IN (SELECT get_admin_crew_ids())
  )
);

-- alignment_segments: INSERT
CREATE POLICY "segments_insert_by_crew"
ON alignment_segments FOR INSERT
WITH CHECK (
  section_id IN (
    SELECT id FROM drainer_sections
    WHERE crew_id IN (SELECT get_admin_crew_ids())
  )
);

-- alignment_segments: UPDATE
CREATE POLICY "segments_update_by_crew"
ON alignment_segments FOR UPDATE
USING (
  section_id IN (
    SELECT id FROM drainer_sections
    WHERE crew_id IN (SELECT get_admin_crew_ids())
  )
);

-- alignment_segments: DELETE
CREATE POLICY "segments_delete_by_crew"
ON alignment_segments FOR DELETE
USING (
  section_id IN (
    SELECT id FROM drainer_sections
    WHERE crew_id IN (SELECT get_admin_crew_ids())
  )
);

-- alignment_checkpoints: SELECT
CREATE POLICY "checkpoints_select_by_crew"
ON alignment_checkpoints FOR SELECT
USING (
  section_id IN (
    SELECT id FROM drainer_sections
    WHERE crew_id IN (SELECT get_admin_crew_ids())
  )
);

-- alignment_checkpoints: INSERT
CREATE POLICY "checkpoints_insert_by_crew"
ON alignment_checkpoints FOR INSERT
WITH CHECK (
  section_id IN (
    SELECT id FROM drainer_sections
    WHERE crew_id IN (SELECT get_admin_crew_ids())
  )
);

-- alignment_checkpoints: UPDATE
CREATE POLICY "checkpoints_update_by_crew"
ON alignment_checkpoints FOR UPDATE
USING (
  section_id IN (
    SELECT id FROM drainer_sections
    WHERE crew_id IN (SELECT get_admin_crew_ids())
  )
);

-- alignment_checkpoints: DELETE
CREATE POLICY "checkpoints_delete_by_crew"
ON alignment_checkpoints FOR DELETE
USING (
  section_id IN (
    SELECT id FROM drainer_sections
    WHERE crew_id IN (SELECT get_admin_crew_ids())
  )
);

-- alignment_progress: SELECT (via segment → section → crew)
CREATE POLICY "progress_select_by_crew"
ON alignment_progress FOR SELECT
USING (
  segment_id IN (
    SELECT as2.id FROM alignment_segments as2
    JOIN drainer_sections ds ON as2.section_id = ds.id
    WHERE ds.crew_id IN (SELECT get_admin_crew_ids())
  )
);

-- alignment_progress: INSERT
CREATE POLICY "progress_insert_by_crew"
ON alignment_progress FOR INSERT
WITH CHECK (
  segment_id IN (
    SELECT as2.id FROM alignment_segments as2
    JOIN drainer_sections ds ON as2.section_id = ds.id
    WHERE ds.crew_id IN (SELECT get_admin_crew_ids())
  )
);

-- alignment_progress: UPDATE
CREATE POLICY "progress_update_by_crew"
ON alignment_progress FOR UPDATE
USING (
  segment_id IN (
    SELECT as2.id FROM alignment_segments as2
    JOIN drainer_sections ds ON as2.section_id = ds.id
    WHERE ds.crew_id IN (SELECT get_admin_crew_ids())
  )
);

-- ============================================================
-- HELPER VIEW: Segments with latest status
-- Useful for map rendering
-- ============================================================

CREATE OR REPLACE VIEW alignment_segments_with_status AS
SELECT
  s.*,
  COALESCE(p.status, 'pending') AS current_status,
  p.status_date,
  p.updated_by
FROM alignment_segments s
LEFT JOIN LATERAL (
  SELECT status, status_date, updated_by
  FROM alignment_progress
  WHERE segment_id = s.id
  ORDER BY created_at DESC
  LIMIT 1
) p ON true;
