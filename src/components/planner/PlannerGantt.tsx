"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { eachDayOfInterval, format } from "date-fns";
import { Gantt, Task, ViewMode } from "gantt-task-react";
import { PlannerActivity, PlannerPeopleLeave, UpdateActivityPayload } from "@/lib/planner-types";
import { calendarSpanInclusiveDays, parseDateOnlyLocal } from "@/lib/planner-date";
import {
  ACTIVITY_STATUS_COLORS,
  getCrewColor,
  PEOPLE_LEAVE_BAR_COLOR,
  PEOPLE_LEAVE_BORDER_COLOR,
} from "@/lib/planner-constants";
import { cn } from "@/lib/cn";
import { getWaPublicHolidayName } from "@/lib/wa-public-holidays";

interface CrewInfo {
  id: string;
  name: string;
  index: number;
}

/** Must match `<Gantt preStepsCount={...} />` (Week view). */
const GANTT_PRE_STEPS_WEEK = 1;

interface PlannerGanttProps {
  activities: PlannerActivity[];
  crewMap: Map<string, CrewInfo>;
  /** Planning horizon in weeks (zoom / column density). */
  horizon: number;
  onActivityClick: (activity: PlannerActivity) => void;
  /** When set, enables drag/resize/progress on bars; return false to revert UI. */
  onActivityMove?: (payload: UpdateActivityPayload) => Promise<boolean>;
  onGanttSelect?: (activity: PlannerActivity | null) => void;
  /** People leave periods (same crew grouping as activities). */
  peopleLeaves?: PlannerPeopleLeave[];
}

const LEAVE_TASK_PREFIX = "leave-";
const HOL_SEG_PREFIX = "::hseg::";

function isLeaveTaskId(taskId: string): boolean {
  return taskId.startsWith(LEAVE_TASK_PREFIX);
}

function leaveRowId(leaveId: string): string {
  return `${LEAVE_TASK_PREFIX}${leaveId}`;
}

function baseActivityId(taskId: string): string {
  const idx = taskId.indexOf(HOL_SEG_PREFIX);
  return idx >= 0 ? taskId.slice(0, idx) : taskId;
}

/** Matches gantt-task-react@0.3.9 dist/index.css (global). */
const GTL = {
  wrap: "_3ZbQT",
  row: "_34SS0",
  cell: "_3lLk3",
  nameWrap: "_nI1Xw",
  exp: "_2QjE6",
  expEmpty: "_2TfEi",
} as const;

function formatTaskListDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function formatTooltipDay(d: Date): string {
  return format(d, "dd/MM/yyyy");
}

function PlannerTaskListTable({
  rowHeight,
  rowWidth,
  fontFamily,
  fontSize,
  locale: _locale,
  tasks,
  selectedTaskId,
  setSelectedTask: _setSelectedTask,
  onExpanderClick,
}: {
  rowHeight: number;
  rowWidth: string;
  fontFamily: string;
  fontSize: string;
  locale: string;
  tasks: Task[];
  selectedTaskId: string;
  setSelectedTask: (taskId: string) => void;
  onExpanderClick: (task: Task) => void;
}) {
  void _locale;
  void _setSelectedTask;
  return (
    <div className={GTL.wrap} style={{ fontFamily, fontSize }}>
      {tasks.map((t) => {
        let expanderSymbol = "";
        if (t.hideChildren === false) expanderSymbol = "▼";
        else if (t.hideChildren === true) expanderSymbol = "▶";

        return (
          <div
            className={cn(GTL.row, selectedTaskId === t.id && "ring-1 ring-inset ring-dashboard-primary/50")}
            style={{ height: rowHeight }}
            key={`${t.id}row`}
          >
            <div
              className={GTL.cell}
              style={{ minWidth: rowWidth, maxWidth: rowWidth }}
              title={t.name}
            >
              <div className={GTL.nameWrap}>
                <div className={expanderSymbol ? GTL.exp : GTL.expEmpty} onClick={() => onExpanderClick(t)}>
                  {expanderSymbol}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{t.name}</div>
                  {t.type === "task" && !isLeaveTaskId(String(t.id)) && (
                    <div className="text-[11px] font-medium tabular-nums text-dashboard-text-muted">
                      {Math.round(t.progress)}% complete
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className={GTL.cell} style={{ minWidth: rowWidth, maxWidth: rowWidth }}>
              &nbsp;{formatTaskListDate(t.start)}
            </div>
            <div className={GTL.cell} style={{ minWidth: rowWidth, maxWidth: rowWidth }}>
              &nbsp;{formatTaskListDate(t.end)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PlannerGantt({
  activities,
  crewMap,
  horizon,
  onActivityClick,
  onActivityMove,
  onGanttSelect,
  peopleLeaves = [],
}: PlannerGanttProps) {
  const [crewCollapsed, setCrewCollapsed] = useState<Record<string, boolean>>({});

  const tasksBuilt: Task[] = useMemo(() => {
    type Row = { act: PlannerActivity; start: Date; end: Date };
    const rows: Row[] = [];

    for (const act of activities) {
      const parsed = ganttTaskDatesOrNull(act);
      if (!parsed) continue;
      rows.push({ act, ...parsed });
    }

    const crewIds = new Set<string>();
    for (const row of rows) {
      crewIds.add(row.act.crew_id || "unknown");
    }
    for (const lv of peopleLeaves) {
      if (lv.crew_id) crewIds.add(lv.crew_id);
    }

    if (crewIds.size === 0) return [];

    const crewGroups = new Map<string, Row[]>();
    for (const row of rows) {
      const crewId = row.act.crew_id || "unknown";
      const g = crewGroups.get(crewId) || [];
      g.push(row);
      crewGroups.set(crewId, g);
    }

    const leavesByCrew = new Map<string, PlannerPeopleLeave[]>();
    for (const lv of peopleLeaves) {
      const g = leavesByCrew.get(lv.crew_id) || [];
      g.push(lv);
      leavesByCrew.set(lv.crew_id, g);
    }

    const sortedCrewIds = Array.from(crewIds).sort((a, b) => {
      const na = crewMap.get(a)?.name ?? a;
      const nb = crewMap.get(b)?.name ?? b;
      return na.localeCompare(nb);
    });

    const result: Task[] = [];

    for (const crewId of sortedCrewIds) {
      const groupRows = crewGroups.get(crewId) ?? [];
      const crewLeaveList = leavesByCrew.get(crewId) ?? [];
      if (groupRows.length === 0 && crewLeaveList.length === 0) continue;

      const dateCandidates: Date[] = [];
      for (const r of groupRows) {
        dateCandidates.push(r.start, r.end);
      }
      for (const lv of crewLeaveList) {
        const s = parseDateOnlyLocal(lv.start_date);
        const eDay = parseDateOnlyLocal(lv.end_date);
        if (!s || !eDay) continue;
        const e = new Date(eDay);
        e.setHours(23, 59, 59, 999);
        dateCandidates.push(s, e);
      }

      if (dateCandidates.length === 0) continue;

      const crewStart = dateCandidates.reduce((min, d) => (d < min ? d : min), dateCandidates[0]);
      const crewEnd = dateCandidates.reduce((max, d) => (d > max ? d : max), dateCandidates[0]);

      const crew = crewMap.get(crewId);
      const crewName = crew?.name || "Unknown Crew";
      const crewColor = crew ? getCrewColor(crew.index) : "#6B7280";

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
        continue;
      }

      result.push({
        id: `crew-${crewId}`,
        name: crewName,
        start: projectStart,
        end: projectEnd,
        progress: 0,
        type: "project",
        hideChildren: crewCollapsed[crewId] === true,
        styles: {
          backgroundColor: crewColor,
          progressColor: crewColor,
        },
      });

      for (const { act, start, end } of groupRows) {
        const statusColor =
          ACTIVITY_STATUS_COLORS[act.status] ?? ACTIVITY_STATUS_COLORS.planned;
        const progress = safeProgress(act.progress_percent);
        const intervalDays = eachDayOfInterval({ start: new Date(start), end: new Date(end) });
        let segStart: Date | null = null;
        let segCount = 0;
        for (const day of intervalDays) {
          const ymd = format(day, "yyyy-MM-dd");
          const isHoliday = Boolean(getWaPublicHolidayName(ymd));
          if (isHoliday) {
            if (segStart) {
              const segEnd = new Date(day);
              segEnd.setDate(segEnd.getDate() - 1);
              segEnd.setHours(23, 59, 59, 999);
              result.push({
                id: `${act.id}${HOL_SEG_PREFIX}${segCount}`,
                name: segCount === 0 ? act.name || "Untitled" : "↳",
                start: new Date(segStart),
                end: segEnd,
                progress,
                type: "task",
                project: `crew-${crewId}`,
                isDisabled: true,
                styles: {
                  backgroundColor: statusColor,
                  progressColor: adjustColor(statusColor, -30),
                  progressSelectedColor: adjustColor(statusColor, -50),
                  backgroundSelectedColor: adjustColor(statusColor, -20),
                },
              });
              segCount += 1;
              segStart = null;
            }
            continue;
          }
          if (!segStart) {
            segStart = new Date(day);
            segStart.setHours(0, 0, 0, 0);
          }
        }
        if (segStart) {
          const segEnd = new Date(end);
          result.push({
            id: `${act.id}${HOL_SEG_PREFIX}${segCount}`,
            name: segCount === 0 ? act.name || "Untitled" : "↳",
            start: new Date(segStart),
            end: segEnd,
            progress,
            type: "task",
            project: `crew-${crewId}`,
            isDisabled: true,
            styles: {
              backgroundColor: statusColor,
              progressColor: adjustColor(statusColor, -30),
              progressSelectedColor: adjustColor(statusColor, -50),
              backgroundSelectedColor: adjustColor(statusColor, -20),
            },
          });
        }
      }

      for (const lv of crewLeaveList) {
        const s = parseDateOnlyLocal(lv.start_date);
        const eDay = parseDateOnlyLocal(lv.end_date);
        if (!s || !eDay) continue;
        const taskEnd = new Date(eDay);
        taskEnd.setHours(23, 59, 59, 999);
        const taskStart = new Date(s);
        const label = lv.person_name?.trim() ? `Leave — ${lv.person_name.trim()}` : "Leave";
        result.push({
          id: leaveRowId(lv.id),
          name: label,
          start: taskStart,
          end: taskEnd,
          progress: 0,
          type: "task",
          project: `crew-${crewId}`,
          styles: {
            backgroundColor: PEOPLE_LEAVE_BAR_COLOR,
            progressColor: PEOPLE_LEAVE_BORDER_COLOR,
            progressSelectedColor: adjustColor(PEOPLE_LEAVE_BORDER_COLOR, -20),
            backgroundSelectedColor: adjustColor(PEOPLE_LEAVE_BAR_COLOR, -15),
          },
        });
      }
    }

    return result;
  }, [activities, crewCollapsed, crewMap, peopleLeaves]);

  const tasks = useMemo(() => filterTasksForGantt(tasksBuilt), [tasksBuilt]);

  const TooltipContent = useMemo(
    () =>
      function PlannerGanttTooltip({
        task,
        fontSize,
        fontFamily,
      }: {
        task: Task;
        fontSize: string;
        fontFamily: string;
      }) {
        const s: CSSProperties = { fontSize, fontFamily };
        if (task.type === "project") {
          return (
            <div
              className="max-w-xs rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3 text-dashboard-sm text-dashboard-text-primary shadow-dashboard-card"
              style={s}
            >
              <p className="font-semibold">{task.name}</p>
              <p className="mt-1 text-dashboard-xs text-dashboard-text-muted">
                {formatTooltipDay(task.start)} – {formatTooltipDay(task.end)}
              </p>
            </div>
          );
        }
        const tid = String(task.id);
        if (isLeaveTaskId(tid)) {
          const leaveId = tid.slice(LEAVE_TASK_PREFIX.length);
          const leave = peopleLeaves.find((l) => l.id === leaveId);
          const crewName = leave ? (crewMap.get(leave.crew_id)?.name ?? "—") : "—";
          const dur = leave
            ? calendarSpanInclusiveDays(leave.start_date, leave.end_date)
            : 0;
          return (
            <div
              className="max-w-xs rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3 text-dashboard-sm text-dashboard-text-primary shadow-dashboard-card"
              style={s}
            >
              <p className="font-semibold">
                {leave?.person_name?.trim() ? `Leave — ${leave.person_name.trim()}` : "People leave"}
              </p>
              <p className="mt-1 text-dashboard-xs text-dashboard-text-muted">Crew: {crewName}</p>
              <p className="mt-1 text-dashboard-xs">
                {formatTooltipDay(task.start)} – {formatTooltipDay(task.end)}
              </p>
              <p className="text-dashboard-xs text-dashboard-text-muted">
                {dur} day{dur === 1 ? "" : "s"}
              </p>
            </div>
          );
        }
        const act = activities.find((a) => a.id === baseActivityId(String(task.id)));
        if (!act) {
          return (
            <div
              className="max-w-xs rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3 text-dashboard-sm shadow-dashboard-card"
              style={s}
            >
              <p className="font-medium">{task.name}</p>
            </div>
          );
        }
        const crewName = crewMap.get(act.crew_id)?.name ?? "—";
        const dur = calendarSpanInclusiveDays(act.start_date, act.end_date);
        return (
          <div
            className="max-w-xs rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3 text-dashboard-sm text-dashboard-text-primary shadow-dashboard-card"
            style={s}
          >
            <p className="font-semibold">{act.name}</p>
            <p className="mt-1 text-dashboard-xs text-dashboard-text-muted">Crew: {crewName}</p>
            <p className="text-dashboard-xs text-dashboard-text-muted">Status: {act.status}</p>
            <p className="mt-1 text-dashboard-xs">
              {formatTooltipDay(task.start)} – {formatTooltipDay(task.end)}
            </p>
            <p className="text-dashboard-xs text-dashboard-text-muted">
              Duration: {dur} day{dur === 1 ? "" : "s"} · Progress: {act.progress_percent}%
            </p>
          </div>
        );
      },
    [activities, crewMap, peopleLeaves]
  );

  const openActivity = useCallback(
    (task: Task) => {
      if (task.type === "project") return;
      if (isLeaveTaskId(String(task.id))) return;
      const activity = activities.find((a) => a.id === baseActivityId(String(task.id)));
      if (activity) onActivityClick(activity);
    },
    [activities, onActivityClick]
  );

  const handleExpanderClick = useCallback((task: Task) => {
    if (task.type !== "project" || !task.id.startsWith("crew-")) return;
    const crewId = task.id.slice(5);
    setCrewCollapsed((prev) => ({ ...prev, [crewId]: task.hideChildren === true }));
  }, []);

  const handleDateChange = useCallback(
    async (task: Task): Promise<boolean> => {
      if (!onActivityMove || task.type === "project") return false;
      if (isLeaveTaskId(String(task.id))) return false;
      const payload: UpdateActivityPayload = {
        id: baseActivityId(String(task.id)),
        start_date: format(task.start, "yyyy-MM-dd"),
        end_date: format(task.end, "yyyy-MM-dd"),
      };
      return onActivityMove(payload);
    },
    [onActivityMove]
  );

  const handleProgressChange = useCallback(
    async (task: Task): Promise<boolean> => {
      if (!onActivityMove || task.type === "project") return false;
      if (isLeaveTaskId(String(task.id))) return false;
      return onActivityMove({
        id: baseActivityId(String(task.id)),
        progress_percent: Math.min(100, Math.max(0, Math.round(task.progress))),
      });
    },
    [onActivityMove]
  );

  const handleSelect = useCallback(
    (task: Task, isSelected: boolean) => {
      if (!onGanttSelect) return;
      if (isSelected) {
        if (task.type === "project" || isLeaveTaskId(String(task.id))) {
          onGanttSelect(null);
          return;
        }
        const activity = activities.find((a) => a.id === baseActivityId(String(task.id)));
        onGanttSelect(activity ?? null);
      } else {
        onGanttSelect(null);
      }
    },
    [activities, onGanttSelect]
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || tasksBuilt.length === 0) return;
    logGanttTasksDebug(tasksBuilt, tasks);
  }, [tasksBuilt, tasks]);

  const chartMountRef = useRef<HTMLDivElement>(null);
  const [chartBox, setChartBox] = useState({ width: 800, height: 400 });

  useEffect(() => {
    const el = chartMountRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setChartBox({ width: cr.width, height: cr.height });
    });
    ro.observe(el);
    setChartBox({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const ganttLayout = useMemo(() => {
    /** Timeline ~70% width; task list (3 columns) gets the remainder minus gap. */
    const gapPx = 16;
    const chartTargetPx = Math.floor(chartBox.width * 0.7);
    const listTotalPx = Math.max(0, chartBox.width - chartTargetPx - gapPx);
    const listCellPx = Math.max(48, Math.floor(listTotalPx / 3));
    const calendarHeaderH = 50;
    const horizontalScrollReserve = 20;
    const n = tasks.length;
    const chartW = Math.max(160, chartTargetPx);
    const bodyH = Math.max(100, chartBox.height - calendarHeaderH - horizontalScrollReserve);
    const rowHeight = n === 0 ? 36 : Math.max(22, Math.min(50, Math.floor(bodyH / n)));
    const ganttHeight = n === 0 ? bodyH : rowHeight * n;
    // Scale timeline density from the 2W/4W/6W/8W selector.
    // Lower horizon => wider week columns; higher horizon => denser weeks.
    const horizonWeeks = Math.max(2, Number(horizon) || 4);
    const horizonCols = horizonWeeks + GANTT_PRE_STEPS_WEEK + 2; // +buffer weeks
    const taskRangeCols = weekColumnCount(tasks, GANTT_PRE_STEPS_WEEK);
    const targetCols = Math.max(horizonCols, Math.min(taskRangeCols, horizonCols + 4));
    const columnWidth = Math.max(18, Math.floor(chartW / Math.max(targetCols, 1)));
    return {
      listCellPx,
      rowHeight,
      ganttHeight,
      columnWidth,
      headerHeight: calendarHeaderH,
      fontSize: rowHeight < 34 ? "12px" : "13px",
    };
  }, [chartBox.height, chartBox.width, tasks, horizon]);

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
    <div className="planner-gantt flex h-[min(72vh,calc(100dvh-13rem))] min-h-[280px] w-full max-w-full flex-col overflow-hidden rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface p-4 shadow-dashboard-card">
      <div
        className="mb-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-dashboard-border pb-3 text-dashboard-xs text-dashboard-text-secondary"
        aria-label="Gantt status colours"
      >
        <span className="font-medium text-dashboard-text-muted">Legend</span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-4 shrink-0 rounded-sm border border-dashboard-border/60"
            style={{ backgroundColor: ACTIVITY_STATUS_COLORS.planned }}
            aria-hidden
          />
          Blue — Planned
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-4 shrink-0 rounded-sm border border-dashboard-border/60"
            style={{ backgroundColor: ACTIVITY_STATUS_COLORS.in_progress }}
            aria-hidden
          />
          Yellow — In progress
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-4 shrink-0 rounded-sm border border-dashboard-border/60"
            style={{ backgroundColor: ACTIVITY_STATUS_COLORS.done }}
            aria-hidden
          />
          Green — Done
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="relative h-2.5 w-4 shrink-0 overflow-hidden rounded-sm border border-dashboard-border/60 bg-violet-100"
            aria-hidden
          >
            <span
              className="absolute inset-x-0 bottom-0 h-[2px]"
              style={{ backgroundColor: PEOPLE_LEAVE_BAR_COLOR }}
            />
          </span>
          Purple — People leave
        </span>
      </div>
      <div ref={chartMountRef} className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <Gantt
          key={`${horizon}-${ganttLayout.rowHeight}-${ganttLayout.columnWidth}-${ganttLayout.listCellPx}`}
          tasks={tasks}
          viewMode={ViewMode.Week}
          viewDate={viewDate}
          preStepsCount={GANTT_PRE_STEPS_WEEK}
          columnWidth={ganttLayout.columnWidth}
          rowHeight={ganttLayout.rowHeight}
          ganttHeight={ganttLayout.ganttHeight}
          headerHeight={ganttLayout.headerHeight}
          fontSize={ganttLayout.fontSize}
          barFill={56}
          TaskListTable={PlannerTaskListTable}
          TooltipContent={TooltipContent}
          onClick={openActivity}
          onDoubleClick={openActivity}
          onSelect={onGanttSelect ? handleSelect : undefined}
          onExpanderClick={handleExpanderClick}
          onDateChange={onActivityMove ? handleDateChange : undefined}
          onProgressChange={onActivityMove ? handleProgressChange : undefined}
          listCellWidth={`${ganttLayout.listCellPx}px`}
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
    </div>
  );
}

/** Same date range + week steps as gantt-task-react@0.3.9 `ganttDateRange` (Week) + `seedDates`. */
function addToDateGantt(date: Date, quantity: number, scale: "day" | "month"): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth() + (scale === "month" ? quantity : 0),
    date.getDate() + (scale === "day" ? quantity : 0),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  );
}

function startOfDayGantt(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function getMondayGantt(date: Date): Date {
  const d = new Date(date.getTime());
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

function weekColumnCount(tasks: Task[], preStepsCount: number): number {
  if (tasks.length === 0) return 24;
  let rangeStart = tasks[0].start;
  let rangeEnd = tasks[0].start;
  for (const task of tasks) {
    if (task.start < rangeStart) rangeStart = task.start;
    if (task.end > rangeEnd) rangeEnd = task.end;
  }
  let newStartDate = startOfDayGantt(rangeStart);
  newStartDate = addToDateGantt(getMondayGantt(newStartDate), -7 * preStepsCount, "day");
  let newEndDate = startOfDayGantt(rangeEnd);
  newEndDate = addToDateGantt(newEndDate, 1.5, "month");

  let current = new Date(newStartDate.getTime());
  let count = 1;
  while (current < newEndDate) {
    current = addToDateGantt(current, 7, "day");
    count++;
  }
  return Math.max(1, count);
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
