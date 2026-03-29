import type { TimelineAccent } from "@/design-system/tokens";

export interface TimelineSegment {
  /** Zero-based column index (day) where the bar starts */
  startCol: number;
  /** Number of day columns spanned */
  spanCols: number;
  accent: TimelineAccent;
  label?: string;
}

export interface SubEventItem {
  id: string;
  title: string;
  assigneeInitials?: string;
  /** When omitted, UI shows a minimal placeholder span */
  timeline?: TimelineSegment;
}

export interface EventItem {
  id: string;
  title: string;
  subtitle?: string;
  assigneeInitials?: string;
  subEvents?: SubEventItem[];
  timeline: TimelineSegment;
}

export interface EventGroup {
  id: string;
  title: string;
  events: EventItem[];
}

/** Flattened row for aligned split layout */
export type ScheduleRowType = "group" | "event" | "sub";

export interface ScheduleRow {
  id: string;
  type: ScheduleRowType;
  groupTitle?: string;
  event?: EventItem;
  subEvent?: SubEventItem;
  parentEventId?: string;
  timeline: TimelineSegment;
}
