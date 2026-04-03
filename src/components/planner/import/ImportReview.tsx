"use client";

import type { ImportedTaskNode, ParseWarning } from "@/lib/import/xml/types";
import { calendarSpanInclusiveDays } from "@/lib/planner-date";
import { countWarningsByCode } from "@/lib/import/xml/tree-helpers";

export interface ReviewRow {
  node: ImportedTaskNode;
  breadcrumb: string;
  predecessorCount: number;
  predecessorsInImportCount: number;
}

export interface ImportReviewDiagnostics {
  parsedCount: number;
  visibleTreeCount: number;
  selectedNodeCount: number;
  importableLeafCount: number;
  /** Primavera XER pipeline (optional) */
  xer?: {
    projects: number;
    wbsNodes: number;
    tasks: number;
    preds: number;
    calendars: number;
  };
}

export default function ImportReview({
  rows,
  parseWarnings,
  diagnostics,
}: {
  rows: ReviewRow[];
  parseWarnings: ParseWarning[];
  diagnostics: ImportReviewDiagnostics;
}) {
  const byCode = countWarningsByCode(parseWarnings);
  const warnKeys = ["duplicate_wbs", "missing_wbs", "invalid_date", "missing_parent", "skipped_root"] as const;

  return (
    <div className="space-y-4">
      <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-bg/50 px-3 py-2 text-dashboard-xs text-dashboard-text-secondary">
        <div className="mb-1 font-medium uppercase tracking-wide text-dashboard-text-muted">Diagnostics</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <span>Parsed (flat)</span>
          <span className="tabular-nums text-dashboard-text-primary">{diagnostics.parsedCount}</span>
          <span>Visible tree rows</span>
          <span className="tabular-nums text-dashboard-text-primary">{diagnostics.visibleTreeCount}</span>
          <span>Selected nodes</span>
          <span className="tabular-nums text-dashboard-text-primary">{diagnostics.selectedNodeCount}</span>
          <span>Importable leaves</span>
          <span className="tabular-nums text-dashboard-text-primary">{diagnostics.importableLeafCount}</span>
        </div>
        {diagnostics.xer && (
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-dashboard-border/60 pt-2 sm:grid-cols-5">
            <span>Projects</span>
            <span className="tabular-nums text-dashboard-text-primary">{diagnostics.xer.projects}</span>
            <span>WBS nodes</span>
            <span className="tabular-nums text-dashboard-text-primary">{diagnostics.xer.wbsNodes}</span>
            <span>Tasks (file)</span>
            <span className="tabular-nums text-dashboard-text-primary">{diagnostics.xer.tasks}</span>
            <span>Dependencies</span>
            <span className="tabular-nums text-dashboard-text-primary">{diagnostics.xer.preds}</span>
            <span>Calendars</span>
            <span className="tabular-nums text-dashboard-text-primary">{diagnostics.xer.calendars}</span>
          </div>
        )}
      </div>

      <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-bg/50 px-3 py-2 text-dashboard-xs">
        <div className="mb-1 font-medium uppercase tracking-wide text-dashboard-text-muted">Parser warnings</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-dashboard-text-secondary">
          {warnKeys.map((k) => (
            <span key={k}>
              {k.replace(/_/g, " ")}:{" "}
              <span className="tabular-nums font-medium text-dashboard-text-primary">{byCode[k] ?? 0}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="max-h-[min(420px,50vh)] overflow-auto rounded-dashboard-md border border-dashboard-border">
        <table className="w-full border-collapse text-dashboard-sm">
          <thead className="sticky top-0 z-[1] bg-dashboard-bg shadow-sm">
            <tr>
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-dashboard-text-muted">WBS</th>
              <th className="min-w-[10rem] px-3 py-2 text-left font-medium text-dashboard-text-muted">Name</th>
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-dashboard-text-muted">Start</th>
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-dashboard-text-muted">Finish</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-dashboard-text-muted">Days</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-dashboard-text-muted" title="Predecessor links in file">
                Preds
              </th>
              <th
                className="whitespace-nowrap px-3 py-2 text-right font-medium text-dashboard-text-muted"
                title="Predecessors also selected as importable leaves"
              >
                In import
              </th>
              <th className="min-w-[12rem] px-3 py-2 text-left font-medium text-dashboard-text-muted">Path</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, breadcrumb, predecessorCount, predecessorsInImportCount }) => {
              const start = node.start ?? "";
              const finish = node.finish ?? "";
              let days = 1;
              if (start && finish) {
                try {
                  days = calendarSpanInclusiveDays(start, finish);
                } catch {
                  days = 1;
                }
              }
              return (
                <tr key={node.id} className="border-t border-dashboard-border text-dashboard-text-secondary">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-dashboard-text-muted">
                    {node.wbs === "__unstructured__" ? "—" : node.wbs}
                  </td>
                  <td className="max-w-[20rem] break-words px-3 py-2">{node.name}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{start || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{finish || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{days}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{predecessorCount}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{predecessorsInImportCount}</td>
                  <td className="px-3 py-2 text-dashboard-xs text-dashboard-text-muted">{breadcrumb}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
