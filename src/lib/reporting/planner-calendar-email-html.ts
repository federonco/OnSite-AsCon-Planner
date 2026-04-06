import { addDays, addWeeks, format, parseISO, startOfWeek } from "date-fns";
import {
  ACTIVITY_STATUS_COLORS,
  PEOPLE_LEAVE_BAR_COLOR,
} from "@/lib/planner-constants";
import type { PlannerActivity, PlannerPeopleLeave } from "@/lib/planner-types";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function activitySpansDay(act: PlannerActivity, ymd: string): boolean {
  return act.start_date <= ymd && act.end_date >= ymd;
}

function leaveSpansDay(lv: PlannerPeopleLeave, ymd: string): boolean {
  return lv.start_date <= ymd && lv.end_date >= ymd;
}

export interface PlannerCalendarPdfHtmlInput {
  horizonWeeks: number;
  hideWeekends: boolean;
  /** Any date in the week shown (Monday-normalised server-side). */
  viewAnchorDate: string;
  activities: PlannerActivity[];
  peopleLeaves: PlannerPeopleLeave[];
  crewNames: Record<string, string>;
  title?: string;
  generatedAt?: string;
  logoSrc?: string;
}

/**
 * Static HTML for Puppeteer PDF — no JS. Table layout, A3 landscape via @page in caller or inline.
 */
export function buildPlannerCalendarPdfHtml(input: PlannerCalendarPdfHtmlInput): string {
  const {
    horizonWeeks,
    hideWeekends,
    viewAnchorDate,
    activities,
    peopleLeaves,
    crewNames,
    title = "OnSite Planner — Calendar",
    generatedAt = new Date().toISOString(),
    logoSrc,
  } = input;

  const anchor = startOfWeek(parseISO(viewAnchorDate), { weekStartsOn: 1 });
  const dayLabels = hideWeekends
    ? ["Mon", "Tue", "Wed", "Thu", "Fri"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const weeksHtml: string[] = [];
  for (let w = 0; w < horizonWeeks; w++) {
    const weekStart = addWeeks(anchor, w);
    const dayIndices = hideWeekends ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6];
    const cells: string[] = [];
    for (const di of dayIndices) {
      const d = addDays(weekStart, di);
      const ymd = format(d, "yyyy-MM-dd");
      const dayNum = format(d, "d MMM");

      const lines: string[] = [];
      for (const act of activities) {
        if (!activitySpansDay(act, ymd)) continue;
        const crew = crewNames[act.crew_id] ?? "—";
        const col = ACTIVITY_STATUS_COLORS[act.status] ?? "#3B8BD4";
        lines.push(
          `<div style="margin:2pt 0;padding:2pt 4pt;border-radius:2pt;background:${col};color:#fff;font-size:6.5pt;line-height:1.2;">
            <strong>${escapeHtml(act.name)}</strong><br/><span style="opacity:0.95">${escapeHtml(crew)} · ${escapeHtml(act.status)}</span>
          </div>`
        );
      }
      for (const lv of peopleLeaves) {
        if (!leaveSpansDay(lv, ymd)) continue;
        const label = lv.person_name?.trim() ? `Leave: ${lv.person_name.trim()}` : "Leave";
        lines.push(
          `<div style="margin:2pt 0;padding:2pt 4pt;border-radius:2pt;background:${PEOPLE_LEAVE_BAR_COLOR};color:#fff;font-size:6.5pt;">${escapeHtml(label)}</div>`
        );
      }

      cells.push(`
        <td style="vertical-align:top;border:0.5pt solid #ccc;padding:4pt;width:${(100 / dayIndices.length).toFixed(2)}%;min-height:48pt;background:#fafafa;">
          <div style="font-size:6.5pt;font-weight:bold;color:#1a5276;margin-bottom:3pt;">${escapeHtml(dayNum)}</div>
          ${lines.length ? lines.join("") : "<span style=\"font-size:6.5pt;color:#bbb;\">—</span>"}
        </td>`);
    }

    weeksHtml.push(`
      <tr>
        <td colspan="${dayIndices.length}" style="background:#1a5276;color:#fff;padding:4pt 6pt;font-size:7.5pt;font-weight:bold;">
          Week of ${escapeHtml(format(weekStart, "d MMM yyyy"))}
        </td>
      </tr>
      <tr>${cells.join("")}</tr>
    `);
  }

  const subtitle = `${horizonWeeks} week horizon · ${hideWeekends ? "Mon–Fri only" : "Mon–Sun"} · Generated ${escapeHtml(
    new Date(generatedAt).toLocaleString("en-AU", { timeZone: "Australia/Perth" })
  )}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A3 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 7pt; color: #222; }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>
  <div style="margin-bottom:10pt;border-bottom:1.5pt solid #1a5276;padding-bottom:8pt;display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <div style="font-size:14pt;font-weight:bold;color:#1a5276;">${escapeHtml(title)}</div>
      <div style="font-size:8pt;color:#555;margin-top:3pt;">${subtitle}</div>
      <div style="font-size:7pt;color:#666;margin-top:4pt;">${dayLabels.join(" · ")}</div>
    </div>
    ${
      logoSrc
        ? `<img src="${logoSrc}" alt="" height="40" style="display:block;" />`
        : ""
    }
  </div>
  <table>
    <tbody>
      ${weeksHtml.join("")}
    </tbody>
  </table>
</body>
</html>`;
}
