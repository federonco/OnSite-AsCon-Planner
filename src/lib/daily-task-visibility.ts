import type { DailyTask, DailyTaskView, DailyTaskPriority } from "./daily-task-types";

/**
 * Whether a task row should appear on calendar day `viewDate` (YYYY-MM-DD, calendar / wall-clock day, no TZ math).
 * - Pending: visible on every day from origin_date forward until completed.
 * - Completed: visible only on completed_on_date (does not roll).
 *
 * **Must stay aligned with** `GET /api/daily-notes/tasks?date=` which loads:
 * - rows where `completed_on_date = viewDate`, union
 * - rows where `completed_on_date IS NULL AND origin_date <= viewDate`.
 * Any change here requires the same predicate in that route’s two Supabase queries.
 */
export function isTaskVisibleOnDate(task: DailyTask, viewDate: string): boolean {
  if (task.completed_on_date != null) {
    return task.completed_on_date === viewDate;
  }
  return task.origin_date <= viewDate;
}

/** Decorate rows for the selected day with UI flags. */
export function toTaskViewsForDate(tasks: DailyTask[], viewDate: string): DailyTaskView[] {
  const out: DailyTaskView[] = [];
  for (const t of tasks) {
    if (!isTaskVisibleOnDate(t, viewDate)) continue;
    const pending = t.completed_on_date == null;
    out.push({
      ...t,
      is_completed: !pending,
      is_carried_over: pending && t.origin_date < viewDate,
    });
  }
  const PRIORITY_WEIGHT: Record<DailyTaskPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  out.sort((a, b) => {
    // 1) Incomplete first
    if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
    // 2) Higher priority first
    const pa = PRIORITY_WEIGHT[a.priority];
    const pb = PRIORITY_WEIGHT[b.priority];
    if (pa !== pb) return pa - pb;
    // 3) Older origin_date first (rollover order)
    const od = a.origin_date.localeCompare(b.origin_date);
    if (od !== 0) return od;
    // 4) Stable by created_at then id
    const ct = a.created_at.localeCompare(b.created_at);
    if (ct !== 0) return ct;
    return a.id.localeCompare(b.id);
  });
  return out;
}
