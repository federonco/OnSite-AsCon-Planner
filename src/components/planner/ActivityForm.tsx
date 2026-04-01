"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  PlannerActivity,
  CreateActivityPayload,
  UpdateActivityPayload,
  ACTIVITY_STATUSES,
  ActivityStatus,
  type DrainerSectionListItem,
} from "@/lib/planner-types";

const STATUS_PICKER_OPTIONS = ACTIVITY_STATUSES.filter((s) => s !== "blocked");
import { ACTIVITY_STATUS_COLORS, ACTIVITY_STATUS_LABELS } from "@/lib/planner-constants";
import { countWaWorkingDaysInclusive } from "@/lib/wa-public-holidays";
import { differenceInCalendarDays } from "date-fns";

interface Crew {
  id: string;
  name: string;
}

interface ActivityFormProps {
  activity: PlannerActivity | null;
  activities: PlannerActivity[];
  crews: Crew[];
  defaultCrewId?: string | null;
  defaultDate?: string | null;
  /** Prefill section (e.g. from planner section filter) */
  defaultSectionId?: string | null;
  onSave: (payload: CreateActivityPayload | UpdateActivityPayload) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
}

export default function ActivityForm({
  activity,
  activities,
  crews,
  defaultCrewId,
  defaultDate,
  defaultSectionId,
  onSave,
  onDelete,
  onClose,
}: ActivityFormProps) {
  const isEditing = !!activity;

  const [name, setName] = useState(activity?.name || "");
  const [crewId, setCrewId] = useState(activity?.crew_id || defaultCrewId || crews[0]?.id || "");
  const [startDate, setStartDate] = useState(activity?.start_date || defaultDate || "");
  const [endDate, setEndDate] = useState(activity?.end_date || defaultDate || "");
  const [status, setStatus] = useState<ActivityStatus>(activity?.status || "planned");
  const [progressPercent, setProgressPercent] = useState(() =>
    Math.min(100, Math.max(0, Math.round(activity?.progress_percent ?? 0)))
  );
  const [notes, setNotes] = useState(activity?.notes || "");
  const [wbsCode, setWbsCode] = useState(activity?.wbs_code || "");
  const [drainerSectionId, setDrainerSectionId] = useState(
    () => activity?.drainer_section_id ?? defaultSectionId ?? ""
  );
  const [predecessorId, setPredecessorId] = useState(activity?.predecessor_id ?? "");
  const [linkMode, setLinkMode] = useState<"none" | "after" | "parallel" | "start_after_start">(() => {
    if (!activity?.dependency_type || !activity.predecessor_id) return "none";
    if (activity.dependency_type === "FS") return "after";
    if ((activity.dependency_lag_days ?? 0) > 0) return "start_after_start";
    return "parallel";
  });
  const [linkLagDays, setLinkLagDays] = useState(Math.max(0, activity?.dependency_lag_days ?? 1));
  const [sectionOptions, setSectionOptions] = useState<DrainerSectionListItem[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!crewId) {
      setSectionOptions([]);
      setSectionsError(null);
      setSectionsLoading(false);
      return;
    }
    let cancelled = false;
    setSectionsLoading(true);
    setSectionsError(null);
    (async () => {
      try {
        const res = await fetch(`/api/planner/sections?crew_id=${encodeURIComponent(crewId)}`);
        const body = (await res.json()) as { sections?: DrainerSectionListItem[]; error?: string };
        if (!res.ok) throw new Error(body.error || res.statusText);
        if (!cancelled) {
          setSectionOptions(body.sections ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setSectionsError(e instanceof Error ? e.message : "Could not load sections");
          setSectionOptions([]);
        }
      } finally {
        if (!cancelled) setSectionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [crewId]);

  const prevCrewRef = useRef<string | null>(null);
  useEffect(() => {
    if (isEditing) return;
    if (prevCrewRef.current === null) {
      prevCrewRef.current = crewId;
      return;
    }
    if (prevCrewRef.current !== crewId) {
      prevCrewRef.current = crewId;
      setDrainerSectionId("");
    }
  }, [crewId, isEditing]);

  const daySpanSummary = useMemo(() => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate + "T12:00:00");
    const end = new Date(endDate + "T12:00:00");
    if (end < start) return null;
    const calendarDays = differenceInCalendarDays(end, start) + 1;
    const waWorking = countWaWorkingDaysInclusive(startDate, endDate);
    return { calendarDays, waWorking };
  }, [startDate, endDate]);

  const predecessorOptions = useMemo(
    () =>
      activities
        .filter((a) => a.id !== activity?.id)
        .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name)),
    [activities, activity?.id]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleDeleteClick = async () => {
    if (!activity || !onDelete) return;
    setDeleting(true);
    setSaveError(null);
    try {
      await onDelete(activity.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !crewId || !startDate || !endDate) return;
    if (!drainerSectionId.trim()) {
      setSaveError("Section is required.");
      return;
    }
    if (linkMode !== "none" && !predecessorId) {
      setSaveError("Select a predecessor task for the selected link mode.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      if (isEditing) {
        const depType =
          linkMode === "none" ? null : linkMode === "after" ? "FS" : "SS";
        const depLag = linkMode === "start_after_start" ? Math.max(0, Math.round(linkLagDays)) : 0;
        const payload: UpdateActivityPayload = {
          id: activity!.id,
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          status,
          progress_percent: Math.min(100, Math.max(0, Math.round(progressPercent))),
          notes: notes.trim() || null,
          wbs_code: wbsCode.trim() || null,
          drainer_section_id: drainerSectionId.trim(),
          predecessor_id: linkMode === "none" ? null : predecessorId || null,
          dependency_type: depType,
          dependency_lag_days: depType ? depLag : null,
        };
        await onSave(payload);
      } else {
        const depType =
          linkMode === "none" ? null : linkMode === "after" ? "FS" : "SS";
        const depLag = linkMode === "start_after_start" ? Math.max(0, Math.round(linkLagDays)) : 0;
        const payload: CreateActivityPayload = {
          crew_id: crewId,
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          status,
          progress_percent: Math.min(100, Math.max(0, Math.round(progressPercent))),
          notes: notes.trim() || null,
          wbs_code: wbsCode.trim() || null,
          drainer_section_id: drainerSectionId.trim(),
          predecessor_id: linkMode === "none" ? null : predecessorId || null,
          dependency_type: depType,
          dependency_lag_days: depType ? depLag : null,
        };
        await onSave(payload);
      }
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm text-dashboard-text-primary placeholder:text-dashboard-text-muted focus:outline-none focus:ring-2 focus:ring-[#5B5FEF]/25 focus:border-dashboard-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1D2E]/40 backdrop-blur-[2px]">
      <div className="mx-4 w-full max-w-lg rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface shadow-dashboard-hover">
        <div className="flex items-center justify-between border-b border-dashboard-border px-6 py-4">
          <h2 className="text-dashboard-lg font-semibold text-dashboard-text-primary">
            {isEditing ? "Edit Activity" : "New Activity"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-dashboard-text-muted transition-colors hover:text-dashboard-text-primary text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {saveError && (
            <div
              className="rounded-dashboard-md border border-dashboard-status-danger/40 bg-dashboard-status-danger/10 px-3 py-2 text-dashboard-sm text-dashboard-status-danger"
              role="alert"
            >
              {saveError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">Crew *</label>
              <select
                value={crewId}
                onChange={(e) => setCrewId(e.target.value)}
                className={inputClass}
                disabled={isEditing}
              >
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">WBS Code</label>
              <input
                type="text"
                value={wbsCode}
                onChange={(e) => setWbsCode(e.target.value)}
                placeholder="e.g. 1.2.3"
                className={inputClass}
              />
            </div>
          </div>

          {crewId && (
            <div>
              <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">
                Section *
              </label>
              <select
                value={drainerSectionId}
                onChange={(e) => setDrainerSectionId(e.target.value)}
                className={inputClass}
                required
                disabled={sectionsLoading || !!sectionsError}
              >
                <option value="">
                  {sectionsLoading ? "Loading sections…" : sectionsError ? "— Unavailable —" : "Select section…"}
                </option>
                {sectionOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {sectionsError && (
                <p className="mt-1 text-dashboard-xs text-dashboard-status-danger">{sectionsError}</p>
              )}
              {!sectionsLoading && !sectionsError && sectionOptions.length === 0 && (
                <p className="mt-1 text-dashboard-xs text-dashboard-text-muted">
                  No sections for this crew. Add a section in the main app before creating activities.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">Start Date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">End Date *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className={inputClass}
                required
              />
            </div>
          </div>

          {daySpanSummary && (
            <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-bg px-3 py-2 text-dashboard-sm text-dashboard-text-secondary">
              <span className="text-dashboard-text-muted">Span: </span>
              {daySpanSummary.calendarDays} calendar day
              {daySpanSummary.calendarDays !== 1 ? "s" : ""}
              <span className="mx-1.5 text-dashboard-text-muted">·</span>
              <span className="font-medium text-dashboard-status-warning">{daySpanSummary.waWorking} WA working day</span>
              {daySpanSummary.waWorking !== 1 ? "s" : ""}
              <span className="text-dashboard-text-muted"> (Mon–Fri excl. public holidays)</span>
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-dashboard-sm text-dashboard-text-secondary">Progress</label>
              <span className="text-dashboard-sm font-medium tabular-nums text-dashboard-text-primary">
                {progressPercent}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={progressPercent}
              onChange={(e) => setProgressPercent(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-dashboard-border accent-[#5B5FEF]"
            />
            <p className="mt-1 text-dashboard-xs text-dashboard-text-muted">
              Shown on the Gantt bar; you can also drag the bar handle in Gantt view.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">Status</label>
            {status === "blocked" && (
              <p className="mb-2 text-dashboard-xs text-dashboard-text-muted">
                Currently <span className="font-medium text-dashboard-status-danger">blocked</span>. Choose a status below to update.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {STATUS_PICKER_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`rounded-dashboard-sm px-3 py-1.5 text-dashboard-sm font-medium transition-colors ${
                    status === s ? "text-white shadow-dashboard-card" : "bg-dashboard-bg text-dashboard-text-muted hover:bg-white hover:text-dashboard-text-secondary"
                  }`}
                  style={status === s ? { backgroundColor: ACTIVITY_STATUS_COLORS[s] } : undefined}
                >
                  {ACTIVITY_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-dashboard-md border border-dashboard-border bg-dashboard-bg p-3">
            <p className="text-dashboard-xs font-medium text-dashboard-text-secondary">Task link (Calendar + Gantt)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">Link mode</label>
                <select
                  value={linkMode}
                  onChange={(e) => setLinkMode(e.target.value as "none" | "after" | "parallel" | "start_after_start")}
                  className={inputClass}
                >
                  <option value="none">No link</option>
                  <option value="after">Start after predecessor ends</option>
                  <option value="parallel">Start in parallel</option>
                  <option value="start_after_start">Start X days after predecessor starts</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">Predecessor</label>
                <select
                  value={predecessorId}
                  onChange={(e) => setPredecessorId(e.target.value)}
                  disabled={linkMode === "none"}
                  className={inputClass}
                >
                  <option value="">Select task…</option>
                  {predecessorOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.start_date})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {linkMode === "start_after_start" && (
              <div className="max-w-[160px]">
                <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">X days</label>
                <input
                  type="number"
                  min={0}
                  value={linkLagDays}
                  onChange={(e) => setLinkLagDays(Number(e.target.value) || 0)}
                  className={inputClass}
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={
                saving ||
                deleting ||
                !name.trim() ||
                !startDate ||
                !endDate ||
                !drainerSectionId.trim()
              }
              className="flex-1 rounded-dashboard-md bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] py-2.5 text-dashboard-sm font-medium text-white shadow-dashboard-card transition-[filter,opacity] hover:brightness-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : isEditing ? "Update" : "Create"}
            </button>
            {isEditing && onDelete && (
              <button
                type="button"
                disabled={saving || deleting}
                onClick={() => void handleDeleteClick()}
                className="rounded-dashboard-md bg-dashboard-status-danger/10 px-4 py-2.5 text-dashboard-sm font-medium text-dashboard-status-danger transition-colors hover:bg-dashboard-status-danger/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-dashboard-md bg-dashboard-bg px-4 py-2.5 text-dashboard-sm font-medium text-dashboard-text-secondary transition-colors hover:bg-dashboard-border/50 hover:text-dashboard-text-primary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
