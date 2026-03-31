"use client";

import { useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  PlannerActivity,
  PlannerPeopleLeave,
  UpdateActivityPayload,
  type HorizonWeeks,
} from "@/lib/planner-types";
import HorizonSelector from "@/components/planner/HorizonSelector";
import {
  ACTIVITY_STATUS_COLORS,
  PEOPLE_LEAVE_BAR_COLOR,
  PEOPLE_LEAVE_BORDER_COLOR,
} from "@/lib/planner-constants";
import { getCrewColor } from "@/lib/planner-constants";
import { addDays, eachDayOfInterval, format, startOfDay, startOfWeek } from "date-fns";
import { addDaysDateOnly, subDaysDateOnly } from "@/lib/planner-date";
import { getPlannerHorizonVisibleRange } from "@/lib/planner-horizon";
import { getWaPublicHolidayName } from "@/lib/wa-public-holidays";
import type { DayCellMountArg } from "@fullcalendar/core";
import type { EventInput, EventClickArg, EventDropArg, DateSelectArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";

interface CrewInfo {
  id: string;
  name: string;
  index: number;
}

interface PlannerCalendarProps {
  activities: PlannerActivity[];
  crewMap: Map<string, CrewInfo>;
  horizon: HorizonWeeks;
  onHorizonChange: (weeks: HorizonWeeks) => void;
  onActivityClick: (activity: PlannerActivity) => void;
  onActivityMove: (payload: UpdateActivityPayload) => void | Promise<boolean>;
  onDateSelect: (startDate: string, endDate: string) => void;
  peopleLeaves?: PlannerPeopleLeave[];
}

const SEGMENT_SEPARATOR = "::seg::";

function allowsWeekendWork(act: PlannerActivity): boolean {
  const notes = (act.notes ?? "").toLowerCase();
  return notes.includes("[weekend]") || notes.includes("weekend work");
}

function activityBaseId(eventId: string): string {
  const idx = eventId.indexOf(SEGMENT_SEPARATOR);
  return idx >= 0 ? eventId.slice(0, idx) : eventId;
}

export default function PlannerCalendar({
  activities,
  crewMap,
  horizon,
  onHorizonChange,
  onActivityClick,
  onActivityMove,
  onDateSelect,
  peopleLeaves = [],
}: PlannerCalendarProps) {
  /** When true, Sat/Sun columns are hidden (FullCalendar `weekends={false}`). */
  const [hideWeekends, setHideWeekends] = useState(false);

  const visibleRange = useMemo(
    () => getPlannerHorizonVisibleRange(horizon, activities),
    [activities, horizon]
  );

  const validRange = useMemo(
    () => ({ start: visibleRange.start, end: visibleRange.endExclusive }),
    [visibleRange]
  );

  /** N consecutive calendar weeks from Monday of this week — matches HorizonSelector (2W / 4W / …). */
  const calendarViews = useMemo(
    () => ({
      plannerHorizon: {
        type: "dayGrid" as const,
        duration: { weeks: horizon },
        buttonText: `${horizon}W`,
        dayMaxEvents: true,
        aspectRatio: Math.max(0.55, 2.4 / horizon),
      },
      dayGridWeek: {
        dayMaxEvents: true,
        aspectRatio: 0.42,
      },
    }),
    [horizon]
  );

  const events: EventInput[] = useMemo(() => {
    const out: EventInput[] = [];
    for (const act of activities) {
      const crew = crewMap.get(act.crew_id);
      const statusColor = ACTIVITY_STATUS_COLORS[act.status] ?? ACTIVITY_STATUS_COLORS.planned;
      const crewColor = crew ? getCrewColor(crew.index) : "#6B7280";
      const allowWeekend = allowsWeekendWork(act);
      const days = eachDayOfInterval({
        start: new Date(`${act.start_date}T12:00:00`),
        end: new Date(`${act.end_date}T12:00:00`),
      });
      let segStart: Date | null = null;
      let lastWorking: Date | null = null;
      let segIdx = 0;
      let segmented = false;
      for (const d of days) {
        const ds = format(d, "yyyy-MM-dd");
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        const holiday = Boolean(getWaPublicHolidayName(ds));
        const blocked = holiday || (!allowWeekend && weekend);
        if (blocked) {
          if (segStart) {
            segmented = true;
            out.push({
              id: `${act.id}${SEGMENT_SEPARATOR}${segIdx++}`,
              title: act.name,
              start: format(segStart, "yyyy-MM-dd"),
              end: format(d, "yyyy-MM-dd"),
              allDay: true,
              editable: false,
              backgroundColor: statusColor,
              borderColor: crewColor,
              borderWidth: "3px",
              textColor: "#ffffff",
              extendedProps: { activity: act, segmented: true },
            });
            segStart = null;
          }
          continue;
        }
        if (!segStart) segStart = d;
        lastWorking = d;
      }
      if (segStart) {
        const segEndExclusive = addDays(lastWorking ?? segStart, 1);
        out.push({
          id: segmented ? `${act.id}${SEGMENT_SEPARATOR}${segIdx}` : act.id,
          title: act.name,
          start: format(segStart, "yyyy-MM-dd"),
          end: format(segEndExclusive, "yyyy-MM-dd"),
          allDay: true,
          editable: !segmented,
          backgroundColor: statusColor,
          borderColor: crewColor,
          borderWidth: "3px",
          textColor: "#ffffff",
          extendedProps: { activity: act, segmented },
        });
      }
    }
    for (const lv of peopleLeaves) {
      const title = lv.person_name?.trim() ? `Leave: ${lv.person_name.trim()}` : "Leave";
      out.push({
        id: `leave-${lv.id}`,
        title,
        start: lv.start_date,
        end: addDaysDateOnly(lv.end_date, 1),
        allDay: true,
        editable: false,
        backgroundColor: PEOPLE_LEAVE_BAR_COLOR,
        borderColor: PEOPLE_LEAVE_BORDER_COLOR,
        borderWidth: "3px",
        textColor: "#ffffff",
        classNames: ["fc-event-leave"],
        extendedProps: { leave: lv },
      });
    }
    return out;
  }, [activities, crewMap, peopleLeaves]);

  /** Monday-start week containing today; remount via `key` picks fresh date when horizon/range changes. */
  const initialDate = useMemo(
    () => startOfWeek(startOfDay(new Date()), { weekStartsOn: 1 }),
    []
  );

  const handleEventClick = (info: EventClickArg) => {
    if (info.event.extendedProps.leave) return;
    const activity = info.event.extendedProps.activity as PlannerActivity;
    onActivityClick(activity);
  };

  const handleEventDrop = (info: EventDropArg) => {
    if (info.event.extendedProps.leave) {
      info.revert();
      return;
    }
    if (info.event.extendedProps.segmented) {
      info.revert();
      return;
    }
    const activity = info.event.extendedProps.activity as PlannerActivity;
    const newStart = info.event.startStr;
    const newEnd = subDaysDateOnly(info.event.endStr || info.event.startStr, 1);

    onActivityMove({
      id: activityBaseId(activity.id),
      start_date: newStart,
      end_date: newEnd,
    });
  };

  const handleEventResize = (info: EventResizeDoneArg) => {
    if (info.event.extendedProps.leave) {
      info.revert();
      return;
    }
    if (info.event.extendedProps.segmented) {
      info.revert();
      return;
    }
    const activity = info.event.extendedProps.activity as PlannerActivity;
    const newEnd = subDaysDateOnly(info.event.endStr || info.event.startStr, 1);

    onActivityMove({
      id: activityBaseId(activity.id),
      end_date: newEnd,
    });
  };

  const handleDateSelect = (info: DateSelectArg) => {
    const endDate = subDaysDateOnly(info.endStr, 1);
    onDateSelect(info.startStr, endDate);
  };

  const dayCellClassNames = (arg: { date: Date }) => {
    const ds = format(arg.date, "yyyy-MM-dd");
    return getWaPublicHolidayName(ds) ? ["fc-day-wa-ph"] : [];
  };

  const dayCellDidMount = (arg: DayCellMountArg) => {
    const ds = format(arg.date, "yyyy-MM-dd");
    const name = getWaPublicHolidayName(ds);
    if (!name) return;
    const frame = arg.el.querySelector(".fc-daygrid-day-frame");
    if (!frame || frame.querySelector(".wa-ph-chip")) return;
    arg.el.setAttribute("title", `WA public holiday — ${name} (not a working day)`);
    const chip = document.createElement("div");
    chip.className = "wa-ph-chip";
    chip.textContent = name;
    frame.appendChild(chip);
  };

  return (
    <div className="planner-calendar rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface p-4 shadow-dashboard-card">
      <div className="relative z-[1] mb-4 flex flex-col gap-3 border-b border-dashboard-border pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span className="text-dashboard-sm font-medium text-dashboard-text-secondary">Planning horizon</span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="shrink-0 rounded-dashboard-md border border-dashboard-border bg-dashboard-bg p-0.5">
            <HorizonSelector value={horizon} onChange={onHorizonChange} />
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 text-dashboard-sm text-dashboard-text-secondary">
            <input
              type="checkbox"
              checked={hideWeekends}
              onChange={(e) => setHideWeekends(e.target.checked)}
              className="h-4 w-4 rounded border-dashboard-border text-dashboard-primary focus:ring-2 focus:ring-dashboard-primary/30"
            />
            Hide weekends
          </label>
        </div>
      </div>
      <FullCalendar
        key={`planner-fc-${horizon}-${validRange.start}-${validRange.end}-w${hideWeekends ? 0 : 1}`}
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="plannerHorizon"
        initialDate={initialDate}
        firstDay={1}
        events={events}
        editable={true}
        selectable={true}
        selectMirror={true}
        dayMaxEvents={4}
        views={calendarViews}
        weekends={!hideWeekends}
        validRange={validRange}
        dayCellClassNames={dayCellClassNames}
        dayCellDidMount={dayCellDidMount}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "plannerHorizon,dayGridWeek,dayGridMonth",
        }}
        eventClick={handleEventClick}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        select={handleDateSelect}
        height="auto"
        eventDisplay="block"
      />
      <p className="mt-3 text-dashboard-xs text-dashboard-text-muted">
        Purple blocks are people leave (read-only).{" "}
        {hideWeekends
          ? "Weekends are hidden from the grid; enable the checkbox above to show Sat–Sun."
          : "Weekends (Sat–Sun) are shown. Uncheck Hide weekends to collapse them."}{" "}
        WA public holidays are highlighted and do not count as working days in the summary below.
      </p>
    </div>
  );
}
