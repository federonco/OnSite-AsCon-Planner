"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CostCategory, PlannerCostCatalogueItem } from "@/lib/planner-types";
import { COST_CATEGORIES } from "@/lib/planner-types";
import { COST_CATEGORY_LABELS } from "@/lib/planner-constants";
import { formatCost } from "@/lib/planner-cost-utils";

type CatFilter = "all" | CostCategory;

const inputClass =
  "w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm text-dashboard-text-primary placeholder:text-dashboard-text-muted focus:outline-none focus:ring-2 focus:ring-[#5B5FEF]/25 focus:border-dashboard-primary";

export interface PlannerCostLibraryModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PlannerCostLibraryModal({ open, onClose }: PlannerCostLibraryModalProps) {
  const [items, setItems] = useState<PlannerCostCatalogueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<CatFilter>("all");


  const [editingId, setEditingId] = useState<string | null>(null);
  const [formCategory, setFormCategory] = useState<CostCategory>("machinery");
  const [formName, setFormName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formUnit, setFormUnit] = useState("");
  const [formRate, setFormRate] = useState("");
  const [formSortOrder, setFormSortOrder] = useState("0");
  const [formActive, setFormActive] = useState(true);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [lastImportBatchId, setLastImportBatchId] = useState<string | null>(null);
  const [revertingImport, setRevertingImport] = useState(false);

  function resetForm() {
    setFormCategory("machinery");
    setFormName("");
    setFormCompany("");
    setFormDescription("");
    setFormUnit("");
    setFormRate("");
    setFormSortOrder("0");
    setFormActive(true);
  }

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/planner/cost-catalogue?include_inactive=true");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || res.statusText);
      setItems(Array.isArray(body) ? body : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load catalogue");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSaveError(null);
      resetForm();
      setEditingId(null);
    }
  }, [open]);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = items.filter((row) => {
      if (catFilter !== "all" && row.category !== catFilter) return false;
      if (!q) return true;
      const cat = COST_CATEGORY_LABELS[row.category].toLowerCase();
      return (
        row.name.toLowerCase().includes(q) ||
        (row.company ?? "").toLowerCase().includes(q) ||
        (row.description ?? "").toLowerCase().includes(q) ||
        ((row.cost_code ?? "") || "").toLowerCase().includes(q) ||
        row.unit.toLowerCase().includes(q) ||
        cat.includes(q)
      );
    });
    rows = [...rows];
    rows.sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
    );
    return rows;
  }, [items, search, catFilter]);

  const beginEdit = (row: PlannerCostCatalogueItem) => {
    setEditingId(row.id);
    setFormCategory(row.category);
    setFormName(row.name);
    setFormCompany(row.company ?? "");
    setFormDescription(row.description ?? "");
    setFormUnit(row.unit);
    setFormRate(String(row.unit_rate));
    setFormSortOrder(String(row.sort_order ?? 0));
    setFormActive(row.is_active);
    setSaveError(null);
  };

  const beginCreate = () => {
    setEditingId(null);
    resetForm();
    setSaveError(null);
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportError(null);
    setImportSummary(null);
    setLastImportBatchId(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/planner/cost-catalogue/import", { method: "POST", body: fd });
      const body: unknown = await res.json().catch(() => ({}));
      const err =
        body && typeof body === "object" && "error" in body && typeof (body as Record<string, unknown>).error === "string"
          ? String((body as Record<string, unknown>).error)
          : null;
      if (!res.ok) throw new Error(err || res.statusText);
      const inserted =
        body && typeof body === "object" && "inserted" in body ? Number((body as Record<string, unknown>).inserted) : 0;
      const updated =
        body && typeof body === "object" && "updated" in body ? Number((body as Record<string, unknown>).updated) : 0;
      const imported =
        body && typeof body === "object" && "imported_count" in body ? Number((body as Record<string, unknown>).imported_count) : 0;
      const importBatchId =
        body && typeof body === "object" && "import_batch_id" in body
          ? String((body as Record<string, unknown>).import_batch_id ?? "").trim()
          : "";
      setLastImportBatchId(importBatchId || null);
      setImportSummary(`Imported ${imported} items (${inserted} inserted, ${updated} updated).`);
      await load();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleRevertImport = async () => {
    if (!lastImportBatchId) return;
    setRevertingImport(true);
    setImportError(null);
    try {
      const res = await fetch("/api/planner/cost-catalogue/import", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ import_batch_id: lastImportBatchId }),
      });
      const body: unknown = await res.json().catch(() => ({}));
      const err =
        body && typeof body === "object" && "error" in body && typeof (body as Record<string, unknown>).error === "string"
          ? String((body as Record<string, unknown>).error)
          : null;
      if (!res.ok) throw new Error(err || res.statusText);
      const reverted =
        body && typeof body === "object" && "reverted" in body
          ? Number((body as Record<string, unknown>).reverted ?? 0)
          : 0;
      setImportSummary(`Import reverted (${reverted} inserted items deactivated).`);
      setLastImportBatchId(null);
      await load();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Could not revert import");
    } finally {
      setRevertingImport(false);
    }
  };

  const submitForm = async () => {
    const name = formName.trim();
    const unit = formUnit.trim();
    const rate = Number(formRate);
    if (!name || !unit || !Number.isFinite(rate)) {
      setSaveError("Name, unit and a numeric unit rate are required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (editingId) {
        const res = await fetch("/api/planner/cost-catalogue", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingId,
            category: formCategory,
            name,
            description: formDescription.trim() || null,
            company: formCompany.trim() || null,
            unit,
            unit_rate: rate,
            sort_order: Number(formSortOrder) || 0,
            is_active: formActive,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error || res.statusText);
      } else {
        const res = await fetch("/api/planner/cost-catalogue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: formCategory,
            name,
            description: formDescription.trim() || null,
            company: formCompany.trim() || null,
            unit,
            unit_rate: rate,
            sort_order: Number(formSortOrder) || 0,
            is_active: formActive,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error || res.statusText);
      }
      await load();
      beginCreate();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: PlannerCostCatalogueItem, next: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/planner/cost-catalogue", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, is_active: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || res.statusText);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1A1D2E]/50 p-2 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cost-library-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[min(100dvh-0.5rem,calc(100svh-0.5rem))] w-full max-w-5xl flex-col overflow-hidden rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface shadow-dashboard-hover">
        <div className="flex shrink-0 items-center justify-between border-b border-dashboard-border px-4 py-3 sm:px-6">
          <div>
            <h2 id="cost-library-title" className="text-dashboard-lg font-semibold text-dashboard-text-primary">
              Resource library
            </h2>
            <p className="text-dashboard-xs text-dashboard-text-muted">
              Master catalogue for machinery, labour, and materials — used when assigning costs to activities.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xl leading-none text-dashboard-text-muted transition-colors hover:text-dashboard-text-primary"
          >
            &times;
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-6">
          {error && (
            <p className="mb-3 rounded-dashboard-md border border-dashboard-status-danger/40 bg-dashboard-status-danger/10 px-3 py-2 text-dashboard-sm text-dashboard-status-danger">
              {error}
            </p>
          )}
          {importError && (
            <p className="mb-3 rounded-dashboard-md border border-dashboard-status-danger/40 bg-dashboard-status-danger/10 px-3 py-2 text-dashboard-sm text-dashboard-status-danger">
              {importError}
            </p>
          )}
          {importSummary && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-dashboard-md border border-dashboard-border bg-dashboard-bg px-3 py-2 text-dashboard-sm text-dashboard-text-secondary">
              <p className="flex-1">{importSummary}</p>
              {lastImportBatchId && (
                <button
                  type="button"
                  onClick={() => void handleRevertImport()}
                  disabled={revertingImport || importing || saving}
                  className="rounded-dashboard-sm bg-dashboard-surface px-2.5 py-1 text-dashboard-xs font-medium text-dashboard-status-danger transition-colors hover:bg-dashboard-border/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {revertingImport ? "Reverting…" : "Revert import"}
                </button>
              )}
            </div>
          )}

          <div className="mb-6 rounded-dashboard-lg border border-dashboard-border bg-dashboard-bg p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-dashboard-sm font-semibold text-dashboard-text-primary">
                {editingId ? "Edit item" : "Create new item"}
              </h3>
              {editingId && (
                <button
                  type="button"
                  onClick={beginCreate}
                  className="text-dashboard-xs font-medium text-[#5B5FEF] hover:underline"
                >
                  Clear · new item
                </button>
              )}
            </div>
            {saveError && (
              <p className="mb-2 text-dashboard-xs text-dashboard-status-danger">{saveError}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as CostCategory)}
                  className={inputClass}
                  disabled={saving}
                >
                  {COST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {COST_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Name *</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={inputClass}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Company</label>
                <input
                  value={formCompany}
                  onChange={(e) => setFormCompany(e.target.value)}
                  placeholder="e.g. CONNECT"
                  className={inputClass}
                  disabled={saving}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Description</label>
                <input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className={inputClass}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Unit *</label>
                <input
                  value={formUnit}
                  onChange={(e) => setFormUnit(e.target.value)}
                  placeholder="e.g. hr, day, m³"
                  className={inputClass}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Unit rate ($) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formRate}
                  onChange={(e) => setFormRate(e.target.value)}
                  className={inputClass}
                  disabled={saving}
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                <label className="flex cursor-pointer items-center gap-2 text-dashboard-sm text-dashboard-text-secondary">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    disabled={saving}
                  />
                  Active (visible when assigning to activities)
                </label>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitForm()}
                className="rounded-dashboard-md bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] px-4 py-2 text-dashboard-sm font-medium text-white shadow-dashboard-card disabled:opacity-50"
              >
                {saving ? "Saving…" : editingId ? "Save changes" : "Create item"}
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-[2] lg:flex-[3]">
              <label className="mb-1 block text-dashboard-xs font-medium text-dashboard-text-secondary">
                Search
              </label>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, description, unit, category…"
                className={inputClass}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", ...COST_CATEGORIES] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCatFilter(c)}
                  className={`rounded-full px-3 py-1.5 text-dashboard-xs font-medium transition-colors ${
                    catFilter === c
                      ? "bg-[#5B5FEF] text-white"
                      : "bg-dashboard-bg text-dashboard-text-secondary hover:bg-dashboard-border/40"
                  }`}
                >
                  {c === "all" ? "All categories" : COST_CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
            <div className="w-full lg:w-auto">
              <label className="mb-1 block text-dashboard-xs font-medium text-dashboard-text-secondary">
                Import catalogue (.xlsx)
              </label>
              <input
                type="file"
                accept=".xlsx"
                disabled={importing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void handleImport(f);
                  e.currentTarget.value = "";
                }}
                className="block w-full max-w-[260px] text-dashboard-xs text-dashboard-text-secondary file:mr-2 file:rounded-dashboard-sm file:border-0 file:bg-dashboard-bg file:px-3 file:py-2 file:text-dashboard-xs file:font-medium file:text-dashboard-text-secondary hover:file:bg-dashboard-border/40"
              />
            </div>
          </div>

          <h3 className="mb-2 text-dashboard-sm font-semibold text-dashboard-text-primary">Catalogue</h3>
          {loading ? (
            <p className="text-dashboard-sm text-dashboard-text-muted">Loading…</p>
          ) : (
            <div className="overflow-x-auto rounded-dashboard-md border border-dashboard-border">
              <table className="min-w-full text-left text-dashboard-xs">
                <thead className="border-b border-dashboard-border bg-dashboard-bg text-dashboard-text-secondary">
                  <tr>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Unit</th>
                    <th className="px-3 py-2 font-medium text-right">Rate</th>
                    <th className="px-3 py-2 font-medium text-right">Order</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-dashboard-text-muted">
                        No items match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredSorted.map((row) => (
                      <tr
                        key={row.id}
                        className={`border-t border-dashboard-border ${
                          editingId === row.id
                            ? "bg-[#5B5FEF]/10"
                            : row.is_active
                              ? "bg-dashboard-surface"
                              : "bg-dashboard-bg/80 opacity-80"
                        }`}
                      >
                        <td className="px-3 py-2">
                          <span
                            className={
                              row.is_active
                                ? "text-dashboard-status-success"
                                : "text-dashboard-text-muted"
                            }
                          >
                            {row.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-dashboard-text-primary">
                          {COST_CATEGORY_LABELS[row.category]}
                        </td>
                        <td className="max-w-[140px] truncate px-3 py-2 font-medium text-dashboard-text-primary">
                          {row.name}
                        </td>
                        <td className="px-3 py-2 text-dashboard-text-muted">{row.company ?? "—"}</td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-dashboard-text-secondary">
                          {row.description ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-dashboard-text-muted">{row.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-dashboard-text-primary">
                          ${formatCost(Number(row.unit_rate))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-dashboard-text-muted">
                          {row.sort_order ?? 0}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => beginEdit(row)}
                              className="rounded-dashboard-sm px-2 py-1 text-dashboard-xs font-medium text-[#5B5FEF] hover:bg-[#5B5FEF]/10"
                            >
                              Edit
                            </button>
                            {row.is_active ? (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void toggleActive(row, false)}
                                className="rounded-dashboard-sm px-2 py-1 text-dashboard-xs font-medium text-dashboard-text-secondary hover:bg-dashboard-border/30"
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void toggleActive(row, true)}
                                className="rounded-dashboard-sm px-2 py-1 text-dashboard-xs font-medium text-dashboard-status-success hover:bg-dashboard-status-success/10"
                              >
                                Reactivate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-dashboard-border px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-dashboard-md bg-dashboard-bg px-4 py-2 text-dashboard-sm font-medium text-dashboard-text-secondary hover:bg-dashboard-border/40"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
