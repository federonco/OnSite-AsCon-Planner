import type { XerRawDocument } from "./types";
import { findTable } from "./parse-xer-raw";
import type { MappedCalendar } from "./types";
import { fieldIndex, parseIntSafe, rowGet } from "./xer-table-utils";

export function mapCalendars(doc: XerRawDocument, warnings: string[]): MappedCalendar[] {
  const t = findTable(doc, "CALENDAR");
  if (!t || t.fields.length === 0) {
    warnings.push("CALENDAR table missing — calendar metadata not linked");
    return [];
  }

  const iId = fieldIndex(t, "clndr_id", "CLNDR_ID");
  const iName = fieldIndex(t, "clndr_name", "CLNDR_NAME");
  const iDay = fieldIndex(t, "day_hr_cnt", "DAY_HR_CNT");
  const iWeek = fieldIndex(t, "week_hr_cnt", "WEEK_HR_CNT");
  const iMonth = fieldIndex(t, "month_hr_cnt", "MONTH_HR_CNT");

  if (iId < 0) {
    warnings.push("CALENDAR: clndr_id missing");
    return [];
  }

  const out: MappedCalendar[] = [];
  for (const row of t.rows) {
    const id = parseIntSafe(rowGet(row, iId));
    if (id == null) continue;
    out.push({
      clndr_id: id,
      clndr_name: iName >= 0 ? rowGet(row, iName) || null : null,
      day_hr_cnt: iDay >= 0 ? parseIntSafe(rowGet(row, iDay)) : null,
      week_hr_cnt: iWeek >= 0 ? parseIntSafe(rowGet(row, iWeek)) : null,
      month_hr_cnt: iMonth >= 0 ? rowGet(row, iMonth) || null : null,
    });
  }
  return out;
}
