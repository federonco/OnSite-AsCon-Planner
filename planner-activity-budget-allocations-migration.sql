ALTER TABLE IF EXISTS planner_activities
ADD COLUMN IF NOT EXISTS budget_allocations jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN planner_activities.budget_allocations IS
'Planning-only budget split by cost code. Array of objects: { cost_code (text), amount (number), note (text|null) }.';

