"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CostCategory,
  CostRecord,
  PlannerAssignedCostEntry,
  PlannerCostCatalogueItem,
} from "@/lib/planner-types";
import { COST_CATEGORIES } from "@/lib/planner-types";
import { COST_CATEGORY_LABELS, COST_CATEGORY_COLORS } from "@/lib/planner-constants";
import {
  computeActivityCostSummary,
  computeCostLineAmount,
  effectiveCostUnitRate,
  formatCost,
  isTimeBasedCostUnit,
  suggestedQuantityFromDuration,
} from "@/lib/planner-cost-utils";

type FilterTab = "all" | CostCategory;

function toAssigned(e: CostRecord): PlannerAssignedCostEntry {
  return {
    id: e.id,
    catalogue_item_id: e.catalogue_item_id ?? null,
    category: e.category,
    name: e.name,
    unit: e.unit,
    unit_rate: e.unit_rate,
    override_unit_rate: e.override_unit_rate ?? null,
    quantity: e.quantity,
    amount: e.amount,
    cost_date: e.cost_date,
    description: e.description,
    created_at: e.created_at,
  };
}

export interface ActivityCostsModalProps {
  open: boolean;
  onClose: () => void;
  activityId: string | null;
  activityTitle: string;
  budgetAmount: string;
  progressPercent: number;
  durationDays: number;
  defaultCostDate: string;
  draftEntries?: PlannerAssignedCostEntry[];
  onDraftEntriesChange?: (entries: PlannerAssignedCostEntry[]) => void;
  inputClass: string;
}

export default function ActivityCostsModal({
  open,
  onClose,
  activityId,
  activityTitle,
  budgetAmount,
  progressPercent,
  durationDays,
  defaultCostDate,
  draftEntries,
  onDraftEntriesChange,
  inputClass,
}: ActivityCostsModalProps) {
  const isPersisted = !!activityId;

  const [costRecords, setCostRecords] = useState<CostRecord[]>([]);
  const [catalogue, setCatalogue] = useState<PlannerCostCatalogueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCatalogue, setLoadingCatalogue] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [selectedCatalogueId, setSelectedCatalogueId] = useState<string | null>(null);
  const [newQuantity, setNewQuantity] = useState("1");
  const [newOverrideRate, setNewOverrideRate] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [useDurationQty, setUseDurationQty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const applyRecords = useCallback(
    (rows: CostRecord[]) => {
      setCostRecords(rows);
      if (!isPersisted && onDraftEntriesChange) {
        onDraftEntriesChange(rows.map(toAssigned));
      }
    },
    [isPersisted, onDraftEntriesChange]
  );

  useEffect(() => {
    if (!open || activityId) return;
    applyRecords(
      (draftEntries ?? []).map((e) => ({
        ...e,
        activity_id: "__draft__",
        override_unit_rate: e.override_unit_rate ?? null,
      }))
    );
  }, [open, activityId, draftEntries, applyRecords]);

  useEffect(() => {
    if (!open || !activityId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/planner/costs?activity_id=${encodeURIComponent(activityId)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error || res.statusText);
        }
        const data = (await res.json()) as CostRecord[];
        if (!cancelled) applyRecords(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load costs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, activityId, applyRecords]);

  const fetchCatalogue = useCallback(async () => {
    if (!open) return;
    setLoadingCatalogue(true);
    try {
      const res = await fetch("/api/planner/cost-catalogue");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || res.statusText);
      }
      const data = (await res.json()) as PlannerCostCatalogueItem[];
      setCatalogue(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load catalogue");
    } finally {
      setLoadingCatalogue(false);
    }
  }, [open]);

  useEffect(() => {
    void fetchCatalogue();
  }, [fetchCatalogue]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSaveError(null);
      setSelectedCatalogueId(null);
      setUseDurationQty(false);
    }
  }, [open]);

  const budgetNum = Number(budgetAmount) || 0;
  const summary = computeActivityCostSummary(
    budgetAmount.trim() !== "" ? budgetNum : null,
    costRecords,
    progressPercent
  );

  const filteredCatalogue = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalogue
      .filter((c) => c.is_active)
      .filter((c) => (filterTab === "all" ? true : c.category === filterTab))
      .filter((c) => {
        if (!q) return true;
        const catLabel = COST_CATEGORY_LABELS[c.category].toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.description ?? "").toLowerCase().includes(q) ||
          catLabel.includes(q) ||
          c.unit.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }, [catalogue, search, filterTab]);

  const selectedItem = useMemo(
    () => filteredCatalogue.find((c) => c.id === selectedCatalogueId) ?? null,
    [filteredCatalogue, selectedCatalogueId]
  );

  const canSuggestDuration =
    selectedItem &&
    (selectedItem.category === "labour" || selectedItem.category === "machinery") &&
    isTimeBasedCostUnit(selectedItem.unit);

  useEffect(() => {
    if (!selectedItem || !canSuggestDuration || !useDurationQty) return;
    const s = suggestedQuantityFromDuration(selectedItem.unit, durationDays);
    if (s != null) setNewQuantity(String(s));
  }, [selectedItem, canSuggestDuration, useDurationQty, durationDays]);

  const handleAdd = async () => {
    if (!selectedItem) return;
    const qty = Number(newQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setSaveError("Quantity must be greater than 0");
      return;
    }
    const baseRate = Number(selectedItem.unit_rate);
    const override =
      newOverrideRate.trim() !== "" && Number.isFinite(Number(newOverrideRate))
        ? Number(newOverrideRate)
        : null;
    const amount = computeCostLineAmount(qty, baseRate, override);

    setSaving(true);
    setSaveError(null);
    try {
      if (!isPersisted) {
        const draft: CostRecord = {
          id:
            typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
              ? globalThis.crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          activity_id: "__draft__",
          catalogue_item_id: selectedItem.id,
          name: selectedItem.name,
          unit: selectedItem.unit,
          unit_rate: baseRate,
          override_unit_rate: override,
          quantity: qty,
          amount,
          cost_date: defaultCostDate,
          category: selectedItem.category,
          description: newNotes.trim() || null,
          created_at: new Date().toISOString(),
        };
        applyRecords([draft, ...costRecords]);
      } else {
        const res = await fetch("/api/planner/costs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activity_id: activityId,
            catalogue_item_id: selectedItem.id,
            category: selectedItem.category,
            name: selectedItem.name,
            unit: selectedItem.unit,
            unit_rate: baseRate,
            override_unit_rate: override,
            quantity: qty,
            cost_date: defaultCostDate,
            description: newNotes.trim() || null,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error || res.statusText);
        }
        const created = (await res.json()) as CostRecord;
        applyRecords([created, ...costRecords]);
      }
      setNewNotes("");
      setNewOverrideRate("");
      setNewQuantity("1");
      setUseDurationQty(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save cost");
    } finally {
      setSaving(false);
    }
  };

  const patchRowLocal = (row: CostRecord, patch: Partial<CostRecord>): CostRecord => {
    const next = { ...row, ...patch };
    next.amount = computeCostLineAmount(next.quantity, next.unit_rate, next.override_unit_rate);
    return next;
  };

  const persistRow = async (row: CostRecord, next: CostRecord) => {
    if (!isPersisted) {
      applyRecords(costRecords.map((r) => (r.id === row.id ? next : r)));
      return;
    }
    const res = await fetch("/api/planner/costs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        activity_id: activityId,
        quantity: next.quantity,
        unit_rate: next.unit_rate,
        override_unit_rate: next.override_unit_rate,
        description: next.description,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || res.statusText);
    }
    const updated = (await res.json()) as CostRecord;
    applyRecords(costRecords.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleDelete = async (id: string) => {
    if (!isPersisted) {
      applyRecords(costRecords.filter((r) => r.id !== id));
      return;
    }
    if (!activityId) return;
    try {
      const res = await fetch(
        `/api/planner/costs?id=${encodeURIComponent(id)}&activity_id=${encodeURIComponent(activityId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || res.statusText);
      }
      applyRecords(costRecords.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  };

  const sortedRows = useMemo(() => {
    const order: CostCategory[] = ["machinery", "labour", "materials"];
    return [...costRecords].sort(
      (a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.name.localeCompare(b.name)
    );
  }, [costRecords]);

  const categorySubtotal = (cat: CostCategory) =>
    costRecords.filter((r) => r.category === cat).reduce((s, r) => s + r.amount, 0);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1A1D2E]/50 p-2 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-costs-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[min(100dvh-0.5rem,calc(100svh-0.5rem))] w-full max-w-4xl flex-col overflow-hidden rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface shadow-dashboard-hover">
        <div className="flex shrink-0 items-center justify-between border-b border-dashboard-border px-4 py-3 sm:px-5">
          <div>
            <h2 id="activity-costs-title" className="text-dashboard-lg font-semibold text-dashboard-text-primary">
              Activity costs
            </h2>
            <p className="text-dashboard-xs text-dashboard-text-muted">{activityTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xl leading-none text-dashboard-text-muted transition-colors hover:text-dashboard-text-primary"
          >
            &times;
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-5">
          {(loading || loadingCatalogue) && (
            <p className="mb-2 text-dashboard-xs text-dashboard-text-muted">Loading…</p>
          )}
          {error && <p className="mb-2 text-dashboard-xs text-dashboard-status-danger">{error}</p>}
          {saveError && <p className="mb-2 text-dashboard-xs text-dashboard-status-danger">{saveError}</p>}

          {budgetAmount.trim() !== "" && (
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-dashboard-md border border-dashboard-border bg-dashboard-bg px-3 py-2 text-dashboard-sm sm:grid-cols-4">
              <div>
                <span className="text-dashboard-text-muted">Budget</span>
                <p className="font-medium text-dashboard-text-primary">${formatCost(summary.budget)}</p>
              </div>
              <div>
                <span className="text-dashboard-text-muted">Assigned</span>
                <p className="font-medium text-dashboard-text-primary">${formatCost(summary.actual)}</p>
              </div>
              <div>
                <span className="text-dashboard-text-muted">Variance</span>
                <p
                  className={`font-medium ${
                    summary.variance >= 0 ? "text-dashboard-status-success" : "text-dashboard-status-danger"
                  }`}
                >
                  {summary.variance >= 0 ? "" : "-"}${formatCost(Math.abs(summary.variance))}
                </p>
              </div>
              <div>
                <span className="text-dashboard-text-muted">EAC</span>
                <p className="font-medium text-dashboard-text-primary">
                  {summary.eac != null ? `$${formatCost(summary.eac)}` : "—"}
                </p>
              </div>
            </div>
          )}

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <label className="text-dashboard-xs font-medium text-dashboard-text-secondary">Search catalogue</label>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, description, category, unit…"
                className={inputClass}
              />
              <div className="flex flex-wrap gap-1.5">
                {(["all", ...COST_CATEGORIES] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setFilterTab(tab);
                      setSelectedCatalogueId(null);
                    }}
                    className={`rounded-full px-2.5 py-1 text-dashboard-xs font-medium transition-colors ${
                      filterTab === tab
                        ? "bg-[#5B5FEF] text-white"
                        : "bg-dashboard-bg text-dashboard-text-secondary hover:bg-dashboard-border/40"
                    }`}
                  >
                    {tab === "all" ? "All" : COST_CATEGORY_LABELS[tab]}
                  </button>
                ))}
              </div>
              <div className="max-h-44 overflow-y-auto rounded-dashboard-md border border-dashboard-border bg-dashboard-bg">
                {filteredCatalogue.length === 0 ? (
                  <p className="p-3 text-dashboard-xs text-dashboard-text-muted">No items match.</p>
                ) : (
                  <ul className="divide-y divide-dashboard-border">
                    {filteredCatalogue.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCatalogueId(item.id);
                            setUseDurationQty(false);
                            setNewQuantity("1");
                          }}
                          className={`w-full px-3 py-2 text-left text-dashboard-sm transition-colors ${
                            selectedCatalogueId === item.id
                              ? "bg-[#5B5FEF]/15 text-dashboard-text-primary"
                              : "text-dashboard-text-primary hover:bg-dashboard-surface"
                          }`}
                        >
                          <span className="font-medium">{item.name}</span>
                          <span className="ml-2 text-dashboard-xs text-dashboard-text-muted">
                            {COST_CATEGORY_LABELS[item.category]}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-dashboard-md border border-dashboard-border bg-dashboard-bg p-3">
              <p className="text-dashboard-xs font-medium text-dashboard-text-secondary">Item detail & add</p>
              {selectedItem ? (
                <>
                  <div className="rounded-dashboard-sm border border-dashboard-border bg-dashboard-surface p-2 text-dashboard-xs">
                    <p className="font-medium text-dashboard-text-primary">{selectedItem.name}</p>
                    {selectedItem.description && (
                      <p className="mt-1 text-dashboard-text-secondary">{selectedItem.description}</p>
                    )}
                    <dl className="mt-2 grid grid-cols-2 gap-1 text-dashboard-text-muted">
                      <dt>Unit</dt>
                      <dd className="text-dashboard-text-primary">{selectedItem.unit}</dd>
                      <dt>Unit rate</dt>
                      <dd className="text-dashboard-text-primary">${formatCost(Number(selectedItem.unit_rate))}</dd>
                    </dl>
                  </div>
                  {canSuggestDuration && (
                    <label className="flex cursor-pointer items-center gap-2 text-dashboard-xs text-dashboard-text-secondary">
                      <input
                        type="checkbox"
                        checked={useDurationQty}
                        onChange={(e) => setUseDurationQty(e.target.checked)}
                      />
                      Auto quantity from activity duration ({durationDays} day{durationDays !== 1 ? "s" : ""}
                      {selectedItem.unit.toLowerCase().match(/hour|hr/)
                        ? " × 8 h/day for hour rates"
                        : ""}
                      )
                    </label>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Quantity</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newQuantity}
                        onChange={(e) => setNewQuantity(e.target.value)}
                        disabled={saving || (useDurationQty && !!canSuggestDuration)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">
                        Override rate ($) <span className="text-dashboard-text-muted">optional</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newOverrideRate}
                        onChange={(e) => setNewOverrideRate(e.target.value)}
                        placeholder={`Default ${formatCost(Number(selectedItem.unit_rate))}`}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Notes</label>
                    <input
                      type="text"
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={saving || !newQuantity.trim()}
                    onClick={() => void handleAdd()}
                    className="w-full rounded-dashboard-sm bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] px-3 py-2 text-dashboard-sm font-medium text-white shadow-dashboard-card disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Add to activity"}
                  </button>
                </>
              ) : (
                <p className="text-dashboard-xs text-dashboard-text-muted">Select a catalogue item from the list.</p>
              )}
            </div>
          </div>

          <p className="mb-3 text-dashboard-xs text-dashboard-text-muted">
            To add or edit catalogue items, use <strong className="text-dashboard-text-secondary">Resource library</strong>{" "}
            in the planner toolbar. Reopen this window to refresh the list after changes.
          </p>

          <p className="mb-2 text-dashboard-xs font-medium text-dashboard-text-secondary">Assigned costs</p>
          {costRecords.length === 0 ? (
            <p className="text-dashboard-xs text-dashboard-text-muted">No lines yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-dashboard-md border border-dashboard-border">
              <table className="min-w-full text-dashboard-xs">
                <thead className="bg-dashboard-bg text-dashboard-text-secondary">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Category</th>
                    <th className="px-2 py-1.5 text-left">Item</th>
                    <th className="px-2 py-1.5 text-left">Unit</th>
                    <th className="px-2 py-1.5 text-right">Rate</th>
                    <th className="px-2 py-1.5 text-right">Qty</th>
                    <th className="px-2 py-1.5 text-right">Est. amount</th>
                    <th className="px-2 py-1.5 text-left">Notes</th>
                    <th className="px-2 py-1.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => (
                    <tr
                      key={`${r.id}-${r.amount}-${r.override_unit_rate ?? ""}-${r.quantity}`}
                      className="border-t border-dashboard-border bg-dashboard-surface"
                    >
                      <td className="px-2 py-1.5">
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                          style={{ backgroundColor: COST_CATEGORY_COLORS[r.category] }}
                        >
                          {COST_CATEGORY_LABELS[r.category]}
                        </span>
                      </td>
                      <td className="max-w-[140px] truncate px-2 py-1.5 text-dashboard-text-primary">{r.name}</td>
                      <td className="px-2 py-1.5 text-dashboard-text-muted">{r.unit}</td>
                      <td className="px-2 py-1.5 text-right align-top">
                        <p className="font-medium text-dashboard-text-primary">
                          ${formatCost(effectiveCostUnitRate(r))}
                          <span className="block text-[10px] font-normal text-dashboard-text-muted">
                            base ${formatCost(r.unit_rate)}
                          </span>
                        </p>
                        <label className="mt-1 block text-[10px] text-dashboard-text-muted">Override</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          key={`ov-${r.id}-${r.override_unit_rate ?? "n"}-${r.unit_rate}`}
                          defaultValue={r.override_unit_rate != null ? String(r.override_unit_rate) : ""}
                          placeholder="—"
                          className="w-20 rounded-dashboard-sm border border-dashboard-border bg-dashboard-bg px-1 py-0.5 text-right text-[10px]"
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            const override =
                              raw === "" ? null : Number.isFinite(Number(raw)) ? Number(raw) : r.override_unit_rate;
                            const next = patchRowLocal(r, { override_unit_rate: override });
                            void persistRow(r, next).catch((err) =>
                              setError(err instanceof Error ? err.message : "Update failed")
                            );
                          }}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={String(r.quantity)}
                          className="w-16 rounded-dashboard-sm border border-dashboard-border bg-dashboard-bg px-1 py-0.5 text-right"
                          onBlur={(e) => {
                            const q = Number(e.target.value);
                            if (!Number.isFinite(q) || q <= 0) return;
                            const next = patchRowLocal(r, { quantity: q });
                            void persistRow(r, next).catch((err) => setError(err instanceof Error ? err.message : "Update failed"));
                          }}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium text-dashboard-text-primary">
                        ${formatCost(r.amount)}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          defaultValue={r.description ?? ""}
                          className="w-full min-w-[100px] rounded-dashboard-sm border border-dashboard-border bg-dashboard-bg px-1 py-0.5"
                          onBlur={(e) => {
                            const next = patchRowLocal(r, { description: e.target.value.trim() || null });
                            void persistRow(r, next).catch((err) => setError(err instanceof Error ? err.message : "Update failed"));
                          }}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => void handleDelete(r.id)}
                          className="text-dashboard-text-muted hover:text-dashboard-status-danger"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {costRecords.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-dashboard-border pt-3">
              {COST_CATEGORIES.map((c) => {
                const sub = categorySubtotal(c);
                if (sub === 0) return null;
                return (
                  <div key={c} className="flex justify-between text-dashboard-sm">
                    <span className="text-dashboard-text-muted">Subtotal · {COST_CATEGORY_LABELS[c]}</span>
                    <span className="font-medium text-dashboard-text-primary">${formatCost(sub)}</span>
                  </div>
                );
              })}
              <div className="flex justify-between border-t border-dashboard-border pt-2 text-dashboard-sm font-semibold">
                <span className="text-dashboard-text-primary">Grand total</span>
                <span className="text-dashboard-text-primary">${formatCost(summary.actual)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-dashboard-border px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-dashboard-md bg-dashboard-bg px-4 py-2 text-dashboard-sm font-medium text-dashboard-text-secondary hover:bg-dashboard-border/40"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
