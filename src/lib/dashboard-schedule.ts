import type { EventGroup, ScheduleRow } from "@/types/dashboard-events";

/** Flattens event groups into rows for aligned list + timeline layouts */
export function flattenScheduleRows(groups: EventGroup[]): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (const g of groups) {
    rows.push({
      id: `group-${g.id}`,
      type: "group",
      groupTitle: g.title,
      timeline: { startCol: 0, spanCols: 0, accent: "blue" },
    });
    for (const ev of g.events) {
      rows.push({
        id: ev.id,
        type: "event",
        event: ev,
        timeline: ev.timeline,
      });
      if (ev.subEvents?.length) {
        for (const sub of ev.subEvents) {
          rows.push({
            id: `${ev.id}__${sub.id}`,
            type: "sub",
            subEvent: sub,
            parentEventId: ev.id,
            timeline:
              sub.timeline ?? {
                startCol: ev.timeline.startCol,
                spanCols: Math.max(1, Math.floor(ev.timeline.spanCols / 2)),
                accent: ev.timeline.accent,
              },
          });
        }
      }
    }
  }
  return rows;
}
