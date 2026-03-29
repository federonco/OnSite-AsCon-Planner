import type { ActivityStatus, PlannerActivity } from "./planner-types";
import { ACTIVITY_STATUSES } from "./planner-types";

function asStatus(v: unknown): ActivityStatus {
  if (typeof v === "string" && (ACTIVITY_STATUSES as readonly string[]).includes(v)) {
    return v as ActivityStatus;
  }
  return "planned";
}

/** Normalize API/Supabase row into PlannerActivity (single source for Calendar / Gantt / exports). */
export function mapRowToPlannerActivity(row: Record<string, unknown>): PlannerActivity {
  const duration =
    typeof row.duration_days === "number"
      ? row.duration_days
      : Number(row.duration_days) || 0;
  const progress =
    typeof row.progress_percent === "number"
      ? row.progress_percent
      : Number(row.progress_percent) || 0;

  return {
    id: String(row.id ?? ""),
    crew_id: String(row.crew_id ?? ""),
    crew_name: row.crew_name != null ? String(row.crew_name) : undefined,
    name: String(row.name ?? ""),
    start_date: String(row.start_date ?? "").slice(0, 10),
    end_date: String(row.end_date ?? "").slice(0, 10),
    duration_days: duration,
    status: asStatus(row.status),
    drainer_section_id: row.drainer_section_id != null ? String(row.drainer_section_id) : null,
    drainer_segment_id: row.drainer_segment_id != null ? String(row.drainer_segment_id) : null,
    progress_percent: Math.min(100, Math.max(0, Math.round(progress))),
    notes: row.notes != null ? String(row.notes) : null,
    wbs_code: row.wbs_code != null ? String(row.wbs_code) : null,
    is_baseline: Boolean(row.is_baseline),
    parent_activity_id: row.parent_activity_id != null ? String(row.parent_activity_id) : null,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : Number(row.sort_order) || 0,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}
