import { ActivityStatus } from "./planner-types";

/**
 * If set, only this crew (match on `crews.name`, case-insensitive) can use the planner UI.
 * Set to `null` to allow all crews again.
 */
export const PLANNER_CREW_ROLLOUT_NAME: string | null = "A";

/** Calendar / Gantt styling for people leave bars (distinct from activity status). */
export const PEOPLE_LEAVE_BAR_COLOR = "#7C3AED";
export const PEOPLE_LEAVE_BORDER_COLOR = "#5B21B6";

/** Color coding by activity status */
export const ACTIVITY_STATUS_COLORS: Record<ActivityStatus, string> = {
  planned: "#3B8BD4",
  in_progress: "#EF9F27",
  done: "#1D9E75",
  blocked: "#EF4444",
};

/** Human-readable status labels */
export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
};

/** Crew color palette (for calendar event coloring) */
export const CREW_COLORS: Record<string, string> = {
  default: "#6B7280",
};

/** Crew color array for dynamic assignment */
export const CREW_COLOR_PALETTE = [
  "#3B8BD4", // blue
  "#1D9E75", // green
  "#EF9F27", // orange
  "#9333EA", // purple
  "#EF4444", // red
  "#EC4899", // pink
  "#14B8A6", // teal
  "#F59E0B", // amber
];

/** Get a consistent color for a crew based on index */
export function getCrewColor(index: number): string {
  return CREW_COLOR_PALETTE[index % CREW_COLOR_PALETTE.length];
}
