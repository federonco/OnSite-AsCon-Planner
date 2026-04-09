CREATE UNIQUE INDEX IF NOT EXISTS planner_daily_cost_actuals_unique_resource_per_day_idx
ON public.planner_daily_cost_actuals (cost_date, catalogue_item_id)
WHERE catalogue_item_id IS NOT NULL;
