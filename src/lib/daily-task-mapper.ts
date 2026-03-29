import type { DailyTask } from "./daily-task-types";
import { toDateOnly } from "./planner-date";

export function mapRowToDailyTask(row: Record<string, unknown>): DailyTask | null {
  const id = String(row.id ?? "").trim();
  const title = String(row.title ?? "").trim();
  if (!id || !title) return null;

  const origin_date = toDateOnly(String(row.origin_date ?? ""));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(origin_date)) return null;

  let completed_on_date: string | null = null;
  if (row.completed_on_date != null && String(row.completed_on_date).trim() !== "") {
    const c = toDateOnly(String(row.completed_on_date));
    completed_on_date = /^\d{4}-\d{2}-\d{2}$/.test(c) ? c : null;
  }

  return {
    id,
    title,
    origin_date,
    completed_on_date,
    created_at: row.created_at != null ? String(row.created_at) : new Date().toISOString(),
    updated_at: row.updated_at != null ? String(row.updated_at) : new Date().toISOString(),
  };
}
