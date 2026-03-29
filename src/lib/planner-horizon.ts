import { addWeeks, endOfWeek, format, startOfDay, startOfWeek } from "date-fns";
import { addDaysDateOnly } from "./planner-date";
import type { PlannerActivity } from "./planner-types";

/**
 * FullCalendar `validRange` and planner UX: navigable window from (min week start, activities) through horizon end (week containing today + N weeks).
 * `end` is exclusive (FullCalendar convention).
 */
export function getPlannerHorizonVisibleRange(
  horizonWeeks: number,
  activities: PlannerActivity[]
): { start: string; endExclusive: string } {
  const now = new Date();
  const weekStartsOn = 1 as const;
  const thisWeekStart = startOfWeek(now, { weekStartsOn });
  let rangeStart = format(thisWeekStart, "yyyy-MM-dd");
  for (const act of activities) {
    const s = act.start_date;
    if (s < rangeStart) rangeStart = s;
  }
  const horizonEndInclusive = format(
    endOfWeek(addWeeks(startOfDay(now), horizonWeeks), { weekStartsOn }),
    "yyyy-MM-dd"
  );
  return {
    start: rangeStart,
    endExclusive: addDaysDateOnly(horizonEndInclusive, 1),
  };
}
