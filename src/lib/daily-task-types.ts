export interface DailyTask {
  id: string;
  title: string;
  origin_date: string;
  completed_on_date: string | null;
  /** Visual identity token for the task (independent of status). */
  color: DailyTaskColor;
  /** Priority bucket for the day view and sorting. */
  priority: DailyTaskPriority;
  /** 0..100 progress used for quick completion tracking. */
  progress_percent: number;
  /** Optional notes / comments for the task */
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Row shape for a task as shown on a given calendar day (derived flags). */
export interface DailyTaskView extends DailyTask {
  is_completed: boolean;
  /** True when pending and origin_date is before the day being viewed. */
  is_carried_over: boolean;
}

export const DAILY_TASK_COLORS = [
  "blue",
  "amber",
  "violet",
] as const;

export type DailyTaskColor = (typeof DAILY_TASK_COLORS)[number];

export const DAILY_TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type DailyTaskPriority = (typeof DAILY_TASK_PRIORITIES)[number];
