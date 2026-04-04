"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfWeek, addWeeks, differenceInCalendarDays } from "date-fns";
import {
  ActivityStatus,
  PlannerActivity,
  PlannerPeopleLeave,
  UpdateActivityPayload,
} from "@/lib/planner-types";
import { parseDateOnlyLocal } from "@/lib/planner-date";
import {
  ACTIVITY_STATUS_COLORS,
  ACTIVITY_STATUS_LABELS,
  PEOPLE_LEAVE_BAR_COLOR,
  PEOPLE_LEAVE_BORDER_COLOR,
} from "@/lib/planner-constants";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CrewInfo {
  id: string;
  name: string;
  index: number;
}

interface LinearLookAheadProps {
  activities: PlannerActivity[];
  crewMap: Map<string, CrewInfo>;
  horizon: number;
  onActivityClick: (activity: PlannerActivity) => void;
  onActivityMove?: (payload: UpdateActivityPayload) => Promise<boolean>;
  onGanttSelect?: (activity: PlannerActivity | null) => void;
  peopleLeaves?: PlannerPeopleLeave[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ROW_H = 40;
const CREW_ROW_H = 36;

/** Crew-name → brand colour (requirement-specific). */
const CREW_NAME_COLORS: Record<string, string> = {
  A: "#185FA5",
  B: "#0F6E56",
  C: "#D85A30",
  D: "#534AB7",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function crewColor(name: string, _index: number): string {
  const key = name.trim().toUpperCase();
  if (CREW_NAME_COLORS[key]) return CREW_NAME_COLORS[key];
  // fallback — cycle through the requirement colours
  const palette = Object.values(CREW_NAME_COLORS);
  return palette[_index % palette.length];
}

function barColor(status: string): string {
  const s = status as ActivityStatus;
  return ACTIVITY_STATUS_COLORS[s] ?? ACTIVITY_STATUS_COLORS.planned;
}

function darken(hex: string, amount: number): string {
  const raw = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return hex;
  const num = parseInt(raw, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) - amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) - amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) - amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Format chainage from wbs_code: if purely numeric show "Ch X,XXX", else raw. */
function formatChainage(wbs: string | null | undefined): string | null {
  if (!wbs) return null;
  const n = Number(wbs);
  if (Number.isFinite(n) && n >= 0) {
    return `Ch ${Math.round(n).toLocaleString("en-AU")}`;
  }
  return wbs;
}

/** "4 Apr" style date label. */
function shortDate(d: Date): string {
  return format(d, "d MMM");
}

/* ------------------------------------------------------------------ */
/*  ProgressBar (isolated so local slider state doesn't re-render all) */
/* ------------------------------------------------------------------ */

function ProgressBar({
  activity,
  leftPct,
  widthPct,
  onMove,
}: {
  activity: PlannerActivity;
  leftPct: number;
  widthPct: number;
  onMove?: (payload: UpdateActivityPayload) => Promise<boolean>;
}) {
  const [local, setLocal] = useState(activity.progress_percent);
  const [dragging, setDragging] = useState(false);

  const bg = barColor(activity.status);

  const commit = useCallback(() => {
    setDragging(false);
    if (local !== activity.progress_percent && onMove) {
      void onMove({ id: activity.id, progress_percent: local });
    }
  }, [local, activity.id, activity.progress_percent, onMove]);

  useEffect(() => {
    if (!dragging) {
      setLocal(activity.progress_percent);
    }
  }, [activity.id, activity.progress_percent, dragging]);

  return (
    <div
      className="absolute top-1/2 -translate-y-1/2"
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        height: ROW_H - 12,
      }}
    >
      {/* background bar */}
      <div
        className="absolute inset-0 rounded-sm opacity-30"
        style={{ backgroundColor: bg }}
      />
      {/* progress fill */}
      <div
        className="absolute inset-y-0 left-0 rounded-sm"
        style={{
          width: `${local}%`,
          backgroundColor: bg,
        }}
      />
      {/* progress text */}
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold leading-none"
        style={{ color: local > 40 ? "#fff" : darken(bg, 60) }}
      >
        {local}%
      </span>
      {/* slider overlay */}
      {onMove && (
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={local}
          onChange={(e) => {
            setDragging(true);
            setLocal(Number(e.target.value));
          }}
          onPointerUp={commit}
          onTouchEnd={commit}
          className={cn(
            "absolute inset-0 z-10 w-full cursor-pointer appearance-none bg-transparent",
            "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-white/90 [&::-webkit-slider-thumb]:shadow-md",
            "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-sm [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white/90 [&::-moz-range-thumb]:shadow-md",
            "[&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent",
            "opacity-0 hover:opacity-100 focus:opacity-100"
          )}
          style={{ touchAction: "none" }}
          aria-label={`Progress for ${activity.name}`}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function LinearLookAhead({
  activities,
  crewMap,
  horizon,
  onActivityClick,
  onActivityMove,
  onGanttSelect,
  peopleLeaves = [],
}: LinearLookAheadProps) {
  const [crewCollapsed, setCrewCollapsed] = useState<Record<string, boolean>>({});

  /* ---- grid range ---- */
  const { weeks, gridStart, totalDays } = useMemo(() => {
    const now = new Date();
    const gs = startOfWeek(now, { weekStartsOn: 1 });
    const h = Math.max(2, Number(horizon) || 4);
    const ws: { start: Date; label: string }[] = [];
    for (let i = 0; i < h; i++) {
      const s = addWeeks(gs, i);
      ws.push({ start: s, label: shortDate(s) });
    }
    return { weeks: ws, gridStart: gs, totalDays: h * 7 };
  }, [horizon]);

  /* ---- crew groups ---- */
  const crewGroups = useMemo(() => {
    const actMap = new Map<string, PlannerActivity[]>();
    for (const a of activities) {
      const cid = a.crew_id || "unknown";
      const arr = actMap.get(cid) || [];
      arr.push(a);
      actMap.set(cid, arr);
    }
    const lvMap = new Map<string, PlannerPeopleLeave[]>();
    for (const lv of peopleLeaves) {
      const arr = lvMap.get(lv.crew_id) || [];
      arr.push(lv);
      lvMap.set(lv.crew_id, arr);
    }

    const allCrewIds = new Set([...Array.from(actMap.keys()), ...Array.from(lvMap.keys())]);
    const sorted = Array.from(allCrewIds).sort((a, b) => {
      const na = crewMap.get(a)?.name ?? a;
      const nb = crewMap.get(b)?.name ?? b;
      return na.localeCompare(nb);
    });

    return sorted.map((crewId) => ({
      crewId,
      crew: crewMap.get(crewId),
      activities: actMap.get(crewId) ?? [],
      leaves: lvMap.get(crewId) ?? [],
    }));
  }, [activities, crewMap, peopleLeaves]);

  /* ---- today marker ---- */
  const todayPct = useMemo(() => {
    const d = differenceInCalendarDays(new Date(), gridStart);
    if (d < 0 || d >= totalDays) return null;
    return (d / totalDays) * 100;
  }, [gridStart, totalDays]);

  /* ---- bar positioning helper ---- */
  const barPos = useCallback(
    (startStr: string, endStr: string) => {
      const s = parseDateOnlyLocal(startStr);
      const e = parseDateOnlyLocal(endStr);
      if (!s || !e) return null;
      const dayStart = differenceInCalendarDays(s, gridStart);
      const dayEnd = differenceInCalendarDays(e, gridStart) + 1; // inclusive end
      if (dayEnd <= 0 || dayStart >= totalDays) return null; // entirely outside
      const leftPct = Math.max(0, (dayStart / totalDays) * 100);
      const rightPct = Math.min(100, (dayEnd / totalDays) * 100);
      return { leftPct, widthPct: rightPct - leftPct };
    },
    [gridStart, totalDays]
  );

  /* ---- handlers ---- */
  const handleRowClick = useCallback(
    (act: PlannerActivity) => {
      onGanttSelect?.(act);
      onActivityClick(act);
    },
    [onActivityClick, onGanttSelect]
  );

  const toggleCrew = useCallback((crewId: string) => {
    setCrewCollapsed((prev) => ({ ...prev, [crewId]: !prev[crewId] }));
  }, []);

  /* ---- empty state ---- */
  if (crewGroups.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface text-dashboard-sm text-dashboard-text-muted">
        No activities to display. Create one to get started.
      </div>
    );
  }

  return (
    <div className="planner-gantt flex h-[min(72vh,calc(100dvh-13rem))] min-h-[280px] w-full max-w-full flex-col overflow-hidden rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface p-4 shadow-dashboard-card">
      {/* Legend */}
      <div
        className="mb-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-dashboard-border pb-3 text-dashboard-xs text-dashboard-text-secondary"
        aria-label="Status colours"
      >
        <span className="font-medium text-dashboard-text-muted">Legend</span>
        {(["planned", "in_progress", "done"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-4 shrink-0 rounded-sm border border-dashboard-border/60"
              style={{ backgroundColor: ACTIVITY_STATUS_COLORS[s] }}
              aria-hidden
            />
            {ACTIVITY_STATUS_LABELS[s]}
          </span>
        ))}
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
          People leave
        </span>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="inline-flex min-w-full">
          {/* ===== LEFT PANEL ===== */}
          <div className="sticky left-0 z-10 w-[260px] shrink-0 border-r border-dashboard-border bg-dashboard-surface md:w-[300px]">
            {/* header */}
            <div
              className="flex items-center border-b border-dashboard-border bg-dashboard-bg/60 px-3 text-dashboard-xs font-medium text-dashboard-text-secondary"
              style={{ height: CREW_ROW_H }}
            >
              <span className="flex-1">Activity</span>
              <span className="hidden w-16 text-right md:block">Status</span>
            </div>

            {crewGroups.map(({ crewId, crew, activities: acts, leaves }) => {
              const collapsed = crewCollapsed[crewId] === true;
              const cName = crew?.name ?? "Unknown";
              const cColor = crewColor(cName, crew?.index ?? 0);
              return (
                <div key={crewId}>
                  {/* crew header */}
                  <button
                    type="button"
                    onClick={() => toggleCrew(crewId)}
                    className="flex w-full items-center gap-2 border-b border-dashboard-border/50 bg-dashboard-bg/40 px-3 text-dashboard-sm font-medium text-dashboard-text-primary hover:bg-dashboard-bg/70"
                    style={{ height: CREW_ROW_H }}
                  >
                    <span className="text-dashboard-xs text-dashboard-text-muted">
                      {collapsed ? "▶" : "▼"}
                    </span>
                    <span
                      className="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold text-white"
                      style={{ backgroundColor: cColor }}
                    >
                      {cName}
                    </span>
                    <span className="text-dashboard-xs text-dashboard-text-muted">
                      {acts.length} activit{acts.length === 1 ? "y" : "ies"}
                    </span>
                  </button>

                  {!collapsed &&
                    acts.map((act) => {
                      const ch = formatChainage(act.wbs_code);
                      const statusColor = barColor(act.status);
                      return (
                        <button
                          key={act.id}
                          type="button"
                          onClick={() => handleRowClick(act)}
                          className="flex w-full items-center gap-2 border-b border-dashboard-border/30 px-3 text-left text-dashboard-sm text-dashboard-text-primary transition-colors hover:bg-dashboard-bg/50"
                          style={{ height: ROW_H }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate" title={act.name}>
                              {act.name || "Untitled"}
                            </div>
                            {ch && (
                              <div className="hidden truncate text-[11px] tabular-nums text-dashboard-text-muted md:block">
                                {ch}
                              </div>
                            )}
                          </div>
                          <span
                            className="hidden shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white md:inline-block"
                            style={{ backgroundColor: statusColor }}
                          >
                            {ACTIVITY_STATUS_LABELS[act.status] ?? act.status}
                          </span>
                        </button>
                      );
                    })}

                  {!collapsed &&
                    leaves.map((lv) => (
                      <div
                        key={lv.id}
                        className="flex items-center gap-2 border-b border-dashboard-border/30 px-3 text-dashboard-sm text-dashboard-text-muted"
                        style={{ height: ROW_H }}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: PEOPLE_LEAVE_BAR_COLOR }}
                          aria-hidden
                        />
                        <span className="truncate">
                          {lv.person_name?.trim() ? `Leave \u2014 ${lv.person_name.trim()}` : "Leave"}
                        </span>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>

          {/* ===== RIGHT PANEL ===== */}
          <div className="relative min-w-0 flex-1">
            {/* week headers */}
            <div
              className="flex border-b border-dashboard-border bg-dashboard-bg/60"
              style={{ height: CREW_ROW_H }}
            >
              {weeks.map((w, i) => (
                <div
                  key={i}
                  className="flex flex-1 items-center justify-center border-l border-dashboard-border/40 text-dashboard-xs font-medium text-dashboard-text-secondary"
                >
                  {w.label}
                </div>
              ))}
            </div>

            {/* today marker */}
            {todayPct !== null && (
              <div
                className="pointer-events-none absolute bottom-0 z-[5] w-px bg-dashboard-primary/50"
                style={{ left: `${todayPct}%`, top: CREW_ROW_H }}
              />
            )}

            {/* grid rows */}
            {crewGroups.map(({ crewId, activities: acts, leaves }) => {
              const collapsed = crewCollapsed[crewId] === true;
              return (
                <div key={crewId}>
                  {/* crew header spacer */}
                  <div
                    className="border-b border-dashboard-border/50 bg-dashboard-bg/40"
                    style={{ height: CREW_ROW_H }}
                  >
                    {/* grid lines behind */}
                    <div className="flex h-full">
                      {weeks.map((_, i) => (
                        <div key={i} className="flex-1 border-l border-dashboard-border/20" />
                      ))}
                    </div>
                  </div>

                  {!collapsed &&
                    acts.map((act) => {
                      const pos = barPos(act.start_date, act.end_date);
                      return (
                        <div
                          key={act.id}
                          className="relative border-b border-dashboard-border/30"
                          style={{ height: ROW_H }}
                        >
                          {/* grid lines */}
                          <div className="absolute inset-0 flex">
                            {weeks.map((_, i) => (
                              <div key={i} className="flex-1 border-l border-dashboard-border/20" />
                            ))}
                          </div>
                          {/* bar */}
                          {pos && (
                            <ProgressBar
                              activity={act}
                              leftPct={pos.leftPct}
                              widthPct={pos.widthPct}
                              onMove={onActivityMove}
                            />
                          )}
                        </div>
                      );
                    })}

                  {!collapsed &&
                    leaves.map((lv) => {
                      const pos = barPos(lv.start_date, lv.end_date);
                      return (
                        <div
                          key={lv.id}
                          className="relative border-b border-dashboard-border/30"
                          style={{ height: ROW_H }}
                        >
                          <div className="absolute inset-0 flex">
                            {weeks.map((_, i) => (
                              <div key={i} className="flex-1 border-l border-dashboard-border/20" />
                            ))}
                          </div>
                          {pos && (
                            <div
                              className="absolute top-1/2 -translate-y-1/2 rounded-sm border"
                              style={{
                                left: `${pos.leftPct}%`,
                                width: `${pos.widthPct}%`,
                                height: ROW_H - 12,
                                backgroundColor: PEOPLE_LEAVE_BAR_COLOR,
                                borderColor: PEOPLE_LEAVE_BORDER_COLOR,
                                opacity: 0.7,
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
