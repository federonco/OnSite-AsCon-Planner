export interface DailyTask {
  id: string;
  title: string;
  origin_date: string;
  completed_on_date: string | null;
  created_at: string;
  updated_at: string;
}

/** Row shape for a task as shown on a given calendar day (derived flags). */
export interface DailyTaskView extends DailyTask {
  is_completed: boolean;
  /** True when pending and origin_date is before the day being viewed. */
  is_carried_over: boolean;
}
