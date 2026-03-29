"use client";

import { useMemo } from "react";
import { Gantt, Task, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import { PlannerActivity } from "@/lib/planner-types";
import { toDateOnly } from "@/lib/planner-date";
import { ACTIVITY_STATUS_COLORS } from "@/lib/planner-constants";
import { getCrewColor } from "@/lib/planner-constants";

interface CrewInfo {
  id: string;
  name: string;
  index: number;
}

interface PlannerGanttProps {
  activities: PlannerActivity[];
  crewMap: Map<string, CrewInfo>;
  onActivityClick: (activity: PlannerActivity) => void;
}

export default function PlannerGantt({
  activities,
  crewMap,
  onActivityClick,
}: PlannerGanttProps) {
  const tasks: Task[] = useMemo(() => {
    if (activities.length === 0) return [];

    // Group by crew for project rows
    const crewGroups = new Map<string, PlannerActivity[]>();
    for (const act of activities) {
      const group = crewGroups.get(act.crew_id) || [];
      group.push(act);
      crewGroups.set(act.crew_id, group);
    }

    const result: Task[] = [];

    Array.from(crewGroups.entries()).forEach(([crewId, acts]) => {
      const crew = crewMap.get(crewId);
      const crewName = crew?.name || "Unknown Crew";
      const crewColor = crew ? getCrewColor(crew.index) : "#6B7280";

      // Add crew as project row
      const crewStart = acts.reduce(
        (min, a) => {
          const s = toDateOnly(a.start_date);
          return s < min ? s : min;
        },
        toDateOnly(acts[0].start_date)
      );
      const crewEnd = acts.reduce(
        (max, a) => {
          const e = toDateOnly(a.end_date);
          return e > max ? e : max;
        },
        toDateOnly(acts[0].end_date)
      );

      result.push({
        id: `crew-${crewId}`,
        name: crewName,
        start: new Date(crewStart + "T00:00:00"),
        end: new Date(crewEnd + "T23:59:59"),
        progress: 0,
        type: "project",
        hideChildren: false,
        styles: {
          backgroundColor: crewColor,
          progressColor: crewColor,
        },
      });

      // Add activities under crew
      for (const act of acts) {
        const statusColor = ACTIVITY_STATUS_COLORS[act.status];
        const s = toDateOnly(act.start_date);
        const e = toDateOnly(act.end_date);
        result.push({
          id: act.id,
          name: act.name,
          start: new Date(s + "T00:00:00"),
          end: new Date(e + "T23:59:59"),
          progress: act.progress_percent,
          type: "task",
          project: `crew-${crewId}`,
          styles: {
            backgroundColor: statusColor,
            progressColor: adjustColor(statusColor, -30),
            progressSelectedColor: adjustColor(statusColor, -50),
            backgroundSelectedColor: adjustColor(statusColor, -20),
          },
        });
      }
    });

    return result;
  }, [activities, crewMap]);

  if (tasks.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface text-dashboard-sm text-dashboard-text-muted">
        No activities to display. Create one to get started.
      </div>
    );
  }

  return (
    <div className="planner-gantt min-h-[min(70vh,720px)] w-full overflow-auto rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface p-4 shadow-dashboard-card">
      <p className="mb-3 text-dashboard-xs text-dashboard-text-muted">
        Bar length follows calendar dates. WA public holidays are not working days — see Calendar for marked dates and the activity form for working-day counts.
      </p>
      <Gantt
        tasks={tasks}
        viewMode={ViewMode.Week}
        onClick={(task) => {
          if (task.type !== "project") {
            const activity = activities.find((a) => a.id === task.id);
            if (activity) onActivityClick(activity);
          }
        }}
        listCellWidth="220px"
        columnWidth={60}
        barCornerRadius={4}
        todayColor="rgba(59, 139, 212, 0.15)"
        projectBackgroundColor="#374151"
        projectProgressColor="#6B7280"
        projectProgressSelectedColor="#9CA3AF"
        barProgressColor="#1D9E75"
        barProgressSelectedColor="#16A085"
        barBackgroundColor="#3B8BD4"
        barBackgroundSelectedColor="#2563EB"
      />
    </div>
  );
}

/** Darken or lighten a hex color by amount */
function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
