import type { ActivityCostSummary, CostCategory, CostRecord } from "./planner-types";
import { COST_CATEGORIES } from "./planner-types";

/** Rate used for line amount: optional override, else catalogue unit_rate */
export function effectiveCostUnitRate(row: {
  unit_rate: number;
  override_unit_rate?: number | null;
}): number {
  const o = row.override_unit_rate;
  if (o != null && Number.isFinite(o)) return Number(o);
  return Number(row.unit_rate) || 0;
}

export function computeCostLineAmount(
  quantity: number,
  unit_rate: number,
  override_unit_rate: number | null | undefined
): number {
  const rate = override_unit_rate != null && Number.isFinite(override_unit_rate) ? override_unit_rate : unit_rate;
  return Number((Number(quantity) * Number(rate)).toFixed(2));
}

/** Labour / machinery time units that can align with activity duration */
export function isTimeBasedCostUnit(unit: string): boolean {
  const u = unit.trim().toLowerCase();
  if (!u) return false;
  if (/^(day|days|d)$/.test(u)) return true;
  if (/^(hour|hours|hr|hrs|h)$/.test(u)) return true;
  return false;
}

/**
 * Suggested quantity from inclusive duration_days (calendar).
 * - day-like units → duration_days
 * - hour-like units → duration_days × 8 (working hours per day)
 */
export function suggestedQuantityFromDuration(unit: string, durationDays: number): number | null {
  if (!Number.isFinite(durationDays) || durationDays <= 0) return null;
  const u = unit.trim().toLowerCase();
  if (/^(day|days|d)$/.test(u)) return durationDays;
  if (/^(hour|hours|hr|hrs|h)$/.test(u)) return Math.max(0, durationDays * 8);
  return null;
}

/**
 * Compute cost summary for one activity.
 * EAC = Actual / (progress / 100) when progress > 0, else null.
 */
export function computeActivityCostSummary(
  budget: number | null,
  rows: CostRecord[],
  progressPercent: number
): ActivityCostSummary {
  const by_category = COST_CATEGORIES.reduce<Record<CostCategory, number>>(
    (acc, c) => ({ ...acc, [c]: 0 }),
    {} as Record<CostCategory, number>
  );
  const actual = rows.reduce((sum, r) => {
    const n = Number(r.amount) || 0;
    by_category[r.category] = (by_category[r.category] || 0) + n;
    return sum + n;
  }, 0);
  const safeBudget = budget ?? 0;
  const variance = safeBudget - actual;

  let eac: number | null = null;
  let etc: number | null = null;

  if (progressPercent > 0) {
    eac = actual / (progressPercent / 100);
    etc = eac - actual;
  }

  return {
    budget: safeBudget,
    actual,
    variance,
    by_category,
    eac,
    etc,
    progress_percent: progressPercent,
  };
}

/** Format a number as currency-like string (2 decimals, comma thousands). */
export function formatCost(value: number): string {
  return value.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
