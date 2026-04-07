import { addDays, endOfWeek, format, isAfter, isBefore, parseISO, startOfWeek } from "date-fns";
import type { PlannerActivity, PlannerPeopleLeave } from "@/lib/planner-types";
import { getWaPublicHolidayName } from "@/lib/wa-public-holidays";

export class PdfGenerationError extends Error {
  stage: "compose" | "render";
  details?: string;
  constructor(stage: "compose" | "render", message: string, details?: string) {
    super(message);
    this.name = "PdfGenerationError";
    this.stage = stage;
    this.details = details;
  }
}

export interface PlannerCalendarPdfInput {
  title: string;
  horizonWeeks: number;
  hideWeekends: boolean;
  viewAnchorDate: string;
  activities: PlannerActivity[];
  peopleLeaves: PlannerPeopleLeave[];
  crewNames: Record<string, string>;
  logoSrc?: string;
}

interface CalendarWeek {
  weekStart: Date;
  days: Date[];
}

function getCalendarRange(anchorIsoDate: string, horizonWeeks: number): { from: Date; to: Date; weeks: CalendarWeek[] } {
  const anchor = parseISO(anchorIsoDate);
  const from = startOfWeek(anchor, { weekStartsOn: 1 });
  const to = endOfWeek(addDays(from, horizonWeeks * 7 - 1), { weekStartsOn: 1 });
  const weeks: CalendarWeek[] = [];
  for (let cursor = from; !isAfter(cursor, to); cursor = addDays(cursor, 7)) {
    weeks.push({
      weekStart: cursor,
      days: Array.from({ length: 7 }, (_, i) => addDays(cursor, i)),
    });
  }
  return { from, to, weeks };
}

function toStatusColor(status: string): string {
  if (status === "backfilled") return "#ef9f27";
  if (status === "installed" || status === "completed") return "#1d9e75";
  if (status === "in_progress") return "#d8922f";
  return "#3b8bd4";
}

function isWeekendDate(day: Date): boolean {
  const d = day.getDay();
  return d === 0 || d === 6;
}

function activityMatchesDay(activity: PlannerActivity, day: Date): boolean {
  const start = parseISO(activity.start_date);
  const end = parseISO(activity.end_date);
  const dayEnd = addDays(day, 1);
  const inRange = !isBefore(day, start) && isBefore(day, dayEnd) && !isAfter(day, end);
  if (!inRange) return false;

  // Weekend cells should not be auto-filled by range carry-over unless explicitly dated.
  if (isWeekendDate(day)) {
    const ymd = format(day, "yyyy-MM-dd");
    return activity.start_date === ymd || activity.end_date === ymd;
  }
  return true;
}

async function toNodeBuffer(value: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));

  // Web ReadableStream (some runtimes)
  if (value && typeof value === "object" && "getReader" in value) {
    const reader = (value as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      if (chunk) {
        chunks.push(chunk);
        total += chunk.byteLength;
      }
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return Buffer.from(merged);
  }

  // Node.js Readable stream or any async-iterable of chunks
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const hasPipe = typeof (v as { pipe?: unknown }).pipe === "function";
    const hasAsyncIterator =
      typeof (v as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function";

    if (hasPipe || hasAsyncIterator) {
      const chunks: Buffer[] = [];
      for await (const chunk of value as AsyncIterable<unknown>) {
        if (Buffer.isBuffer(chunk)) chunks.push(chunk);
        else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
        else if (chunk instanceof ArrayBuffer) chunks.push(Buffer.from(new Uint8Array(chunk)));
        else if (typeof chunk === "string") chunks.push(Buffer.from(chunk));
        else if (chunk == null) continue;
        else {
          console.warn("[planner/pdf] react-pdf chunk unsupported, coercing to string", {
            typeofChunk: typeof chunk,
            ctor: (chunk as { constructor?: { name?: string } } | null)?.constructor?.name ?? null,
          });
          chunks.push(Buffer.from(String(chunk)));
        }
      }
      return Buffer.concat(chunks);
    }

    // Some libraries wrap streams in an object (e.g., { body: stream })
    for (const key of ["body", "data", "stream", "readable"] as const) {
      const inner = v[key];
      if (inner && typeof inner === "object") {
        const innerHasPipe = typeof (inner as { pipe?: unknown }).pipe === "function";
        const innerHasAsyncIterator =
          typeof (inner as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function";
        if (innerHasPipe || innerHasAsyncIterator) {
          return await toNodeBuffer(inner);
        }
      }
    }

    console.error("[planner/pdf] Unsupported react-pdf render output", {
      typeofValue: typeof value,
      constructorName: (value as { constructor?: { name?: string } } | null)?.constructor?.name ?? null,
      hasPipe,
      hasAsyncIterator,
      keys: Object.keys(v).slice(0, 20),
    });
  }

  throw new Error(
    `Unsupported react-pdf buffer output type: ${typeof value}${
      value && typeof value === "object"
        ? ` (constructor=${(value as { constructor?: { name?: string } } | null)?.constructor?.name ?? "unknown"})`
        : ""
    }`
  );
}

/** React-PDF generator (Chromium-free) for planner email export. */
export async function generatePlannerCalendarPdf(input: PlannerCalendarPdfInput): Promise<Buffer> {
  console.info("[planner/pdf] react-pdf generation start", {
    horizonWeeks: input.horizonWeeks,
    viewAnchorDate: input.viewAnchorDate,
    activityCount: input.activities.length,
    leaveCount: input.peopleLeaves.length,
  });

  try {
    const React = await import("react");
    const { pdf, Document, Page, View, Text, StyleSheet, Image } = await import("@react-pdf/renderer");
    const h = React.createElement;

    const styles = StyleSheet.create({
      page: { padding: 24, fontSize: 10, color: "#1f2937", fontFamily: "Helvetica" },
      header: { marginBottom: 10, borderBottom: "1 solid #cbd5e1", paddingBottom: 6 },
      title: { fontSize: 15, fontWeight: 700, color: "#1e3a8a" },
      subtitle: { marginTop: 3, fontSize: 9, color: "#64748b" },
      weekdayLegend: {
        flexDirection: "row",
        borderBottom: "1 solid #cbd5e1",
        borderTop: "1 solid #e2e8f0",
        backgroundColor: "#f8fafc",
        paddingVertical: 3,
        marginBottom: 6,
      },
      weekdayCell: {
        width: "14.28%",
        textAlign: "center",
        fontSize: 9,
        color: "#334155",
        fontWeight: 700,
      },
      weekBlock: {
        marginBottom: 6,
        breakInside: "avoid",
      },
      weekHeader: {
        backgroundColor: "#0f4b73",
        color: "#ffffff",
        fontSize: 9.5,
        fontWeight: 700,
        paddingVertical: 3,
        paddingHorizontal: 6,
      },
      weekGrid: {
        flexDirection: "row",
        borderLeft: "1 solid #cbd5e1",
        borderRight: "1 solid #cbd5e1",
        borderBottom: "1 solid #cbd5e1",
      },
      dayCell: {
        width: "14.28%",
        minHeight: 62,
        borderRight: "1 solid #e2e8f0",
        padding: 4,
      },
      dayCellLast: {
        borderRight: "0",
      },
      weekendMuted: {
        backgroundColor: "#f8fafc",
      },
      dayLabel: { fontSize: 8.5, color: "#0f172a", marginBottom: 3 },
      dayFlag: {
        fontSize: 7.2,
        color: "#92400e",
        backgroundColor: "#fef3c7",
        border: "1 solid #f59e0b",
        borderRadius: 2,
        paddingVertical: 1,
        paddingHorizontal: 2,
        marginBottom: 2,
      },
      dayWeekendFlag: {
        fontSize: 7.2,
        color: "#334155",
        backgroundColor: "#e2e8f0",
        borderRadius: 2,
        paddingVertical: 1,
        paddingHorizontal: 2,
        marginBottom: 2,
      },
      taskCard: {
        borderRadius: 2,
        paddingVertical: 2,
        paddingHorizontal: 3,
        marginBottom: 2,
      },
      taskTitle: { fontSize: 8, color: "#ffffff", fontWeight: 700 },
      taskMeta: { fontSize: 7.6, color: "#e2e8f0" },
      emptyDay: { fontSize: 8, color: "#94a3b8" },
      footer: {
        position: "absolute",
        left: 24,
        right: 24,
        bottom: 14,
        borderTop: "1 solid #e2e8f0",
        paddingTop: 6,
        alignItems: "center",
      },
      footerText: { fontSize: 8.5, color: "#94a3b8", lineHeight: 1.3, textAlign: "center" },
      logo: { width: 27, height: 8, marginLeft: 4 },
    });

    const sortedActivities = [...input.activities].sort(
      (a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name)
    );
    const { from, to, weeks } = getCalendarRange(input.viewAnchorDate, input.horizonWeeks);

    const documentNode = h(
      Document,
      null,
      h(
        Page,
        { size: "A3", orientation: "landscape", style: styles.page, wrap: true },
        h(
          View,
          { style: styles.header },
          h(Text, { style: styles.title }, "OnSite Planner — Calendar"),
          h(
            Text,
            { style: styles.subtitle },
            `${input.horizonWeeks} week look ahead · ${input.hideWeekends ? "Mon–Fri" : "Mon–Sun"} · ${format(from, "dd MMM yyyy")} to ${format(to, "dd MMM yyyy")} · Generated ${format(new Date(), "yyyy-MM-dd HH:mm")}`
          )
        ),
        h(
          View,
          { style: styles.weekdayLegend },
          ...["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) =>
            h(Text, { key: `weekday-${d}`, style: styles.weekdayCell }, d)
          )
        ),
        ...weeks.map((week) =>
          h(
            View,
            { style: styles.weekBlock, key: `week-${format(week.weekStart, "yyyy-MM-dd")}` },
            h(Text, { style: styles.weekHeader }, `Week of ${format(week.weekStart, "d MMM yyyy")}`),
            h(
              View,
              { style: styles.weekGrid },
              ...week.days.map((day, idx) => {
                const activities = sortedActivities.filter((a) => activityMatchesDay(a, day));
                const holidayName = getWaPublicHolidayName(format(day, "yyyy-MM-dd"));
                const isWeekend = isWeekendDate(day);
                const dayCellStyle = {
                  ...styles.dayCell,
                  ...(idx === 6 ? styles.dayCellLast : {}),
                  ...(input.hideWeekends && (idx === 5 || idx === 6) ? styles.weekendMuted : {}),
                };
                return h(
                  View,
                  {
                    style: dayCellStyle,
                    key: `day-${format(day, "yyyy-MM-dd")}`,
                  },
                  h(Text, { style: styles.dayLabel }, format(day, "d MMM")),
                  holidayName ? h(Text, { style: styles.dayFlag }, `Public Holiday: ${holidayName}`) : null,
                  isWeekend ? h(Text, { style: styles.dayWeekendFlag }, "Weekend") : null,
                  ...activities.map((a) =>
                    h(
                      View,
                      { key: `${a.id}-${format(day, "yyyy-MM-dd")}`, style: [styles.taskCard, { backgroundColor: toStatusColor(a.status) }] },
                      h(Text, { style: styles.taskTitle }, a.name || "Untitled"),
                      h(
                        Text,
                        { style: styles.taskMeta },
                        a.status === "in_progress"
                          ? `Progress: ${Math.max(
                              0,
                              Math.min(100, Number(a.progress_percent ?? 0))
                            )}%`
                          : `${input.crewNames[a.crew_id] ?? "—"} · ${a.status}`
                      )
                    )
                  ),
                  activities.length === 0 ? h(Text, { style: styles.emptyDay }, "—") : null
                );
              })
            )
          )
        ),
        h(
          View,
          { style: styles.footer, fixed: true },
          h(Text, { style: styles.footerText }, "OnSite-AsCon-Planner"),
          h(
            View,
            { style: { flexDirection: "row", alignItems: "center" } },
            h(Text, { style: styles.footerText }, "Created by "),
            input.logoSrc ? h(Image, { style: styles.logo, src: input.logoSrc }) : h(Text, { style: styles.footerText }, "readX")
          ),
          h(Text, { style: styles.footerText }, "All Rights Reserved.")
        )
      )
    );

    const out = await pdf(documentNode).toBuffer();
    const buffer = await toNodeBuffer(out);
    console.info("[planner/pdf] react-pdf generated", { bytes: buffer.byteLength });
    return buffer;
  } catch (err) {
    throw new PdfGenerationError(
      "render",
      "React-PDF generation failed.",
      err instanceof Error ? err.message : String(err)
    );
  }
}
