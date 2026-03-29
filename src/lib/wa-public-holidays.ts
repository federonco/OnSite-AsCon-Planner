import Holidays from "date-holidays";
import { eachDayOfInterval, format, isBefore } from "date-fns";

const hd = new Holidays("AU", "wa");

function parseLocalYmd(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Calendar date at local noon (stable vs `date-holidays` / timezone). */
function noonLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

/** WA public holiday name if `dateStr` (YYYY-MM-DD) is a public holiday, else null */
export function getWaPublicHolidayName(dateStr: string): string | null {
  const hits = hd.isHoliday(noonLocal(dateStr));
  if (!hits || !Array.isArray(hits)) return null;
  const pub = hits.find((h) => h.type === "public");
  return pub?.name ?? null;
}

/** Mon–Fri in local timezone */
export function isWaWorkweekDay(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

/**
 * Inclusive count of WA working days (Mon–Fri, excluding WA public holidays).
 */
export function countWaWorkingDaysInclusive(startStr: string, endStr: string): number {
  const start = parseLocalYmd(startStr);
  const end = parseLocalYmd(endStr);
  if (isBefore(end, start)) return 0;
  let n = 0;
  for (const d of eachDayOfInterval({ start, end })) {
    const ds = format(d, "yyyy-MM-dd");
    if (isWaWorkweekDay(d) && !getWaPublicHolidayName(ds)) n++;
  }
  return n;
}
