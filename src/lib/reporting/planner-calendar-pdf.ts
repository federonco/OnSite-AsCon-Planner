import { format } from "date-fns";
import type { PlannerActivity, PlannerPeopleLeave } from "@/lib/planner-types";

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

async function toNodeBuffer(value: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));

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

  throw new Error(`Unsupported react-pdf buffer output type: ${typeof value}`);
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
      page: { padding: 24, fontSize: 9, color: "#1f2937", fontFamily: "Helvetica" },
      header: { marginBottom: 12, borderBottom: "1 solid #cbd5e1", paddingBottom: 8 },
      title: { fontSize: 15, fontWeight: 700, color: "#1e3a8a" },
      subtitle: { marginTop: 3, fontSize: 9, color: "#64748b" },
      section: { marginTop: 10 },
      sectionTitle: { fontSize: 10, fontWeight: 700, marginBottom: 4, color: "#0f172a" },
      rowHeader: {
        flexDirection: "row",
        borderBottom: "1 solid #e2e8f0",
        borderTop: "1 solid #e2e8f0",
        backgroundColor: "#f8fafc",
        paddingVertical: 4,
        fontSize: 8.5,
      },
      row: {
        flexDirection: "row",
        borderBottom: "1 solid #eef2f7",
        paddingVertical: 3.5,
        fontSize: 8.5,
      },
      cName: { width: "33%", paddingRight: 4 },
      cCrew: { width: "17%", paddingRight: 4 },
      cDates: { width: "18%", paddingRight: 4 },
      cStatus: { width: "12%", paddingRight: 4 },
      cProg: { width: "10%", paddingRight: 4, textAlign: "right" },
      cWbs: { width: "10%", textAlign: "right" },
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
      logo: { width: 34, height: 10, marginLeft: 4 },
    });

    const sortedActivities = [...input.activities].sort(
      (a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name)
    );
    const sortedLeaves = [...input.peopleLeaves].sort(
      (a, b) => a.start_date.localeCompare(b.start_date) || (a.person_name ?? "").localeCompare(b.person_name ?? "")
    );

    const buildRow = (a: PlannerActivity) =>
      h(
        View,
        { style: styles.row, key: `a-${a.id}` },
        h(Text, { style: styles.cName }, a.name || "Untitled"),
        h(Text, { style: styles.cCrew }, input.crewNames[a.crew_id] ?? "—"),
        h(Text, { style: styles.cDates }, `${a.start_date} -> ${a.end_date}`),
        h(Text, { style: styles.cStatus }, a.status),
        h(Text, { style: styles.cProg }, `${Math.max(0, Math.min(100, Number(a.progress_percent ?? 0)))}%`),
        h(Text, { style: styles.cWbs }, a.wbs_code ?? "—")
      );

    const buildLeaveRow = (lv: PlannerPeopleLeave) =>
      h(
        View,
        { style: styles.row, key: `l-${lv.id}` },
        h(Text, { style: styles.cName }, lv.person_name?.trim() || "Leave"),
        h(Text, { style: styles.cCrew }, input.crewNames[lv.crew_id] ?? "—"),
        h(Text, { style: styles.cDates }, `${lv.start_date} -> ${lv.end_date}`),
        h(Text, { style: styles.cStatus }, "leave"),
        h(Text, { style: styles.cProg }, "—"),
        h(Text, { style: styles.cWbs }, "—")
      );

    const documentNode = h(
      Document,
      null,
      h(
        Page,
        { size: "A3", orientation: "landscape", style: styles.page, wrap: true },
        h(
          View,
          { style: styles.header },
          h(Text, { style: styles.title }, input.title),
          h(
            Text,
            { style: styles.subtitle },
            `${input.horizonWeeks} week horizon · ${input.hideWeekends ? "Mon–Fri" : "Mon–Sun"} · Week including ${input.viewAnchorDate} · Generated ${format(new Date(), "yyyy-MM-dd HH:mm")}`
          )
        ),
        h(
          View,
          { style: styles.section },
          h(Text, { style: styles.sectionTitle }, "Activities"),
          h(
            View,
            { style: styles.rowHeader },
            h(Text, { style: styles.cName }, "Task"),
            h(Text, { style: styles.cCrew }, "Crew"),
            h(Text, { style: styles.cDates }, "Dates"),
            h(Text, { style: styles.cStatus }, "Status"),
            h(Text, { style: styles.cProg }, "Progress"),
            h(Text, { style: styles.cWbs }, "WBS")
          ),
          ...sortedActivities.map(buildRow)
        ),
        sortedLeaves.length
          ? h(
              View,
              { style: styles.section },
              h(Text, { style: styles.sectionTitle }, "People Leave"),
              ...sortedLeaves.map(buildLeaveRow)
            )
          : null,
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
