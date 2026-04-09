/** Activity status options */
export const ACTIVITY_STATUSES = ["planned", "in_progress", "done", "blocked"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/** Dependency link types */
export const DEPENDENCY_TYPES = ["FS", "SS", "FF", "SF"] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

/** Horizon options in weeks */
export const HORIZON_OPTIONS = [2, 4, 6, 8] as const;
export type HorizonWeeks = (typeof HORIZON_OPTIONS)[number];

export interface PlannerActivity {
  /** Stable UUID for DB row; use as canonical key for external schedulers / BIM tools polling Supabase or `/api/planner/schedule-manifest`. */
  id: string;
  crew_id: string;
  crew_name?: string;
  name: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  status: ActivityStatus;
  drainer_section_id: string | null;
  drainer_segment_id: string | null;
  progress_percent: number;
  notes: string | null;
  wbs_code: string | null;
  is_baseline: boolean;
  parent_activity_id: string | null;
  /** Optional single predecessor link used by calendar/gantt linking UX. */
  predecessor_id?: string | null;
  dependency_type?: DependencyType | null;
  dependency_lag_days?: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** Present when row was created via XML import (column nullable until migration applied). */
  import_meta?: Record<string, unknown> | null;
  /** Budget baseline for cost tracking (nullable — not every activity has a budget). */
  budget_amount: number | null;
  /** Assigned cost lines stored in planner_activities.cost_entries JSONB. */
  cost_entries?: PlannerAssignedCostEntry[];
}

export interface PlannerDependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
  type: DependencyType;
  lag_days: number;
  created_at: string;
}

/** Crew-scoped people leave (from QR form or future admin UI). */
export interface PlannerPeopleLeave {
  id: string;
  crew_id: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  person_name: string | null;
  created_at: string;
}

/**
 * Subset of columns from Supabase `drainer_sections` exposed to the planner
 * section filter and activity forms (`GET /api/planner/sections`).
 */
export interface DrainerSectionListItem {
  id: string;
  name: string;
}

/** Payload for creating an activity */
export interface CreateActivityPayload {
  crew_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status?: ActivityStatus;
  drainer_section_id?: string | null;
  drainer_segment_id?: string | null;
  notes?: string | null;
  wbs_code?: string | null;
  is_baseline?: boolean;
  parent_activity_id?: string | null;
  sort_order?: number;
  progress_percent?: number;
  predecessor_id?: string | null;
  dependency_type?: DependencyType | null;
  dependency_lag_days?: number | null;
  budget_amount?: number | null;
  cost_entries?: PlannerAssignedCostEntry[];
}

/** Payload for updating an activity (all fields optional except id) */
export interface UpdateActivityPayload {
  id: string;
  name?: string;
  start_date?: string;
  end_date?: string;
  status?: ActivityStatus;
  notes?: string | null;
  wbs_code?: string | null;
  sort_order?: number;
  progress_percent?: number;
  drainer_section_id?: string | null;
  drainer_segment_id?: string | null;
  predecessor_id?: string | null;
  dependency_type?: DependencyType | null;
  dependency_lag_days?: number | null;
  budget_amount?: number | null;
  cost_entries?: PlannerAssignedCostEntry[];
}

/** Drainer progress summary for a section */
export interface DrainerProgress {
  section_id: string;
  total_segments: number;
  installed_count: number;
  backfilled_count: number;
  progress_percent: number;
}

/** Top-level cost categories used by catalogue + assignment */
export const COST_CATEGORIES = ["machinery", "labour", "materials"] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export interface PlannerCostCatalogueItem {
  id: string;
  category: CostCategory;
  name: string;
  description: string | null;
  cost_code?: string | null;
  source_group?: string | null;
  source_meta?: Record<string, unknown> | null;
  unit: string;
  unit_rate: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlannerWbsItem {
  id: string;
  code: string;
  label: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CostRecord {
  id: string;
  activity_id: string;
  catalogue_item_id: string | null;
  name: string;
  unit: string;
  /** Catalogue / baseline rate per unit */
  unit_rate: number;
  /** When set, amount uses this instead of unit_rate */
  override_unit_rate: number | null;
  quantity: number;
  amount: number;
  cost_date: string;
  category: CostCategory;
  description: string | null;
  created_at: string;
}

export interface PlannerAssignedCostEntry {
  id: string;
  catalogue_item_id: string | null;
  category: CostCategory;
  name: string;
  unit: string;
  unit_rate: number;
  override_unit_rate: number | null;
  quantity: number;
  amount: number;
  cost_date: string;
  description: string | null;
  created_at: string;
}

export interface CreateCostRecordPayload {
  activity_id: string;
  catalogue_item_id?: string | null;
  name?: string;
  unit?: string;
  unit_rate: number;
  override_unit_rate?: number | null;
  quantity: number;
  cost_date: string;
  category?: CostCategory;
  description?: string | null;
}

export interface UpdateCostRecordPayload {
  id: string;
  name?: string;
  unit?: string;
  unit_rate?: number;
  override_unit_rate?: number | null;
  quantity?: number;
  cost_date?: string;
  category?: CostCategory;
  description?: string | null;
}

/** Client-side computed cost summary for an activity */
export interface ActivityCostSummary {
  budget: number;
  actual: number;
  variance: number;
  by_category: Record<CostCategory, number>;
  eac: number | null;
  etc: number | null;
  progress_percent: number;
}

/** Parsed task from MS Project XML */
export interface ParsedProjectTask {
  uid: number;
  wbs_code: string;
  name: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  outline_level: number;
  is_summary: boolean;
  predecessors: Array<{
    predecessor_uid: number;
    type: DependencyType;
    lag_days: number;
  }>;
}
