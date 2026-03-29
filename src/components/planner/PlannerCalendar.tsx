"use client";

import { useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { PlannerActivity, UpdateActivityPayload, type HorizonWeeks } from "@/lib/planner-types";
import HorizonSelector from "@/components/planner/HorizonSelector";
import { ACTIVITY_STATUS_COLORS } from "@/lib/planner-constants";
import { getCrewColor } from "@/lib/planner-constants";
import { format, startOfDay, startOfWeek } from "date-fns";
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
}

export default function PlannerCalendar({
  activities,
  crewMap,
  horizon,
  onHorizonChange,
  onActivityClick,
  onActivityMove,
  onDateSelect,
}: PlannerCalendarProps) {
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

      out.push({
        id: act.id,
        title: act.name,
        start: act.start_date,
        end: addDaysDateOnly(act.end_date, 1),
        allDay: true,
        backgroundColor: statusColor,
        borderColor: crewColor,
        borderWidth: "3px",
        textColor: "#ffffff",
        extendedProps: { activity: act },
      });
    }
    return out;
  }, [activities, crewMap]);

  /** Monday-start week containing today; remount via `key` picks fresh date when horizon/range changes. */
  const initialDate = useMemo(
    () => startOfWeek(startOfDay(new Date()), { weekStartsOn: 1 }),
    []
  );

  const handleEventClick = (info: EventClickArg) => {
    const activity = info.event.extendedProps.activity as PlannerActivity;
    onActivityClick(activity);
  };

  const handleEventDrop = (info: EventDropArg) => {
    const activity = info.event.extendedProps.activity as PlannerActivity;
    const newStart = info.event.startStr;
    const newEnd = subDaysDateOnly(info.event.endStr || info.event.startStr, 1);

    onActivityMove({
      id: activity.id,
      start_date: newStart,
      end_date: newEnd,
    });
  };

  const handleEventResize = (info: EventResizeDoneArg) => {
    const activity = info.event.extendedProps.activity as PlannerActivity;
    const newEnd = subDaysDateOnly(info.event.endStr || info.event.startStr, 1);

    onActivityMove({
      id: activity.id,
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
      <div className="relative z-[1] mb-4 flex flex-col gap-2 border-b border-dashboard-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-dashboard-sm font-medium text-dashboard-text-secondary">Planning horizon</span>
        <div className="shrink-0 rounded-dashboard-md border border-dashboard-border bg-dashboard-bg p-0.5">
          <HorizonSelector value={horizon} onChange={onHorizonChange} />
        </div>
      </div>
      <FullCalendar
        key={`planner-fc-${horizon}-${validRange.start}-${validRange.end}`}
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="plannerHorizon"
        initialDate={initialDate}
        events={events}
        editable={true}
        selectable={true}
        selectMirror={true}
        dayMaxEvents={4}
        views={calendarViews}
        weekends={false}
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
        WA public holidays are highlighted and do not count as working days in the summary below.
      </p>
    </div>
  );
}
