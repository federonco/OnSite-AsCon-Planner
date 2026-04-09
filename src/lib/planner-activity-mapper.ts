import type { ActivityStatus, DependencyType, PlannerActivity } from "./planner-types";
import { ACTIVITY_STATUSES, DEPENDENCY_TYPES } from "./planner-types";
import { computeCostLineAmount } from "./planner-cost-utils";
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

function sanitizeCostEntries(v: unknown): PlannerActivity["cost_entries"] {
  if (!Array.isArray(v)) return [];
  const allowed = new Set(["machinery", "labour", "materials"]);
  return v
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const r = x as Record<string, unknown>;
      const id = String(r.id ?? "").trim();
      const name = String(r.name ?? "").trim();
      const unit = String(r.unit ?? "").trim();
      const costDate = String(r.cost_date ?? "").trim();
      const unitRate = Number(r.unit_rate);
      const quantity = Number(r.quantity);
      const overrideRaw = r.override_unit_rate;
      const override =
        overrideRaw != null && String(overrideRaw).trim() !== "" && Number.isFinite(Number(overrideRaw))
          ? Number(overrideRaw)
          : null;
      if (!id || !name || !unit || !/^\d{4}-\d{2}-\d{2}$/.test(costDate)) return null;
      if (!Number.isFinite(unitRate) || !Number.isFinite(quantity)) return null;
      const category = String(r.category ?? "materials").toLowerCase();
      return {
        id,
        catalogue_item_id:
          r.catalogue_item_id != null && String(r.catalogue_item_id).trim() !== ""
            ? String(r.catalogue_item_id)
            : null,
        category: (allowed.has(category) ? category : "materials") as "machinery" | "labour" | "materials",
        name,
        unit,
        unit_rate: unitRate,
        override_unit_rate: override,
        quantity,
        amount: computeCostLineAmount(quantity, unitRate, override),
        cost_date: costDate,
        description: r.description != null ? String(r.description) : null,
        created_at: String(r.created_at ?? ""),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

function asDependencyType(v: unknown): DependencyType | null {
  if (typeof v === "string" && (DEPENDENCY_TYPES as readonly string[]).includes(v)) {
    return v as DependencyType;
  }
  return null;
}

/**
 * Normalize API/Supabase row into PlannerActivity. Single source of truth for dates/progress/status.
 * Returns null if the row cannot be shown (missing id/crew_id, or invalid start_date).
 */
export function mapRowToPlannerActivity(row: Record<string, unknown>): PlannerActivity | null {
  const id = String(row.id ?? "").trim();
  const crew_id = String(row.crew_id ?? "").trim();
  const drainer_section_id =
    row.drainer_section_id != null && String(row.drainer_section_id).trim() !== ""
      ? String(row.drainer_section_id).trim()
      : null;
  if (!id || !crew_id) return null;

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
    predecessor_id: row.predecessor_id != null ? String(row.predecessor_id) : null,
    dependency_type: asDependencyType(row.dependency_type),
    dependency_lag_days:
      row.dependency_lag_days == null ? null : Number.isFinite(Number(row.dependency_lag_days)) ? Number(row.dependency_lag_days) : null,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : Number(row.sort_order) || 0,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    import_meta:
      row.import_meta != null && typeof row.import_meta === "object"
        ? (row.import_meta as Record<string, unknown>)
        : null,
    budget_amount:
      row.budget_amount != null && Number.isFinite(Number(row.budget_amount))
        ? Number(row.budget_amount)
        : null,
    cost_entries: sanitizeCostEntries(row.cost_entries),
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
