"use client";

import { useEffect, useMemo } from "react";
import { Gantt, Task, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import { PlannerActivity } from "@/lib/planner-types";
import { parseDateOnlyLocal } from "@/lib/planner-date";
import { ACTIVITY_STATUS_COLORS, getCrewColor } from "@/lib/planner-constants";

interface CrewInfo {
  id: string;
  name: string;
  index: number;
}

interface PlannerGanttProps {
  activities: PlannerActivity[];
  crewMap: Map<string, CrewInfo>;
  /** Planning horizon in weeks (zoom / column density). */
  horizon: number;
  onActivityClick: (activity: PlannerActivity) => void;
}

export default function PlannerGantt({
  activities,
  crewMap,
  horizon,
  onActivityClick,
}: PlannerGanttProps) {
  const tasksBuilt: Task[] = useMemo(() => {
    type Row = { act: PlannerActivity; start: Date; end: Date };
    const rows: Row[] = [];

    for (const act of activities) {
      const parsed = ganttTaskDatesOrNull(act);
      if (!parsed) continue;
      rows.push({ act, ...parsed });
    }

    if (rows.length === 0) return [];

    const crewGroups = new Map<string, Row[]>();
    for (const row of rows) {
      const crewId = row.act.crew_id || "unknown";
      const g = crewGroups.get(crewId) || [];
      g.push(row);
      crewGroups.set(crewId, g);
    }

    const result: Task[] = [];

    Array.from(crewGroups.entries()).forEach(([crewId, groupRows]) => {
      const crew = crewMap.get(crewId);
      const crewName = crew?.name || "Unknown Crew";
      const crewColor = crew ? getCrewColor(crew.index) : "#6B7280";

      const crewStart = groupRows.reduce(
        (min, r) => (r.start < min ? r.start : min),
        groupRows[0].start
      );
      const crewEnd = groupRows.reduce((max, r) => (r.end > max ? r.end : max), groupRows[0].end);

      const projectStart = new Date(crewStart);
      const projectEnd = new Date(crewEnd);
      if (!isValidGanttDate(projectStart) || !isValidGanttDate(projectEnd) || projectStart > projectEnd) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[PlannerGantt] skipping crew project row: invalid aggregated dates", {
            crewId,
            crewStart,
            crewEnd,
          });
        }
        return;
      }

      result.push({
        id: `crew-${crewId}`,
        name: crewName,
        start: projectStart,
        end: projectEnd,
        progress: 0,
        type: "project",
        hideChildren: false,
        styles: {
          backgroundColor: crewColor,
          progressColor: crewColor,
        },
      });

      for (const { act, start, end } of groupRows) {
        const statusColor =
          ACTIVITY_STATUS_COLORS[act.status] ?? ACTIVITY_STATUS_COLORS.planned;
        const taskStart = new Date(start);
        const taskEnd = new Date(end);
        const progress = safeProgress(act.progress_percent);
        result.push({
          id: act.id,
          name: act.name || "Untitled",
          start: taskStart,
          end: taskEnd,
          progress,
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

  const tasks = useMemo(() => filterTasksForGantt(tasksBuilt), [tasksBuilt]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || tasksBuilt.length === 0) return;
    logGanttTasksDebug(tasksBuilt, tasks);
  }, [tasksBuilt, tasks]);

  const columnWidth = Math.max(32, Math.min(80, Math.round(224 / Math.max(horizon, 1))));
  const viewDate = useMemo(() => {
    void horizon;
    return new Date();
  }, [horizon]);

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
        Timeline density follows the horizon ({horizon}W). Bar length follows calendar dates. WA public holidays are not working days — see Calendar for marked dates and the activity form for working-day counts.
      </p>
      <Gantt
        key={horizon}
        tasks={tasks}
        viewMode={ViewMode.Week}
        viewDate={viewDate}
        preStepsCount={1}
        columnWidth={columnWidth}
        onClick={(task) => {
          if (task.type !== "project") {
            const activity = activities.find((a) => a.id === task.id);
            if (activity) onActivityClick(activity);
          }
        }}
        listCellWidth="220px"
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

/** Last line of defense: skip row if dates cannot parse (mapper should already guarantee YYYY-MM-DD). */
function ganttTaskDatesOrNull(act: PlannerActivity): { start: Date; end: Date } | null {
  const start = parseDateOnlyLocal(act.start_date);
  const endDay = parseDateOnlyLocal(act.end_date);
  if (!start || !endDay) return null;
  const end = new Date(endDay);
  end.setHours(23, 59, 59, 999);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

function isValidGanttDate(d: Date | undefined): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function safeProgress(p: unknown): number {
  const n = typeof p === "number" ? p : Number(p);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * gantt-task-react taskXCoordinate uses findIndex(...) - 1; when task.start equals the first grid
 * column, findIndex is 0 and dates[-1] is read → undefined.getTime(). preStepsCount={1} shifts the
 * grid one week earlier so the usual case avoids index -1; we still drop any malformed tasks here.
 */
function filterTasksForGantt(tasks: Task[]): Task[] {
  const out: Task[] = [];
  for (const t of tasks) {
    const ok =
      t.start instanceof Date &&
      t.end instanceof Date &&
      !Number.isNaN(t.start.getTime()) &&
      !Number.isNaN(t.end.getTime()) &&
      t.start <= t.end;
    if (ok) {
      out.push(t);
    } else if (process.env.NODE_ENV === "development") {
      console.warn("[PlannerGantt] excluded invalid task for gantt-task-react", {
        id: t.id,
        name: t.name,
        start: t.start,
        end: t.end,
      });
    }
  }
  return out;
}

function logGanttTasksDebug(built: Task[], filtered: Task[]): void {
  if (built.length === filtered.length) {
    // eslint-disable-next-line no-console -- dev-only diagnostic
    console.log("[PlannerGantt] tasks (dev)", {
      total: built.length,
      afterFilter: filtered.length,
    });
  } else {
    // eslint-disable-next-line no-console -- dev-only diagnostic
    console.log("[PlannerGantt] tasks (dev)", {
      total: built.length,
      afterFilter: filtered.length,
      excluded: built.length - filtered.length,
    });
  }
  for (const t of built) {
    const s = t.start;
    const e = t.end;
    // eslint-disable-next-line no-console -- dev-only diagnostic
    console.log("[PlannerGantt] task row", {
      id: t.id,
      name: t.name,
      start: s,
      end: e,
      typeofStart: typeof s,
      typeofEnd: typeof e,
      startIsDate: s instanceof Date,
      endIsDate: e instanceof Date,
      startIsNaN: s instanceof Date ? Number.isNaN(s.getTime()) : "n/a",
      endIsNaN: e instanceof Date ? Number.isNaN(e.getTime()) : "n/a",
    });
  }
}

/** Darken or lighten a hex color by amount */
function adjustColor(hex: string, amount: number): string {
  const raw = (hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return "#3B8BD4";
  const num = parseInt(raw, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
