"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { DailyTaskList } from "./DailyTaskList";
import { isValidDateOnlyString, toDateOnly } from "@/lib/planner-date";

function todayYmd(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function DailyNotesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedDate = useMemo(() => {
    const raw = searchParams.get("date");
    if (!raw) return todayYmd();
    const d = toDateOnly(raw);
    return isValidDateOnlyString(d) ? d : todayYmd();
  }, [searchParams]);

  const onDateChange = useCallback(
    (next: string) => {
      const q = new URLSearchParams(searchParams.toString());
      q.set("date", next);
      router.replace(`/daily-notes?${q.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <p className="text-dashboard-sm text-dashboard-text-secondary">
        Capture to-dos here; unfinished items roll to the next day. Completed items stay on the day you checked
        them. Open a date below or use{" "}
        <Link href="/planner" className="font-medium text-dashboard-primary hover:underline">
          Planner
        </Link>{" "}
        when work is ready to schedule with crews.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface p-5 shadow-dashboard-card">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-dashboard-md font-semibold text-dashboard-text-primary">To-do list</h2>
            <label className="flex flex-wrap items-center gap-2 text-dashboard-sm text-dashboard-text-secondary">
              <span className="shrink-0">Day</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="rounded-dashboard-md border border-dashboard-border bg-dashboard-bg px-3 py-1.5 text-dashboard-sm text-dashboard-text-primary focus:outline-none focus:ring-2 focus:ring-dashboard-primary/30"
              />
              <button
                type="button"
                onClick={() => onDateChange(todayYmd())}
                className="rounded-dashboard-md border border-dashboard-border px-3 py-1.5 text-dashboard-xs font-medium text-dashboard-text-secondary hover:bg-dashboard-bg"
              >
                Today
              </button>
            </label>
          </div>
          <DailyTaskList selectedDate={selectedDate} />
        </section>

        <section className="rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface p-5 shadow-dashboard-card">
          <h2 className="text-dashboard-md font-semibold text-dashboard-text-primary">Meeting notes</h2>
          <p className="mt-2 text-dashboard-sm text-dashboard-text-muted">
            Coming soon: notes per meeting; sort and turn outcomes into scheduled work.
          </p>
        </section>
      </div>
    </div>
  );
}
