import type { ScheduleRow } from "@/types/dashboard-events";
import { EventListPanel } from "./EventListPanel";
import { EventRow } from "./EventRow";
import { SubEventRow } from "./SubEventRow";
import { TimelineGrid } from "./TimelineGrid";

export interface ScheduleSplitProps {
  columnDates: Date[];
  rows: ScheduleRow[];
}

/** Left list and right timeline share the same `rows` array — one row each for horizontal alignment */
export function ScheduleSplit({ columnDates, rows }: ScheduleSplitProps) {
  return (
    <div className="flex min-h-0 w-full overflow-hidden rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface shadow-dashboard-card">
      <EventListPanel className="shrink-0">
        <div className="flex flex-col">
          {rows.map((row) => (
            <div key={row.id} className="shrink-0">
              {renderLeftRow(row)}
            </div>
          ))}
        </div>
      </EventListPanel>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <TimelineGrid columnDates={columnDates} rows={rows} />
      </div>
    </div>
  );
}

function renderLeftRow(row: ScheduleRow) {
  if (row.type === "group" && row.groupTitle) {
    return (
      <div className="flex h-event-row items-center border-b border-dashboard-border/80 bg-dashboard-bg/40 px-4">
        <span className="text-dashboard-xs font-semibold uppercase tracking-wider text-dashboard-text-muted">
          {row.groupTitle}
        </span>
      </div>
    );
  }
  if (row.type === "sub" && row.subEvent) {
    return (
      <SubEventRow
        title={row.subEvent.title}
        assigneeInitials={row.subEvent.assigneeInitials}
        className="rounded-none border-x-0 border-t-0 border-b border-dashboard-border/70 shadow-none"
      />
    );
  }
  if (row.type === "event" && row.event) {
    return (
      <EventRow
        title={row.event.title}
        subtitle={row.event.subtitle}
        assigneeInitials={row.event.assigneeInitials}
        className="rounded-none border-x-0 border-t-0 border-b border-dashboard-border/70 shadow-none"
      />
    );
  }
  return <div className="h-event-row" />;
}
