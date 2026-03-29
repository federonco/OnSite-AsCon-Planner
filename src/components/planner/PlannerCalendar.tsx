"use client";

import { useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { PlannerActivity, UpdateActivityPayload } from "@/lib/planner-types";
import { ACTIVITY_STATUS_COLORS } from "@/lib/planner-constants";
import { getCrewColor } from "@/lib/planner-constants";
import { addWeeks, format } from "date-fns";
import { addDaysDateOnly, subDaysDateOnly, toDateOnly } from "@/lib/planner-date";
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
  horizon: number;
  onActivityClick: (activity: PlannerActivity) => void;
  onActivityMove: (payload: UpdateActivityPayload) => void;
  onDateSelect: (startDate: string, endDate: string) => void;
}

export default function PlannerCalendar({
  activities,
  crewMap,
  horizon,
  onActivityClick,
  onActivityMove,
  onDateSelect,
}: PlannerCalendarProps) {
  const validRange = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const horizonEndStr = format(addWeeks(new Date(), horizon), "yyyy-MM-dd");
    let rangeStart = todayStr;
    let rangeEndInclusive = horizonEndStr;
    for (const act of activities) {
      const s = toDateOnly(act.start_date);
      const e = toDateOnly(act.end_date);
      if (s < rangeStart) rangeStart = s;
      if (e > rangeEndInclusive) rangeEndInclusive = e;
    }
    return { start: rangeStart, end: addDaysDateOnly(rangeEndInclusive, 1) };
  }, [activities, horizon]);

  const events: EventInput[] = useMemo(() => {
    return activities.map((act) => {
      const crew = crewMap.get(act.crew_id);
      const statusColor = ACTIVITY_STATUS_COLORS[act.status];
      const crewColor = crew ? getCrewColor(crew.index) : "#6B7280";
      const start = toDateOnly(act.start_date);
      const end = toDateOnly(act.end_date);

      return {
        id: act.id,
        title: act.name,
        start,
        end: addDaysDateOnly(end, 1),
        allDay: true,
        backgroundColor: statusColor,
        borderColor: crewColor,
        borderWidth: "3px",
        textColor: "#ffffff",
        extendedProps: { activity: act },
      };
    });
  }, [activities, crewMap]);

  const handleEventClick = (info: EventClickArg) => {
    const activity = info.event.extendedProps.activity as PlannerActivity;
    onActivityClick(activity);
  };

  const handleEventDrop = (info: EventDropArg) => {
    const activity = info.event.extendedProps.activity as PlannerActivity;
    const newStart = info.event.startStr;
    // Subtract 1 day from FullCalendar's exclusive end
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
      <FullCalendar
        key={events.map((e, i) => `${String(e.id ?? i)}-${String(e.start ?? "")}`).join("|")}
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        events={events}
        editable={true}
        selectable={true}
        selectMirror={true}
        dayMaxEvents={4}
        weekends={false}
        validRange={validRange}
        dayCellClassNames={dayCellClassNames}
        dayCellDidMount={dayCellDidMount}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,dayGridWeek",
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
