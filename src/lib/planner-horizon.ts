import { addWeeks, addYears, endOfWeek, format, max, parseISO, startOfDay, startOfWeek } from "date-fns";
import { addDaysDateOnly } from "./planner-date";
import type { PlannerActivity } from "./planner-types";

/** Years ahead of today for FullCalendar `validRange` / month popup (horizon only controls grid width, not this cap). */
const PLANNER_RANGE_MAX_YEARS = 25;

/**
 * FullCalendar `validRange`: start = earliest (this Monday or min activity start); end = far future and/or data, not “today + horizon weeks” alone.
 * Horizon weeks only define how many columns the day grid shows at once; navigation can move much further.
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

  const day = startOfDay(now);
  const endCandidates: Date[] = [
    endOfWeek(addWeeks(day, horizonWeeks), { weekStartsOn }),
    endOfWeek(addYears(day, PLANNER_RANGE_MAX_YEARS), { weekStartsOn }),
  ];
  for (const act of activities) {
    endCandidates.push(parseISO(act.end_date));
  }

  const rangeEndInclusive = format(max(endCandidates), "yyyy-MM-dd");

  return {
    start: rangeStart,
    endExclusive: addDaysDateOnly(rangeEndInclusive, 1),
  };
}
