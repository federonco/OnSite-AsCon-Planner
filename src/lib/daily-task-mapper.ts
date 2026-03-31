import type {
  DailyTask,
  DailyTaskColor,
  DailyTaskPriority,
} from "./daily-task-types";
import { toDateOnly } from "./planner-date";

const COLOR_TOKENS: DailyTaskColor[] = ["blue", "amber", "violet"];
const PRIORITY_TOKENS: DailyTaskPriority[] = ["low", "medium", "high", "critical"];

function normalizeColor(id: string, raw: unknown): DailyTaskColor {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (COLOR_TOKENS.includes(v as DailyTaskColor)) return v as DailyTaskColor;
  // Deterministic fallback from id so existing rows get a stable color.
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % COLOR_TOKENS.length;
  return COLOR_TOKENS[idx];
}

function normalizePriority(raw: unknown): DailyTaskPriority {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (PRIORITY_TOKENS.includes(v as DailyTaskPriority)) return v as DailyTaskPriority;
  return "medium";
}

function normalizeProgress(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

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

  let notes: string | null = null;
  if (row.notes != null && String(row.notes).trim() !== "") {
    notes = String(row.notes).slice(0, 4000);
  }

  const color = normalizeColor(id, row.color);
  const priority = normalizePriority(row.priority);
  const progress_percent = normalizeProgress(row.progress_percent);

  return {
    id,
    title,
    origin_date,
    completed_on_date,
    color,
    priority,
    progress_percent,
    notes,
    created_at: row.created_at != null ? String(row.created_at) : new Date().toISOString(),
    updated_at: row.updated_at != null ? String(row.updated_at) : new Date().toISOString(),
  };
}
