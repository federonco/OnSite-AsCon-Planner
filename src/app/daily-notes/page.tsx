import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/ui/AppShell";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopHeader } from "@/components/ui/TopHeader";
import { DailyNotesClient } from "@/components/daily-notes/DailyNotesClient";

function DailyNotesFallback() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface p-8 text-dashboard-sm text-dashboard-text-muted">
      Loading daily notes…
    </div>
  );
}

export default function DailyNotesPage() {
  return (
    <AppShell
      sidebar={<Sidebar activeId="daily-notes" />}
      header={
        <TopHeader
          left={
            <div>
              <h1 className="text-dashboard-lg font-semibold text-dashboard-text-primary">Daily notes</h1>
              <p className="mt-0.5 text-dashboard-sm text-dashboard-text-secondary">
                To-do list with day picker, meeting capture, and scratch items before they become Planner activities
              </p>
            </div>
          }
          right={
            <Link
              href="/planner"
              className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-4 py-2 text-dashboard-sm font-medium text-dashboard-text-secondary transition-colors hover:border-dashboard-primary/40 hover:text-dashboard-text-primary"
            >
              Go to Planner
            </Link>
          }
        />
      }
    >
      <Suspense fallback={<DailyNotesFallback />}>
        <DailyNotesClient />
      </Suspense>
    </AppShell>
  );
}
