import { toDateOnly } from "@/lib/planner-date";

/**
 * P6 exports dates as `YYYY-MM-DD HH:MM` or `MM/DD/YYYY` variants; normalize to YYYY-MM-DD.
 */
export function parseP6DateToIso(raw: string, warnings: string[], taskId?: number): string | null {
  const s = raw.trim();
  if (!s) return null;
  const slice = s.length >= 10 ? s.slice(0, 10) : s;
  try {
    const d = toDateOnly(slice);
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  } catch {
    /* fall through */
  }
  const alt = s.replace(/\//g, "-");
  const m = alt.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    const y = m[3];
    const iso = `${y}-${mm}-${dd}`;
    try {
      return toDateOnly(iso).slice(0, 10);
    } catch {
      /* ignore */
    }
  }
  warnings.push(
    taskId != null
      ? `Unparseable date for task ${taskId}: "${raw.slice(0, 40)}"`
      : `Unparseable date: "${raw.slice(0, 40)}"`
  );
  return null;
}

/** Pick best available start/end for schedule display. */
export function pickTaskDates(
  m: {
    target_start: string | null;
    target_end: string | null;
    act_start: string | null;
    act_end: string | null;
    early_start: string | null;
    early_end: string | null;
  },
  fallback: string
): { start: string; end: string } {
  const start =
    m.act_start ||
    m.target_start ||
    m.early_start ||
    fallback;
  const end =
    m.act_end ||
    m.target_end ||
    m.early_end ||
    start;
  if (start <= end) return { start, end };
  return { start: end, end: start };
}
