import Link from "next/link";
import { AppShell } from "@/components/ui/AppShell";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopHeader } from "@/components/ui/TopHeader";

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
                Todos, meeting notes, and scratch items before they become Planner activities
              </p>
            </div>
          }
          right={
            <Link
              href="/planner"
              className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-4 py-2 text-dashboard-sm font-medium text-dashboard-text-secondary transition-colors hover:border-dashboard-primary/40 hover:text-dashboard-text-primary"
            >
              Go To Planner
            </Link>
          }
        />
      }
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <p className="text-dashboard-sm text-dashboard-text-secondary">
          Use this space for quick to-dos and meeting capture. When something is defined enough, create it as an
          activity in the calendar so it sits with crew sections and dates.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface p-5 shadow-dashboard-card">
            <h2 className="text-dashboard-md font-semibold text-dashboard-text-primary">To-do list</h2>
            <p className="mt-2 text-dashboard-sm text-dashboard-text-muted">
              Coming soon: checklist items you can later promote to Planner activities.
            </p>
          </section>
          <section className="rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface p-5 shadow-dashboard-card">
            <h2 className="text-dashboard-md font-semibold text-dashboard-text-primary">Meeting notes</h2>
            <p className="mt-2 text-dashboard-sm text-dashboard-text-muted">
              Coming soon: notes per meeting; sort and turn outcomes into scheduled work.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
