import { format } from "date-fns";
import type { ScheduleRow } from "@/types/dashboard-events";
import { TimelineBar } from "./TimelineBar";
import { cn } from "@/lib/cn";

const COL_WIDTH = 80; // px — matches tokens.components.timeline.columnWidth

export interface TimelineGridProps {
  /** Column start dates (one per day column) */
  columnDates: Date[];
  rows: ScheduleRow[];
  className?: string;
}

export function TimelineGrid({ columnDates, rows, className }: TimelineGridProps) {
  const totalWidth = columnDates.length * COL_WIDTH;

  return (
    <div className={cn("flex min-w-0 flex-1 flex-col bg-dashboard-bg/50", className)}>
      <div
        className="sticky top-0 z-10 flex shrink-0 border-b border-dashboard-border bg-dashboard-surface"
        style={{ width: totalWidth }}
      >
        {columnDates.map((d, i) => (
          <div
            key={i}
            className="flex h-12 w-timeline-col shrink-0 flex-col items-center justify-center border-r border-dashboard-border text-center last:border-r-0"
          >
            <span className="text-dashboard-xs font-medium uppercase text-dashboard-text-muted">
              {format(d, "EEE")}
            </span>
            <span className="text-dashboard-sm font-medium text-dashboard-text-primary">{format(d, "d")}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col" style={{ width: totalWidth }}>
        {rows.map((row) => (
          <div
            key={row.id}
            className="relative box-border flex h-event-row shrink-0 border-b border-dashboard-border/70"
          >
            {/* vertical grid */}
            <div className="pointer-events-none absolute inset-0 flex">
              {columnDates.map((_, ci) => (
                <div
                  key={ci}
                  className="w-timeline-col shrink-0 border-r border-[#E6E9F0]/90 last:border-r-0"
                />
              ))}
            </div>

            <div className="relative z-[1] flex h-full w-full items-center px-1">
              {row.type === "group" ? (
                <span className="px-3 text-dashboard-xs font-semibold uppercase tracking-wide text-dashboard-text-muted" />
              ) : row.timeline.spanCols <= 0 ? null : (
                <div
                  className="absolute top-1/2 h-timeline-bar -translate-y-1/2"
                  style={{
                    left: row.timeline.startCol * COL_WIDTH + 4,
                    width: Math.max(0, row.timeline.spanCols * COL_WIDTH - 8),
                  }}
                >
                  <TimelineBar
                    accent={row.timeline.accent}
                    label={row.timeline.label}
                    className="h-full w-full min-w-0"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
