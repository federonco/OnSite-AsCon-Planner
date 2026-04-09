-- OnSite-P (Planner) Cost Tracking — minimal schema (no new tables)
--
-- Contraste con estructura existente (planner-migration.sql):
--   - planner_activities ya existe; solo se amplían columnas.
--   - Alternativa descartada aquí: tabla planner_cost_records (1 tabla extra, mejor para
--     reporting masivo e índices por fecha). Este archivo prioriza cero tablas nuevas.
--
-- Depends on: planner-migration.sql (planner_activities must exist)

-- ============================================================
-- 1. Budget + embedded cost lines (JSON array)
-- ============================================================
ALTER TABLE planner_activities
  ADD COLUMN IF NOT EXISTS budget_amount numeric(14, 2) DEFAULT NULL;

ALTER TABLE planner_activities
  ADD COLUMN IF NOT EXISTS cost_entries jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN planner_activities.budget_amount IS 'Optional activity budget (currency as configured in app).';
COMMENT ON COLUMN planner_activities.cost_entries IS
  'Array of objects: { id (uuid), amount (number), cost_date (date string YYYY-MM-DD), category (text), description (text|null), created_at (timestamptz ISO) }.';

-- Optional: GIN index if you later query by category/date via jsonb_path / containment (not required for typical planner loads).
-- CREATE INDEX IF NOT EXISTS idx_planner_activities_cost_entries ON planner_activities USING gin (cost_entries jsonb_path_ops);

-- ============================================================
-- 2. RLS
-- ============================================================
-- No new policies: cost data lives on planner_activities; existing RLS on that table applies.

-- ============================================================
-- 3. (Opcional) Si ya aplicaste una versión anterior con planner_cost_records
-- ============================================================
-- Descomentá y ejecutá una vez para migrar datos, luego eliminá la tabla vieja:
--
-- INSERT INTO planner_activities (id, cost_entries)
-- SELECT a.id, coalesce(
--   (SELECT jsonb_agg(
--     jsonb_build_object(
--       'id', r.id,
--       'amount', r.amount,
--       'cost_date', r.cost_date::text,
--       'category', r.category,
--       'description', r.description,
--       'created_at', r.created_at::text
--     ) ORDER BY r.cost_date, r.created_at
--   )
--   FROM planner_cost_records r WHERE r.activity_id = a.id),
--   '[]'::jsonb
-- )
-- FROM planner_activities a
-- WHERE EXISTS (SELECT 1 FROM planner_cost_records r WHERE r.activity_id = a.id)
-- ON CONFLICT (id) DO UPDATE SET cost_entries = EXCLUDED.cost_entries;
--
-- DROP TABLE IF EXISTS planner_cost_records;
