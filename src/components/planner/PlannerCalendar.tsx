"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
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

/** Monday-first weeks covering `displayMonth` (padding days outside the month included). */
function monthCalendarGrid(displayMonth: Date): Date[][] {
  const monthStart = startOfMonth(displayMonth);
  const monthEnd = endOfMonth(displayMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

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
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  /** Month shown in the popup grid (1st of month). */
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const calendarRef = useRef<FullCalendar>(null);
  const [sendEmailOpen, setSendEmailOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const crewNamesRecord = useMemo(() => Object.fromEntries(crewMap), [crewMap]);

  const visibleRange = useMemo(
    () => getPlannerHorizonVisibleRange(horizon, activities),
    [activities, horizon]
  );

  const validRange = useMemo(
    () => ({ start: visibleRange.start, end: visibleRange.endExclusive }),
    [visibleRange]
  );

  const dateInputMax = useMemo(
    () => subDaysDateOnly(visibleRange.endExclusive, 1),
    [visibleRange.endExclusive]
  );

  const rangeStartDate = useMemo(() => parseISO(visibleRange.start), [visibleRange.start]);
  const rangeEndDate = useMemo(() => parseISO(dateInputMax), [dateInputMax]);

  const monthWeeks = useMemo(() => monthCalendarGrid(viewMonth), [viewMonth]);

  const canPrevMonth = useMemo(
    () => isAfter(startOfMonth(viewMonth), startOfMonth(rangeStartDate)),
    [viewMonth, rangeStartDate]
  );

  const canNextMonth = useMemo(
    () => isBefore(startOfMonth(viewMonth), startOfMonth(rangeEndDate)),
    [viewMonth, rangeEndDate]
  );

  const isDayOutOfPlannerRange = useCallback(
    (d: Date) => {
      const s = format(d, "yyyy-MM-dd");
      return s < visibleRange.start || s > dateInputMax;
    },
    [visibleRange.start, dateInputMax]
  );

  /** N consecutive calendar weeks from Monday of this week — matches HorizonSelector (2W / 4W / …). */
  const calendarViews = useMemo(
    () => ({
      plannerHorizon: {
        type: "dayGrid" as const,
        duration: { weeks: horizon },
        dayMaxEvents: true,
        aspectRatio: Math.max(0.55, 2.4 / horizon),
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

  const gotoWeekContaining = useCallback((ymd: string) => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    const d = parseISO(ymd);
    api.gotoDate(startOfWeek(startOfDay(d), { weekStartsOn: 1 }));
  }, []);

  const openTodayDatePicker = useCallback(() => {
    const api = calendarRef.current?.getApi();
    const anchor = api?.getDate() ?? new Date();
    setViewMonth(startOfMonth(anchor));
    setDatePickerOpen(true);
  }, []);

  const goToThisWeekToday = useCallback(() => {
    gotoWeekContaining(format(startOfDay(new Date()), "yyyy-MM-dd"));
    setDatePickerOpen(false);
  }, [gotoWeekContaining]);

  const handlePickDayInMonth = useCallback(
    (d: Date) => {
      if (isDayOutOfPlannerRange(d)) return;
      gotoWeekContaining(format(d, "yyyy-MM-dd"));
      setDatePickerOpen(false);
    },
    [gotoWeekContaining, isDayOutOfPlannerRange]
  );

  const customButtons = useMemo(
    () => ({
      pickDate: {
        text: "Today",
        click: () => openTodayDatePicker(),
      },
    }),
    [openTodayDatePicker]
  );

  const handleOpenSendEmail = useCallback(() => {
    setEmailError(null);
    setSendEmailOpen(true);
  }, []);

  const handleConfirmSendEmail = useCallback(async () => {
    setEmailSending(true);
    setEmailError(null);
    try {
      const api = calendarRef.current?.getApi();
      const viewAnchorDate = api
        ? format(api.getDate(), "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd");
      const res = await fetch("/api/planner/calendar/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: recipientEmail.trim() || undefined,
          horizonWeeks: horizon,
          hideWeekends,
          viewAnchorDate,
          activities,
          peopleLeaves,
          crewMap: crewNamesRecord,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSendEmailOpen(false);
      setRecipientEmail("");
      window.alert("Planning PDF sent by email.");
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setEmailSending(false);
    }
  }, [
    activities,
    crewNamesRecord,
    hideWeekends,
    horizon,
    peopleLeaves,
    recipientEmail,
  ]);

  useEffect(() => {
    if (!sendEmailOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSendEmailOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sendEmailOpen]);

  useEffect(() => {
    if (!datePickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDatePickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [datePickerOpen]);

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
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="w-[220px] max-w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-bg p-0.5">
              <HorizonSelector value={horizon} onChange={onHorizonChange} equalWidth />
            </div>
            <button
              type="button"
              onClick={() => handleOpenSendEmail()}
              disabled={emailSending}
              className="shrink-0 rounded-dashboard-md border border-dashboard-border bg-dashboard-bg px-3 py-1.5 text-dashboard-sm font-medium text-dashboard-text-primary transition-colors hover:bg-dashboard-border/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send PDF
            </button>
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
      {sendEmailOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1A1D2E]/40 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="planner-send-pdf-title"
          onClick={() => setSendEmailOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface p-4 shadow-dashboard-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="planner-send-pdf-title"
              className="text-dashboard-md font-semibold text-dashboard-text-primary"
            >
              Send planning PDF
            </h2>
            <label className="mt-3 block text-dashboard-sm text-dashboard-text-secondary">
              Recipient email
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
                className="mt-1 w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-bg px-3 py-2 text-dashboard-sm text-dashboard-text-primary focus:outline-none focus:ring-2 focus:ring-[#5B5FEF]/25"
              />
            </label>
            {emailError && (
              <p className="mt-2 text-dashboard-xs text-dashboard-status-danger" role="alert">
                {emailError}
              </p>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-dashboard-border pt-3">
              <button
                type="button"
                onClick={() => setSendEmailOpen(false)}
                className="rounded-dashboard-md px-3 py-1.5 text-dashboard-sm font-medium text-dashboard-text-secondary hover:text-dashboard-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={emailSending}
                onClick={() => void handleConfirmSendEmail()}
                className="rounded-dashboard-md bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] px-4 py-1.5 text-dashboard-sm font-medium text-white shadow-dashboard-card disabled:cursor-not-allowed disabled:opacity-50"
              >
                {emailSending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
      {datePickerOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1A1D2E]/40 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="planner-date-picker-title"
          onClick={() => setDatePickerOpen(false)}
        >
          <div
            className="w-full max-w-[min(100%,320px)] rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface p-4 shadow-dashboard-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="planner-date-picker-title" className="text-dashboard-md font-semibold text-dashboard-text-primary">
              Select month
            </h2>
            <p className="mt-1 text-dashboard-xs text-dashboard-text-secondary">
              Pick a day in the grid; the planner jumps to the week that contains it. Use arrows to change month.
            </p>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={!canPrevMonth}
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-dashboard-md border border-dashboard-border bg-dashboard-bg text-dashboard-text-primary transition-colors hover:bg-dashboard-border/50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous month"
              >
                <span aria-hidden className="text-lg leading-none">
                  ‹
                </span>
              </button>
              <span className="min-w-0 flex-1 text-center text-dashboard-sm font-semibold text-dashboard-text-primary">
                {format(viewMonth, "MMMM yyyy")}
              </span>
              <button
                type="button"
                disabled={!canNextMonth}
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-dashboard-md border border-dashboard-border bg-dashboard-bg text-dashboard-text-primary transition-colors hover:bg-dashboard-border/50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next month"
              >
                <span aria-hidden className="text-lg leading-none">
                  ›
                </span>
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-y-1 text-center text-dashboard-xs font-medium text-dashboard-text-muted">
              {WEEKDAY_LABELS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="mt-1 space-y-1">
              {monthWeeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1">
                  {week.map((day) => {
                    const inMonth = isSameMonth(day, viewMonth);
                    const disabled = isDayOutOfPlannerRange(day);
                    const ds = format(day, "yyyy-MM-dd");
                    return (
                      <button
                        key={ds}
                        type="button"
                        disabled={disabled}
                        onClick={() => handlePickDayInMonth(day)}
                        className={`h-8 rounded-dashboard-sm text-dashboard-xs font-medium transition-colors ${
                          disabled
                            ? "cursor-not-allowed text-dashboard-text-muted/40"
                            : inMonth
                              ? "text-dashboard-text-primary hover:bg-dashboard-primary/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-dashboard-primary/40"
                              : "text-dashboard-text-muted/50 hover:bg-dashboard-bg"
                        }`}
                      >
                        {format(day, "d")}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-dashboard-border pt-3">
              <button
                type="button"
                onClick={() => {
                  setViewMonth(startOfMonth(new Date()));
                }}
                className="mr-auto rounded-dashboard-md px-3 py-1.5 text-dashboard-xs font-medium text-dashboard-text-secondary hover:text-dashboard-text-primary"
              >
                This month
              </button>
              <button
                type="button"
                onClick={goToThisWeekToday}
                className="rounded-dashboard-md border border-dashboard-border bg-dashboard-bg px-3 py-1.5 text-dashboard-xs font-medium text-dashboard-text-primary hover:bg-dashboard-border/40"
              >
                Go to today
              </button>
              <button
                type="button"
                onClick={() => setDatePickerOpen(false)}
                className="rounded-dashboard-md px-3 py-1.5 text-dashboard-xs font-medium text-dashboard-text-secondary hover:text-dashboard-text-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <FullCalendar
        ref={calendarRef}
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
        customButtons={customButtons}
        headerToolbar={{
          left: "prev,next pickDate",
          center: "title",
          right: "",
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
