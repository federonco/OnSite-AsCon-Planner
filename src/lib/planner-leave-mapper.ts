import type { PlannerPeopleLeave } from "./planner-types";
import { calendarSpanInclusiveDays, isValidDateOnlyString, toDateOnly } from "./planner-date";

export function mapRowToPlannerPeopleLeave(row: Record<string, unknown>): PlannerPeopleLeave | null {
  const id = String(row.id ?? "").trim();
  const crew_id = String(row.crew_id ?? "").trim();
  if (!id || !crew_id) return null;

  const startRaw = toDateOnly(String(row.start_date ?? ""));
  if (!isValidDateOnlyString(startRaw)) return null;

  let endRaw = toDateOnly(String(row.end_date ?? ""));
  if (!isValidDateOnlyString(endRaw)) endRaw = startRaw;
  if (endRaw < startRaw) endRaw = startRaw;

  return {
    id,
    crew_id,
    start_date: startRaw,
    end_date: endRaw,
    duration_days: calendarSpanInclusiveDays(startRaw, endRaw),
    person_name: row.person_name != null && String(row.person_name).trim() ? String(row.person_name).trim() : null,
    created_at:
      row.created_at != null ? String(row.created_at) : new Date().toISOString(),
  };
}
