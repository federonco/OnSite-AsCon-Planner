"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  PlannerActivity,
  CreateActivityPayload,
  UpdateActivityPayload,
  HorizonWeeks,
} from "@/lib/planner-types";
import HorizonSelector from "@/components/planner/HorizonSelector";
import CrewFilter from "@/components/planner/CrewFilter";
import SectionFilter from "@/components/planner/SectionFilter";
import { PLANNER_CREW_ROLLOUT_NAME } from "@/lib/planner-constants";
import ActivityForm from "@/components/planner/ActivityForm";
import ProjectImporter from "@/components/planner/ProjectImporter";
import { format } from "date-fns";
import { AppShell } from "@/components/ui/AppShell";
import { CreateEventButton } from "@/components/ui/CreateEventButton";
import { SearchInput } from "@/components/ui/SearchInput";
import { SettingsDropdown } from "@/components/ui/SettingsDropdown";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopHeader } from "@/components/ui/TopHeader";

const PlannerCalendar = dynamic(
  () => import("@/components/planner/PlannerCalendar"),
  { ssr: false, loading: () => <LoadingPlaceholder /> }
);

const PlannerGantt = dynamic(() => import("@/components/planner/PlannerGantt"), {
  ssr: false,
  loading: () => <LoadingPlaceholder />,
});

function LoadingPlaceholder() {
  return (
    <div className="flex h-64 items-center justify-center rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface text-dashboard-sm text-dashboard-text-muted shadow-dashboard-card">
      Loading calendar…
    </div>
  );
}

interface Crew {
  id: string;
  name: string;
}

interface CrewInfo {
  id: string;
  name: string;
  index: number;
}

export default function PlannerPage() {
  const [horizon, setHorizon] = useState<HorizonWeeks>(4);
  const [crewFilter, setCrewFilter] = useState<string | null>(null);

  const [activities, setActivities] = useState<PlannerActivity[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);

  const [showActivityForm, setShowActivityForm] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<PlannerActivity | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | null>(null);
  const [showImporter, setShowImporter] = useState(false);
  const [viewMode, setViewMode] = useState<"calendar" | "gantt">("calendar");
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [drainerSections, setDrainerSections] = useState<{ id: string; name: string }[]>([]);

  const crewMap = useMemo(() => {
    const map = new Map<string, CrewInfo>();
    crews.forEach((c, idx) => map.set(c.id, { id: c.id, name: c.name, index: idx }));
    return map;
  }, [crews]);

  const rolloutCrewId = useMemo(() => {
    if (!PLANNER_CREW_ROLLOUT_NAME) return null;
    const target = PLANNER_CREW_ROLLOUT_NAME.trim().toLowerCase();
    return crews.find((c) => c.name.trim().toLowerCase() === target)?.id ?? null;
  }, [crews]);

  const onlyEnabledCrewId: false | string | null = PLANNER_CREW_ROLLOUT_NAME
    ? rolloutCrewId ?? null
    : false;

  const crewIdForApi = useMemo(() => {
    if (PLANNER_CREW_ROLLOUT_NAME) {
      return typeof onlyEnabledCrewId === "string" ? onlyEnabledCrewId : null;
    }
    return crewFilter;
  }, [crewFilter, onlyEnabledCrewId]);

  const crewsForForms = useMemo(() => {
    if (typeof onlyEnabledCrewId === "string") {
      return crews.filter((c) => c.id === onlyEnabledCrewId);
    }
    return crews;
  }, [crews, onlyEnabledCrewId]);

  const crewIdForSections = useMemo(() => {
    if (typeof onlyEnabledCrewId === "string") return onlyEnabledCrewId;
    return crewFilter;
  }, [onlyEnabledCrewId, crewFilter]);

  useEffect(() => {
    setSectionFilter(null);
  }, [crewIdForSections]);

  useEffect(() => {
    if (!crewIdForSections) {
      setDrainerSections([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { getSupabase } = await import("@/lib/supabase");
      const supabase = getSupabase();
      const { data } = await supabase
        .from("drainer_sections")
        .select("id, name")
        .eq("crew_id", crewIdForSections)
        .order("name");
      if (!cancelled) setDrainerSections(data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [crewIdForSections]);

  const visibleActivities = useMemo(() => {
    if (!sectionFilter) return activities;
    return activities.filter((a) => a.drainer_section_id === sectionFilter);
  }, [activities, sectionFilter]);

  useEffect(() => {
    const fetchCrews = async () => {
      try {
        const { getSupabase } = await import("@/lib/supabase");
        const supabase = getSupabase();
        const { data } = await supabase.from("crews").select("id, name").order("name");
        if (data) setCrews(data);
      } catch (err) {
        console.error("Failed to fetch crews:", err);
      }
    };
    fetchCrews();
  }, []);

  const fetchActivities = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (crewIdForApi) params.set("crew_id", crewIdForApi);

      const res = await fetch(`/api/planner/activities?${params}`);
      if (res.ok) {
        setActivities(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch activities:", err);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [crewIdForApi]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    if (typeof onlyEnabledCrewId === "string") {
      setCrewFilter(onlyEnabledCrewId);
    }
  }, [onlyEnabledCrewId]);

  const handleSave = async (payload: CreateActivityPayload | UpdateActivityPayload) => {
    const res = await fetch("/api/planner/activities", {
      method: "id" in payload ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: string }).error || res.statusText;
      console.error("Save activity failed:", msg);
      throw new Error(msg);
    }
    const saved = (await res.json()) as PlannerActivity;
    setActivities((prev) => {
      const rest = prev.filter((a) => a.id !== saved.id);
      return [...rest, saved].sort(
        (a, b) => a.start_date.localeCompare(b.start_date) || a.sort_order - b.sort_order
      );
    });
    await fetchActivities({ silent: true });
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/planner/activities?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setActivities((prev) => prev.filter((a) => a.id !== id));
      setShowActivityForm(false);
      setSelectedActivity(null);
    }
  };

  const handleActivityMove = async (payload: UpdateActivityPayload) => {
    const res = await fetch("/api/planner/activities", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const saved = (await res.json()) as PlannerActivity;
      setActivities((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
    }
  };

  const handleActivityClick = (activity: PlannerActivity) => {
    setSelectedActivity(activity);
    setDefaultDate(null);
    setShowActivityForm(true);
  };

  const handleDateSelect = (startDate: string, endDate: string) => {
    setSelectedActivity(null);
    setDefaultDate(startDate);
    void endDate;
    setShowActivityForm(true);
  };

  const handleNewActivity = () => {
    setSelectedActivity(null);
    setDefaultDate(format(new Date(), "yyyy-MM-dd"));
    setShowActivityForm(true);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
        handleNewActivity();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <AppShell
        sidebar={<Sidebar activeId="schedule" />}
        header={
          <TopHeader
            left={
              <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
                <div className="hidden min-w-0 max-w-md flex-1 md:block">
                  <SearchInput placeholder="Search activities, crews, or WBS…" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex rounded-dashboard-md border border-dashboard-border bg-dashboard-bg p-0.5">
                    <button
                      type="button"
                      onClick={() => setViewMode("calendar")}
                      className={`rounded-dashboard-sm px-3 py-1.5 text-dashboard-sm font-medium transition-colors ${
                        viewMode === "calendar"
                          ? "bg-dashboard-surface text-dashboard-text-primary shadow-sm"
                          : "text-dashboard-text-secondary hover:text-dashboard-text-primary"
                      }`}
                    >
                      Calendar
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("gantt")}
                      className={`rounded-dashboard-sm px-3 py-1.5 text-dashboard-sm font-medium transition-colors ${
                        viewMode === "gantt"
                          ? "bg-dashboard-surface text-dashboard-text-primary shadow-sm"
                          : "text-dashboard-text-secondary hover:text-dashboard-text-primary"
                      }`}
                    >
                      Gantt
                    </button>
                  </div>
                  <HorizonSelector value={horizon} onChange={setHorizon} />
                  <div className="hidden h-6 w-px bg-dashboard-border sm:block" />
                  <CrewFilter
                    crews={crews}
                    value={typeof onlyEnabledCrewId === "string" ? onlyEnabledCrewId : crewFilter}
                    onChange={setCrewFilter}
                    onlyEnabledCrewId={onlyEnabledCrewId}
                  />
                  <SectionFilter
                    sections={drainerSections}
                    value={sectionFilter}
                    onChange={setSectionFilter}
                    disabled={!crewIdForSections}
                  />
                </div>
              </div>
            }
            right={
              <>
                <button
                  type="button"
                  onClick={() => setShowImporter(true)}
                  className="rounded-dashboard-md px-4 py-2.5 text-dashboard-sm font-medium text-dashboard-text-secondary transition-[background-color,color] duration-dashboard-fast hover:bg-dashboard-bg hover:text-dashboard-text-primary"
                >
                  Import XML
                </button>
                <CreateEventButton onClick={handleNewActivity}>+ Activity</CreateEventButton>
                <SettingsDropdown />
              </>
            }
          />
        }
      >
        <div className="mx-auto max-w-[1600px] space-y-6">
          <div>
            <h1 className="text-dashboard-xl font-semibold text-dashboard-text-primary">OnSite Planner</h1>
            <p className="mt-1 text-dashboard-sm font-normal text-dashboard-text-secondary">
              Pipeline activities · WA horizon &amp; crew filters
            </p>
          </div>

          {loading && activities.length === 0 ? (
            <LoadingPlaceholder />
          ) : viewMode === "calendar" ? (
            <PlannerCalendar
              activities={visibleActivities}
              crewMap={crewMap}
              horizon={horizon}
              onActivityClick={handleActivityClick}
              onActivityMove={handleActivityMove}
              onDateSelect={handleDateSelect}
            />
          ) : (
            <PlannerGantt
              activities={visibleActivities}
              crewMap={crewMap}
              onActivityClick={handleActivityClick}
            />
          )}

          <div className="flex flex-wrap items-center gap-6 text-dashboard-sm text-dashboard-text-secondary">
            <span>{visibleActivities.length} activities</span>
            <span>{visibleActivities.filter((a) => a.status === "in_progress").length} in progress</span>
            <span>{visibleActivities.filter((a) => a.status === "done").length} done</span>
            <span>{visibleActivities.filter((a) => a.status === "blocked").length} blocked</span>
            <span className="ml-auto text-dashboard-xs text-dashboard-text-muted">
              Press <kbd className="rounded-dashboard-sm bg-dashboard-bg px-1.5 py-0.5 font-mono text-dashboard-text-secondary">N</kbd>{" "}
              for new activity
            </span>
          </div>
        </div>
      </AppShell>

      {showActivityForm && (
        <ActivityForm
          key={selectedActivity?.id ?? `new-${defaultDate ?? ""}-${sectionFilter ?? ""}`}
          activity={selectedActivity}
          crews={crewsForForms.length > 0 ? crewsForForms : crews}
          defaultCrewId={typeof onlyEnabledCrewId === "string" ? onlyEnabledCrewId : crewFilter}
          defaultDate={defaultDate}
          defaultSectionId={sectionFilter}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => {
            setShowActivityForm(false);
            setSelectedActivity(null);
          }}
        />
      )}

      {showImporter && (
        <ProjectImporter
          crews={crewsForForms.length > 0 ? crewsForForms : crews}
          onImported={() => {
            setShowImporter(false);
            fetchActivities();
          }}
          onClose={() => setShowImporter(false)}
        />
      )}
    </>
  );
}
