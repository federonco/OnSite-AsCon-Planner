import { addDays, addWeeks, format, parseISO, startOfWeek } from "date-fns";
import {
  ACTIVITY_STATUS_COLORS,
  PEOPLE_LEAVE_BAR_COLOR,
} from "@/lib/planner-constants";
import type { PlannerActivity, PlannerPeopleLeave } from "@/lib/planner-types";
import { getWaPublicHolidayName } from "@/lib/wa-public-holidays";

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
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
    title = `${horizonWeeks} week look ahead`,
    generatedAt = new Date().toISOString(),
    logoSrc,
  } = input;

  const anchor = startOfWeek(parseISO(viewAnchorDate), { weekStartsOn: 1 });
  const dayLabels = hideWeekends
    ? ["Mon", "Tue", "Wed", "Thu", "Fri"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const printableHeightMm = 273; // A3 landscape inner height with 12mm margins (297 - 24)
  const headerHeightMm = 24;
  const footerHeightMm = 20;
  const weekTitleHeightMm = 4.5;
  const tableBudgetMm = Math.max(
    120,
    printableHeightMm - headerHeightMm - footerHeightMm
  );
  const dayRowHeightMm = Math.max(
    12,
    Number((tableBudgetMm / Math.max(1, horizonWeeks) - weekTitleHeightMm).toFixed(2))
  );

  const weeksHtml: string[] = [];
  for (let w = 0; w < horizonWeeks; w++) {
    const weekStart = addWeeks(anchor, w);
    const dayIndices = hideWeekends ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6];
    const cells: string[] = [];
    for (const di of dayIndices) {
      const d = addDays(weekStart, di);
      const ymd = format(d, "yyyy-MM-dd");
      const dayNum = format(d, "d MMM");
      const holidayName = getWaPublicHolidayName(ymd);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

      const lines: string[] = [];
      if (holidayName) {
        lines.push(
          `<div style="margin:2pt 0;padding:2pt 4pt;border-radius:2pt;background:#fef3c7;color:#92400e;font-size:6.5pt;border:0.5pt solid #f59e0b;">
            Public holiday: ${escapeHtml(holidayName)}
          </div>`
        );
      }
      if (!holidayName) {
        for (const act of activities) {
          if (!activitySpansDay(act, ymd)) continue;
          const crew = crewNames[act.crew_id] ?? "—";
          const col = ACTIVITY_STATUS_COLORS[act.status] ?? "#3B8BD4";
          const progressText =
            act.status === "in_progress"
              ? ` · ${Math.max(0, Math.min(100, Number(act.progress_percent ?? 0)))}% complete`
              : "";
          lines.push(
            `<div style="margin:2pt 0;padding:2pt 4pt;border-radius:2pt;background:${col};color:#fff;font-size:6.5pt;line-height:1.2;">
              <strong>${escapeHtml(act.name)}</strong><br/><span style="opacity:0.95">${escapeHtml(crew)} · ${escapeHtml(act.status)}${escapeHtml(progressText)}</span>
            </div>`
          );
        }
      }
      for (const lv of peopleLeaves) {
        if (!leaveSpansDay(lv, ymd)) continue;
        const label = lv.person_name?.trim() ? `Leave: ${lv.person_name.trim()}` : "Leave";
        lines.push(
          `<div style="margin:2pt 0;padding:2pt 4pt;border-radius:2pt;background:${PEOPLE_LEAVE_BAR_COLOR};color:#fff;font-size:6.5pt;">${escapeHtml(label)}</div>`
        );
      }

      cells.push(`
        <td style="vertical-align:top;border:0.5pt solid #ccc;padding:2.5pt;width:${(100 / dayIndices.length).toFixed(2)}%;height:${dayRowHeightMm}mm;background:#fafafa;">
          <div style="font-size:6.5pt;font-weight:bold;color:#1a5276;margin-bottom:3pt;">${escapeHtml(dayNum)}</div>
          <div style="max-height:calc(${dayRowHeightMm}mm - 10pt);overflow:hidden;">
            ${lines.length ? lines.join("") : isWeekend ? "" : "<span style=\"font-size:6.5pt;color:#bbb;\">—</span>"}
          </div>
        </td>`);
    }

    weeksHtml.push(`
      <tr>
        <td colspan="${dayIndices.length}" style="background:#1a5276;color:#fff;padding:2pt 6pt;font-size:7.2pt;font-weight:bold;height:${weekTitleHeightMm}mm;">
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
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 7pt; color: #222; overflow: hidden; }
    .page-shell { height: ${printableHeightMm}mm; display: flex; flex-direction: column; overflow: hidden; }
    .content { flex: 1; min-height: 0; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  </style>
</head>
<body>
  <div class="page-shell">
  <div class="content">
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
  </div>
  <div style="flex-shrink:0;height:${footerHeightMm}mm;border-top:1pt solid #d1d5db;padding-top:6pt;text-align:center;">
    <div style="font-size:9pt;color:#9ca3af;line-height:1.35;">
      <div>OnSite-AsCon-Planner</div>
      <div>Created by ${logoSrc ? `<img src="${logoSrc}" alt="readX" height="12" style="display:inline-block;vertical-align:middle;transform:translateY(-1px);" />` : "readX"}</div>
      <div>All Rights Reserved.</div>
    </div>
  </div>
  </div>
</body>
</html>`;
}
