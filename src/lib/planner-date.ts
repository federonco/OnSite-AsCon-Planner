import { addDays, differenceInCalendarDays, format, parse, subDays } from "date-fns";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True if string is a real calendar day (not Invalid Date). */
export function isValidDateOnlyString(s: string): boolean {
  if (!s || !YMD_RE.test(s)) return false;
  const d = parse(s, "yyyy-MM-dd", new Date());
  return !Number.isNaN(d.getTime());
}

/** Parse YYYY-MM-DD to a local Date at midnight, or null if invalid. */
export function parseDateOnlyLocal(ymd: string): Date | null {
  if (!isValidDateOnlyString(ymd)) return null;
  const d = parse(ymd, "yyyy-MM-dd", new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Normalize Supabase `date` / ISO strings to YYYY-MM-DD for FullCalendar & Gantt */
export function toDateOnly(value: string): string {
  if (!value) return value;
  if (value.length >= 10 && value[4] === "-" && value[7] === "-") {
    return value.slice(0, 10);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Add/subtract calendar days in local time (avoids UTC drift from toISOString) */
export function addDaysDateOnly(dateStr: string, days: number): string {
  const d = parse(dateStr, "yyyy-MM-dd", new Date());
  return format(addDays(d, days), "yyyy-MM-dd");
}

export function subDaysDateOnly(dateStr: string, days: number): string {
  const d = parse(dateStr, "yyyy-MM-dd", new Date());
  return format(subDays(d, days), "yyyy-MM-dd");
}

/** Inclusive calendar-day span between two YYYY-MM-DD strings (min 1). */
export function calendarSpanInclusiveDays(startYmd: string, endYmd: string): number {
  const a = parse(startYmd, "yyyy-MM-dd", new Date());
  const b = parse(endYmd, "yyyy-MM-dd", new Date());
  return Math.max(1, differenceInCalendarDays(b, a) + 1);
}
