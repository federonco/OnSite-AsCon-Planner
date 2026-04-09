"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { IconButton } from "@/components/ui/IconButton";
import {
  PlannerActivity,
  CreateActivityPayload,
  UpdateActivityPayload,
  PlannerAssignedCostEntry,
  ACTIVITY_STATUSES,
  ActivityStatus,
  type DrainerSectionListItem,
} from "@/lib/planner-types";
import ActivityCostSection from "./ActivityCostSection";

const STATUS_PICKER_OPTIONS = ACTIVITY_STATUSES.filter((s) => s !== "blocked");
import { ACTIVITY_STATUS_COLORS, ACTIVITY_STATUS_LABELS } from "@/lib/planner-constants";
import { countWaWorkingDaysInclusive } from "@/lib/wa-public-holidays";
import { calendarSpanInclusiveDays } from "@/lib/planner-date";
import { differenceInCalendarDays } from "date-fns";

const kebabIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
    <circle cx="12" cy="6" r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="12" cy="18" r="1.75" />
  </svg>
);

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
  /** When true, Escape does not close the activity form (e.g. global planner modal is open). */
  suppressEscapeClose?: boolean;
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
  suppressEscapeClose = false,
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
  const [wbsOptions, setWbsOptions] = useState<Array<{ code: string; label: string | null }>>([]);
  const [wbsLoading, setWbsLoading] = useState(false);
  const [wbsError, setWbsError] = useState<string | null>(null);
  const [wbsKebabOpen, setWbsKebabOpen] = useState(false);
  const [createWbsOpen, setCreateWbsOpen] = useState(false);
  const [newWbsCode, setNewWbsCode] = useState("");
  const [newWbsLabel, setNewWbsLabel] = useState("");
  const [creatingWbs, setCreatingWbs] = useState(false);
  const [createWbsError, setCreateWbsError] = useState<string | null>(null);
  const wbsKebabRef = useRef<HTMLDivElement>(null);
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
  const [sectionListVersion, setSectionListVersion] = useState(0);
  const [sectionKebabOpen, setSectionKebabOpen] = useState(false);
  const [createSectionOpen, setCreateSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionStartCh, setNewSectionStartCh] = useState("");
  const [newSectionEndCh, setNewSectionEndCh] = useState("");
  const [newSectionDirection, setNewSectionDirection] = useState<"onwards" | "backwards">("onwards");
  const [creatingSection, setCreatingSection] = useState(false);
  const [createSectionError, setCreateSectionError] = useState<string | null>(null);
  const sectionKebabRef = useRef<HTMLDivElement>(null);
  const [budgetAmount, setBudgetAmount] = useState(
    () => activity?.budget_amount != null ? String(activity.budget_amount) : ""
  );
  const [draftCostEntries, setDraftCostEntries] = useState<PlannerAssignedCostEntry[]>(() =>
    (activity?.cost_entries ?? []).map((e) => ({
      ...e,
      override_unit_rate: e.override_unit_rate ?? null,
    }))
  );
  const [costsModalOpen, setCostsModalOpen] = useState(false);
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
  }, [crewId, sectionListVersion]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sectionKebabRef.current && !sectionKebabRef.current.contains(e.target as Node)) {
        setSectionKebabOpen(false);
      }
      if (wbsKebabRef.current && !wbsKebabRef.current.contains(e.target as Node)) {
        setWbsKebabOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setWbsLoading(true);
    setWbsError(null);
    (async () => {
      try {
        const res = await fetch("/api/planner/wbs");
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const msg =
            body && typeof body === "object" && "error" in body && typeof (body as Record<string, unknown>).error === "string"
              ? String((body as Record<string, unknown>).error)
              : res.statusText;
          throw new Error(msg);
        }
        const rows = Array.isArray(body) ? body : [];
        const mapped = rows
          .map((r) => ({
            code: String((r as Record<string, unknown>)?.code ?? "").trim(),
            label:
              (r as Record<string, unknown>)?.label != null && String((r as Record<string, unknown>).label).trim() !== ""
                ? String((r as Record<string, unknown>).label).trim()
                : null,
          }))
          .filter((r) => r.code);
        if (!cancelled) setWbsOptions(mapped);
      } catch (e) {
        if (!cancelled) {
          setWbsOptions([]);
          setWbsError(e instanceof Error ? e.message : "Could not load WBS list");
        }
      } finally {
        if (!cancelled) setWbsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateWbs = async () => {
    const code = newWbsCode.trim();
    if (!code) return;
    setCreatingWbs(true);
    setCreateWbsError(null);
    try {
      const res = await fetch("/api/planner/wbs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          label: newWbsLabel.trim() || null,
          sort_order: wbsOptions.length,
        }),
      });
      const body: unknown = await res.json().catch(() => ({}));
      const err =
        body && typeof body === "object" && "error" in body && typeof (body as Record<string, unknown>).error === "string"
          ? String((body as Record<string, unknown>).error)
          : null;
      if (!res.ok) throw new Error(err || res.statusText);
      const createdCode =
        body && typeof body === "object" && "code" in body
          ? String((body as Record<string, unknown>).code ?? code).trim()
          : code;
      setWbsCode(createdCode);
      // refresh list lightly
      setWbsOptions((prev) => {
        const next = prev.filter((p) => p.code !== createdCode);
        const label =
          body && typeof body === "object" && "label" in body
            ? (body as Record<string, unknown>).label != null ? String((body as Record<string, unknown>).label) : null
            : null;
        next.push({ code: createdCode, label: label && label.trim() ? label.trim() : null });
        next.sort((a, b) => a.code.localeCompare(b.code));
        return next;
      });
      setCreateWbsOpen(false);
      setWbsKebabOpen(false);
      setNewWbsCode("");
      setNewWbsLabel("");
    } catch (e) {
      setCreateWbsError(e instanceof Error ? e.message : "Could not create WBS");
    } finally {
      setCreatingWbs(false);
    }
  };

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

  const durationDaysForCosts = useMemo(() => {
    if (!startDate || !endDate) return 1;
    return calendarSpanInclusiveDays(startDate, endDate);
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
      if (e.key !== "Escape") return;
      if (suppressEscapeClose) return;
      if (costsModalOpen) {
        setCostsModalOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, costsModalOpen, suppressEscapeClose]);

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

  const handleCreateSection = async () => {
    const trimmed = newSectionName.trim();
    if (!crewId || !trimmed) return;
    setCreatingSection(true);
    setCreateSectionError(null);
    try {
      const res = await fetch("/api/planner/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crew_id: crewId,
          name: trimmed,
          start_ch: newSectionStartCh.trim() ? Number(newSectionStartCh) : null,
          end_ch: newSectionEndCh.trim() ? Number(newSectionEndCh) : null,
          direction: newSectionDirection || null,
        }),
      });
      const body = (await res.json()) as { section?: DrainerSectionListItem; error?: string };
      if (!res.ok) throw new Error(body.error || res.statusText);
      const created = body.section;
      if (!created?.id) throw new Error("Invalid response");
      setDrainerSectionId(created.id);
      setSectionListVersion((v) => v + 1);
      setCreateSectionOpen(false);
      setNewSectionName("");
      setNewSectionStartCh("");
      setNewSectionEndCh("");
      setNewSectionDirection("onwards");
      setSectionKebabOpen(false);
    } catch (e) {
      setCreateSectionError(e instanceof Error ? e.message : "Could not create section");
    } finally {
      setCreatingSection(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !crewId || !startDate || !endDate) return;
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
        const parsedBudget = Number(budgetAmount);
        const payload: UpdateActivityPayload = {
          id: activity!.id,
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          status,
          progress_percent: Math.min(100, Math.max(0, Math.round(progressPercent))),
          notes: notes.trim() || null,
          wbs_code: wbsCode.trim() || null,
          drainer_section_id: drainerSectionId.trim() || null,
          predecessor_id: linkMode === "none" ? null : predecessorId || null,
          dependency_type: depType,
          dependency_lag_days: depType ? depLag : null,
          budget_amount: budgetAmount.trim() !== "" && Number.isFinite(parsedBudget) ? parsedBudget : null,
          cost_entries: draftCostEntries,
        };
        await onSave(payload);
      } else {
        const depType =
          linkMode === "none" ? null : linkMode === "after" ? "FS" : "SS";
        const depLag = linkMode === "start_after_start" ? Math.max(0, Math.round(linkLagDays)) : 0;
        const parsedBudgetCreate = Number(budgetAmount);
        const payload: CreateActivityPayload = {
          crew_id: crewId,
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          status,
          progress_percent: Math.min(100, Math.max(0, Math.round(progressPercent))),
          notes: notes.trim() || null,
          wbs_code: wbsCode.trim() || null,
          drainer_section_id: drainerSectionId.trim() || null,
          predecessor_id: linkMode === "none" ? null : predecessorId || null,
          dependency_type: depType,
          dependency_lag_days: depType ? depLag : null,
          budget_amount: budgetAmount.trim() !== "" && Number.isFinite(parsedBudgetCreate) ? parsedBudgetCreate : null,
          cost_entries: draftCostEntries,
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1D2E]/40 p-3 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-form-title"
    >
      <div className="flex max-h-[min(100dvh-1.5rem,calc(100svh-1.5rem))] min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface shadow-dashboard-hover">
        <div className="flex shrink-0 items-center justify-between border-b border-dashboard-border px-4 py-3 sm:px-6 sm:py-4">
          <h2
            id="activity-form-title"
            className="text-dashboard-lg font-semibold text-dashboard-text-primary"
          >
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

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-6">
            <div className="space-y-4">
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
              <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">WBS</label>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={wbsCode}
                    onChange={(e) => setWbsCode(e.target.value)}
                    placeholder={wbsLoading ? "Loading WBS…" : "e.g. 1.2.3"}
                    className={inputClass}
                    list="planner-wbs-options"
                    disabled={wbsLoading}
                  />
                  <datalist id="planner-wbs-options">
                    {wbsOptions.map((w) => (
                      <option
                        key={w.code}
                        value={w.code}
                        label={w.label ? `${w.code} — ${w.label}` : w.code}
                      />
                    ))}
                  </datalist>
                  {wbsError && (
                    <p className="mt-1 text-dashboard-xs text-dashboard-status-danger">{wbsError}</p>
                  )}
                </div>
                <div className="relative shrink-0 self-center" ref={wbsKebabRef}>
                  <IconButton
                    label="WBS options"
                    type="button"
                    disabled={wbsLoading}
                    onClick={() => {
                      setWbsKebabOpen((o) => !o);
                      setCreateWbsOpen(false);
                    }}
                  >
                    {kebabIcon}
                  </IconButton>
                  {wbsKebabOpen && (
                    <div
                      className="absolute right-0 top-full z-[60] mt-1 min-w-[200px] rounded-dashboard-md border border-dashboard-border bg-dashboard-surface py-1 shadow-dashboard-card"
                      role="menu"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full px-3 py-2 text-left text-dashboard-sm text-dashboard-text-primary transition-colors hover:bg-dashboard-bg"
                        onClick={() => {
                          setWbsKebabOpen(false);
                          setCreateWbsOpen(true);
                          setCreateWbsError(null);
                          setNewWbsCode("");
                          setNewWbsLabel("");
                        }}
                      >
                        Create new WBS
                      </button>
                      {wbsCode.trim() && (
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full px-3 py-2 text-left text-dashboard-sm text-dashboard-text-secondary transition-colors hover:bg-dashboard-bg"
                          onClick={() => {
                            setWbsCode("");
                            setWbsKebabOpen(false);
                          }}
                        >
                          Clear WBS
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {createWbsOpen && (
                <div className="mt-3 space-y-3 rounded-dashboard-md border border-dashboard-border bg-dashboard-bg p-3">
                  <p className="text-dashboard-sm font-semibold text-dashboard-text-primary">Create WBS</p>
                  {createWbsError && (
                    <p className="text-dashboard-xs text-dashboard-status-danger" role="alert">
                      {createWbsError}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-dashboard-xs font-medium text-dashboard-text-secondary">
                        Code *
                      </label>
                      <input
                        type="text"
                        value={newWbsCode}
                        onChange={(e) => setNewWbsCode(e.target.value)}
                        placeholder="e.g. 1.2.3"
                        className={inputClass}
                        disabled={creatingWbs}
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-dashboard-xs font-medium text-dashboard-text-secondary">
                        Label
                      </label>
                      <input
                        type="text"
                        value={newWbsLabel}
                        onChange={(e) => setNewWbsLabel(e.target.value)}
                        placeholder="Short description"
                        className={inputClass}
                        disabled={creatingWbs}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={creatingWbs || !newWbsCode.trim()}
                      onClick={() => void handleCreateWbs()}
                      className="rounded-dashboard-sm bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] px-3 py-1.5 text-dashboard-sm font-medium text-white shadow-dashboard-card disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creatingWbs ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={creatingWbs}
                      onClick={() => {
                        setCreateWbsOpen(false);
                        setNewWbsCode("");
                        setNewWbsLabel("");
                        setCreateWbsError(null);
                      }}
                      className="rounded-dashboard-sm bg-dashboard-surface px-3 py-1.5 text-dashboard-sm font-medium text-dashboard-text-secondary hover:bg-dashboard-border/30"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {crewId && (
            <div>
              <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">
                Section (optional)
              </label>
              <div className="flex gap-2">
                <select
                  value={drainerSectionId}
                  onChange={(e) => setDrainerSectionId(e.target.value)}
                  className={`${inputClass} min-w-0 flex-1`}
                  disabled={sectionsLoading || !!sectionsError}
                >
                  <option value="">
                    {sectionsLoading ? "Loading sections…" : sectionsError ? "— Unavailable —" : "No section"}
                  </option>
                  {sectionOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="relative shrink-0 self-center" ref={sectionKebabRef}>
                  <IconButton
                    label="Section options"
                    type="button"
                    disabled={sectionsLoading || !!sectionsError}
                    onClick={() => {
                      setSectionKebabOpen((o) => !o);
                      setCreateSectionOpen(false);
                    }}
                  >
                    {kebabIcon}
                  </IconButton>
                  {sectionKebabOpen && (
                    <div
                      className="absolute right-0 top-full z-[60] mt-1 min-w-[200px] rounded-dashboard-md border border-dashboard-border bg-dashboard-surface py-1 shadow-dashboard-card"
                      role="menu"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full px-3 py-2 text-left text-dashboard-sm text-dashboard-text-primary transition-colors hover:bg-dashboard-bg"
                        onClick={() => {
                          setSectionKebabOpen(false);
                          setCreateSectionOpen(true);
                          setCreateSectionError(null);
                          setNewSectionName("");
                          setNewSectionStartCh("");
                          setNewSectionEndCh("");
                          setNewSectionDirection("onwards");
                        }}
                      >
                        Create section
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {createSectionOpen && (
                <div className="mt-3 space-y-3 rounded-dashboard-md border border-dashboard-border bg-dashboard-bg p-3">
                  <p className="text-dashboard-sm font-semibold text-dashboard-text-primary">Create section</p>
                  {createSectionError && (
                    <p className="text-dashboard-xs text-dashboard-status-danger" role="alert">
                      {createSectionError}
                    </p>
                  )}
                  <div>
                    <label className="mb-1 block text-dashboard-xs font-medium text-dashboard-text-secondary">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      placeholder="Section name"
                      className={inputClass}
                      disabled={creatingSection}
                      autoComplete="off"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-dashboard-xs font-medium text-dashboard-text-secondary">
                        Start CH
                      </label>
                      <input
                        type="number"
                        value={newSectionStartCh}
                        onChange={(e) => setNewSectionStartCh(e.target.value)}
                        className={inputClass}
                        disabled={creatingSection}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-dashboard-xs font-medium text-dashboard-text-secondary">
                        End CH
                      </label>
                      <input
                        type="number"
                        value={newSectionEndCh}
                        onChange={(e) => setNewSectionEndCh(e.target.value)}
                        className={inputClass}
                        disabled={creatingSection}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-dashboard-xs font-medium text-dashboard-text-secondary">
                      Direction
                    </label>
                    <select
                      value={newSectionDirection}
                      onChange={(e) =>
                        setNewSectionDirection(e.target.value as "onwards" | "backwards")
                      }
                      className={inputClass}
                      disabled={creatingSection}
                    >
                      <option value="onwards">Onwards</option>
                      <option value="backwards">Backwards</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={creatingSection || !newSectionName.trim()}
                      onClick={() => void handleCreateSection()}
                      className="rounded-dashboard-sm bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] px-3 py-1.5 text-dashboard-sm font-medium text-white shadow-dashboard-card disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creatingSection ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={creatingSection}
                      onClick={() => {
                        setCreateSectionOpen(false);
                        setNewSectionName("");
                        setNewSectionStartCh("");
                        setNewSectionEndCh("");
                        setNewSectionDirection("onwards");
                        setCreateSectionError(null);
                      }}
                      className="rounded-dashboard-sm bg-dashboard-surface px-3 py-1.5 text-dashboard-sm font-medium text-dashboard-text-secondary hover:bg-dashboard-border/30"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {sectionsError && (
                <p className="mt-1 text-dashboard-xs text-dashboard-status-danger">{sectionsError}</p>
              )}
              {!sectionsLoading && !sectionsError && sectionOptions.length === 0 && !createSectionOpen && (
                <p className="mt-1 text-dashboard-xs text-dashboard-text-muted">
                  No sections for this crew. Use the menu to create one, or add a section in the main app.
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

          <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-bg p-3">
            <ActivityCostSection
              activityId={activity?.id ?? null}
              activityTitle={name.trim() || (isEditing ? "Activity" : "New activity")}
              budgetAmount={budgetAmount}
              progressPercent={progressPercent}
              durationDays={durationDaysForCosts}
              defaultCostDate={startDate || new Date().toISOString().slice(0, 10)}
              costsOpen={costsModalOpen}
              onCostsOpenChange={setCostsModalOpen}
              onBudgetChange={setBudgetAmount}
              draftEntries={draftCostEntries}
              onDraftEntriesChange={setDraftCostEntries}
              inputClass={inputClass}
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
            </div>
          </div>

          <div className="shrink-0 border-t border-dashboard-border bg-dashboard-surface px-4 py-3 sm:px-6">
            <div className="flex flex-wrap gap-3">
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
              className="min-w-[120px] flex-1 rounded-dashboard-md bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] py-2.5 text-dashboard-sm font-medium text-white shadow-dashboard-card transition-[filter,opacity] hover:brightness-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
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
          </div>
        </form>
      </div>
    </div>
  );
}
