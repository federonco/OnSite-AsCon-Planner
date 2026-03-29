import { addDays, format, parse, subDays } from "date-fns";

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
