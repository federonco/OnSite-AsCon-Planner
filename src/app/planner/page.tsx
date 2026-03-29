"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import {
  PlannerActivity,
  PlannerPeopleLeave,
  CreateActivityPayload,
  UpdateActivityPayload,
  HorizonWeeks,
} from "@/lib/planner-types";
import {
  mapPlannerRowsFromApi,
  mapRowToPlannerActivity,
} from "@/lib/planner-activity-mapper";
import { mapRowToPlannerPeopleLeave } from "@/lib/planner-leave-mapper";
import { getPlannerHorizonVisibleRange } from "@/lib/planner-horizon";
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
import PeopleLeaveQrDialog from "@/components/planner/PeopleLeaveQrDialog";

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
  const [peopleLeaves, setPeopleLeaves] = useState<PlannerPeopleLeave[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);

  const [showActivityForm, setShowActivityForm] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<PlannerActivity | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | null>(null);
  const [showImporter, setShowImporter] = useState(false);
  const [viewMode, setViewMode] = useState<"calendar" | "gantt">("calendar");
  const [ganttSelected, setGanttSelected] = useState<PlannerActivity | null>(null);
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [drainerSections, setDrainerSections] = useState<{ id: string; name: string }[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsFetchError, setSectionsFetchError] = useState<string | null>(null);
  const [activitiesFetchError, setActivitiesFetchError] = useState<string | null>(null);
  const [showLeaveQr, setShowLeaveQr] = useState(false);

  const pipelineStatsRef = useRef({
    rawCount: 0,
    excludedInvalidDates: 0,
    excludedOther: 0,
  });

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
      setSectionsFetchError(null);
      setSectionsLoading(false);
      return;
    }
    let cancelled = false;
    setSectionsLoading(true);
    setSectionsFetchError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/planner/sections?crew_id=${encodeURIComponent(crewIdForSections)}`
        );
        const body = (await res.json()) as {
          sections?: { id: string; name: string }[];
          error?: string;
        };
        if (!res.ok) throw new Error(body.error || res.statusText);
        if (!cancelled) setDrainerSections(body.sections ?? []);
      } catch (e) {
        if (!cancelled) {
          setSectionsFetchError(e instanceof Error ? e.message : "Failed to load sections");
          setDrainerSections([]);
        }
      } finally {
        if (!cancelled) setSectionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [crewIdForSections]);

  const visibleActivities = useMemo(() => {
    if (!sectionFilter) return activities;
    return activities.filter((a) => a.drainer_section_id === sectionFilter);
  }, [activities, sectionFilter]);

  const visibleLeaves = useMemo(() => {
    if (!sectionFilter || !crewIdForSections) return peopleLeaves;
    return peopleLeaves.filter((l) => l.crew_id === crewIdForSections);
  }, [crewIdForSections, peopleLeaves, sectionFilter]);

  const crewNameForQr = useMemo(() => {
    if (!crewIdForApi) return null;
    return crews.find((c) => c.id === crewIdForApi)?.name ?? null;
  }, [crewIdForApi, crews]);

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
    setActivitiesFetchError(null);
    try {
      const params = new URLSearchParams();
      if (crewIdForApi) params.set("crew_id", crewIdForApi);

      const res = await fetch(`/api/planner/activities?${params}`);
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          body &&
          typeof body === "object" &&
          "error" in body &&
          typeof (body as { error: unknown }).error === "string"
            ? (body as { error: string }).error
            : res.statusText;
        setActivitiesFetchError(msg);
        return;
      }
      if (Array.isArray(body)) {
        const mapped = mapPlannerRowsFromApi(body);
        pipelineStatsRef.current = {
          rawCount: mapped.rawCount,
          excludedInvalidDates: mapped.excludedInvalidDates,
          excludedOther: mapped.excludedOther,
        };
        setActivities(mapped.activities);
      } else {
        pipelineStatsRef.current = { rawCount: 0, excludedInvalidDates: 0, excludedOther: 0 };
        setActivities([]);
      }
    } catch (err) {
      console.error("Failed to fetch activities:", err);
      setActivitiesFetchError(err instanceof Error ? err.message : "Network error");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [crewIdForApi]);

  const fetchLeaves = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (crewIdForApi) params.set("crew_id", crewIdForApi);
      const q = params.toString();
      const res = await fetch(`/api/planner/leaves${q ? `?${q}` : ""}`);
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setPeopleLeaves([]);
        return;
      }
      if (!Array.isArray(body)) {
        setPeopleLeaves([]);
        return;
      }
      const mapped = body
        .map((row) => mapRowToPlannerPeopleLeave(row as Record<string, unknown>))
        .filter((l): l is PlannerPeopleLeave => l != null);
      setPeopleLeaves(mapped);
    } catch {
      setPeopleLeaves([]);
    }
  }, [crewIdForApi]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    void fetchLeaves();
  }, [fetchLeaves]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const p = pipelineStatsRef.current;
    const visibleRange = getPlannerHorizonVisibleRange(horizon, activities);
    console.log("[planner pipeline]", {
      rawRows: p.rawCount,
      mappedValidActivities: activities.length,
      excludedInvalidDates: p.excludedInvalidDates,
      excludedOther: p.excludedOther,
      horizonWeeks: horizon,
      visibleRange,
    });
  }, [activities, horizon]);

  useEffect(() => {
    if (typeof onlyEnabledCrewId === "string") {
      setCrewFilter(onlyEnabledCrewId);
    }
  }, [onlyEnabledCrewId]);

  useEffect(() => {
    if (viewMode !== "gantt") setGanttSelected(null);
  }, [viewMode]);

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
    const raw = (await res.json()) as unknown;
    const saved =
      raw && typeof raw === "object"
        ? mapRowToPlannerActivity(raw as Record<string, unknown>)
        : null;
    if (!saved) {
      await fetchActivities({ silent: true });
      return;
    }
    setActivities((prev) => {
      const rest = prev.filter((a) => a.id !== saved.id);
      return [...rest, saved].sort(
        (a, b) => a.start_date.localeCompare(b.start_date) || a.sort_order - b.sort_order
      );
    });
    await fetchActivities({ silent: true });
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/planner/activities?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: string }).error || res.statusText;
      throw new Error(msg);
    }
    setActivities((prev) => prev.filter((a) => a.id !== id));
    setShowActivityForm(false);
    setSelectedActivity(null);
    setGanttSelected((g) => (g?.id === id ? null : g));
  };

  const handleActivityMove = useCallback(async (payload: UpdateActivityPayload): Promise<boolean> => {
    const res = await fetch("/api/planner/activities", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return false;
    const raw = (await res.json()) as unknown;
    const saved =
      raw && typeof raw === "object"
        ? mapRowToPlannerActivity(raw as Record<string, unknown>)
        : null;
    if (saved) {
      setActivities((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
    } else {
      void fetchActivities({ silent: true });
    }
    return true;
  }, [fetchActivities]);

  const handleActivityClick = (activity: PlannerActivity) => {
    setGanttSelected(activity);
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
                <div className="flex shrink-0 flex-wrap items-center gap-3">
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
                  {viewMode === "gantt" && (
                    <div className="shrink-0 rounded-dashboard-md border border-dashboard-border bg-dashboard-bg p-0.5">
                      <HorizonSelector value={horizon} onChange={setHorizon} />
                    </div>
                  )}
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
                    loading={sectionsLoading}
                    error={sectionsFetchError}
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
                <SettingsDropdown
                  scheduleManifestQuery={
                    crewIdForApi
                      ? new URLSearchParams({ crew_id: crewIdForApi }).toString()
                      : undefined
                  }
                  onPeopleLeaveQr={() => setShowLeaveQr(true)}
                  peopleLeaveQrDisabled={!crewIdForApi}
                />
              </>
            }
          />
        }
      >
        <div className="mx-auto max-w-[1600px] space-y-6">
          {activitiesFetchError && (
            <div
              className="rounded-dashboard-lg border border-dashboard-status-danger/40 bg-dashboard-status-danger/10 px-4 py-3 text-dashboard-sm text-dashboard-status-danger"
              role="alert"
            >
              Could not load activities: {activitiesFetchError}
            </div>
          )}
          <h1 className="text-dashboard-xl font-semibold text-dashboard-text-primary">OnSite Planner</h1>

          {loading && activities.length === 0 ? (
            <LoadingPlaceholder />
          ) : viewMode === "calendar" ? (
            <PlannerCalendar
              activities={visibleActivities}
              crewMap={crewMap}
              horizon={horizon}
              onHorizonChange={setHorizon}
              onActivityClick={handleActivityClick}
              onActivityMove={handleActivityMove}
              onDateSelect={handleDateSelect}
              peopleLeaves={visibleLeaves}
            />
          ) : (
            <PlannerGantt
              activities={visibleActivities}
              crewMap={crewMap}
              horizon={horizon}
              onActivityClick={handleActivityClick}
              peopleLeaves={visibleLeaves}
            />
          )}

          <div className="flex flex-wrap items-center gap-6 text-dashboard-sm text-dashboard-text-secondary">
            {viewMode === "gantt" && ganttSelected && (
              <span className="font-medium text-dashboard-text-primary">
                Selected: {ganttSelected.name}
              </span>
            )}
            <span>{visibleActivities.length} activities</span>
            <span>{visibleActivities.filter((a) => a.status === "in_progress").length} in progress</span>
            <span>{visibleActivities.filter((a) => a.status === "done").length} done</span>
            <span>{visibleActivities.filter((a) => a.status === "blocked").length} blocked</span>
            <span>{visibleLeaves.length} on leave</span>
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

      <PeopleLeaveQrDialog
        open={showLeaveQr}
        onClose={() => setShowLeaveQr(false)}
        crewId={crewIdForApi}
        crewName={crewNameForQr}
      />
    </>
  );
}
