import type { ActivityStatus, PlannerActivity } from "./planner-types";
import { ACTIVITY_STATUSES } from "./planner-types";
import { calendarSpanInclusiveDays, isValidDateOnlyString, toDateOnly } from "./planner-date";

function asStatus(v: unknown): ActivityStatus {
  if (typeof v === "string" && (ACTIVITY_STATUSES as readonly string[]).includes(v)) {
    return v as ActivityStatus;
  }
  return "planned";
}

function clampProgress(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Normalize API/Supabase row into PlannerActivity. Single source of truth for dates/progress/status.
 * Returns null if the row cannot be shown (missing id/crew_id, drainer_section_id, or invalid start_date).
 */
export function mapRowToPlannerActivity(row: Record<string, unknown>): PlannerActivity | null {
  const id = String(row.id ?? "").trim();
  const crew_id = String(row.crew_id ?? "").trim();
  const drainer_section_id =
    row.drainer_section_id != null ? String(row.drainer_section_id).trim() : "";
  if (!id || !crew_id || !drainer_section_id) return null;

  const startRaw = toDateOnly(String(row.start_date ?? ""));
  if (!isValidDateOnlyString(startRaw)) return null;

  let endRaw = String(row.end_date ?? "").trim();
  endRaw = endRaw ? toDateOnly(endRaw) : startRaw;
  if (!isValidDateOnlyString(endRaw)) endRaw = startRaw;
  if (endRaw < startRaw) endRaw = startRaw;

  const durationFromRow =
    typeof row.duration_days === "number"
      ? row.duration_days
      : Number(row.duration_days);
  const duration_days = Number.isFinite(durationFromRow) && durationFromRow > 0
    ? Math.round(durationFromRow)
    : calendarSpanInclusiveDays(startRaw, endRaw);

  const progress_percent = clampProgress(row.progress_percent);

  return {
    id,
    crew_id,
    crew_name: row.crew_name != null ? String(row.crew_name) : undefined,
    name: String(row.name ?? ""),
    start_date: startRaw,
    end_date: endRaw,
    duration_days,
    status: asStatus(row.status),
    drainer_section_id,
    drainer_segment_id: row.drainer_segment_id != null ? String(row.drainer_segment_id) : null,
    progress_percent,
    notes: row.notes != null ? String(row.notes) : null,
    wbs_code: row.wbs_code != null ? String(row.wbs_code) : null,
    is_baseline: Boolean(row.is_baseline),
    parent_activity_id: row.parent_activity_id != null ? String(row.parent_activity_id) : null,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : Number(row.sort_order) || 0,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function rowHasInvalidStartDate(row: Record<string, unknown>): boolean {
  const startRaw = toDateOnly(String(row.start_date ?? ""));
  return !isValidDateOnlyString(startRaw);
}

/**
 * Map an API JSON array (unknown rows) to validated activities. Use after fetch() on the client.
 */
export function mapPlannerRowsFromApi(rows: unknown[]): {
  activities: PlannerActivity[];
  rawCount: number;
  excludedInvalidDates: number;
  excludedOther: number;
} {
  const rawCount = rows.length;
  let excludedInvalidDates = 0;
  let excludedOther = 0;
  const activities: PlannerActivity[] = [];

  for (const item of rows) {
    if (!item || typeof item !== "object") {
      excludedOther++;
      continue;
    }
    const r = item as Record<string, unknown>;
    const mapped = mapRowToPlannerActivity(r);
    if (!mapped) {
      if (rowHasInvalidStartDate(r)) excludedInvalidDates++;
      else excludedOther++;
      continue;
    }
    activities.push(mapped);
  }

  return { activities, rawCount, excludedInvalidDates, excludedOther };
}
