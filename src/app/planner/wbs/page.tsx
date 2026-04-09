"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/ui/AppShell";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopHeader } from "@/components/ui/TopHeader";

type WbsRow = {
  id: string;
  code: string;
  label: string | null;
  sort_order: number;
  budget_amount: number | null;
  is_active: boolean;
};

const inputClass =
  "w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm";

export default function PlannerWbsPage() {
  const [rows, setRows] = useState<WbsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [isActive, setIsActive] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/planner/wbs?include_inactive=true");
      const body = (await res.json().catch(() => [])) as Array<Record<string, unknown>> | { error?: string };
      if (!res.ok) throw new Error((body as { error?: string }).error ?? "Could not load WBS");
      const mapped = (Array.isArray(body) ? body : [])
        .map((r) => ({
          id: String(r.id ?? ""),
          code: String(r.code ?? ""),
          label: r.label != null && String(r.label).trim() ? String(r.label) : null,
          sort_order: Number(r.sort_order ?? 0),
          budget_amount:
            r.budget_amount != null && Number.isFinite(Number(r.budget_amount))
              ? Number(r.budget_amount)
              : null,
          is_active: Boolean(r.is_active ?? true),
        }))
        .filter((r) => r.id && r.code)
        .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
      setRows(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load WBS");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setCode("");
    setLabel("");
    setSortOrder("0");
    setBudgetAmount("");
    setIsActive(true);
  };

  const totalBudget = useMemo(
    () => rows.reduce((sum, r) => sum + (Number.isFinite(Number(r.budget_amount)) ? Number(r.budget_amount) : 0), 0),
    [rows]
  );

  const submit = async () => {
    if (!code.trim()) {
      setError("WBS code is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/planner/wbs", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          code: code.trim(),
          label: label.trim() || null,
          sort_order: Number(sortOrder) || 0,
          budget_amount: budgetAmount.trim() === "" ? null : Number(budgetAmount),
          is_active: isActive,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save WBS");
      await load();
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save WBS");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      sidebar={<Sidebar activeId="wbs" />}
      header={<TopHeader left={<h1 className="text-dashboard-xl font-semibold text-dashboard-text-primary">WBS Library</h1>} right={<></>} />}
    >
      <div className="mx-auto max-w-[1400px] space-y-4">
        {error && (
          <div className="rounded-dashboard-md border border-dashboard-status-danger/40 bg-dashboard-status-danger/10 px-3 py-2 text-dashboard-sm text-dashboard-status-danger">
            {error}
          </div>
        )}

        <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-4">
          <p className="mb-3 text-dashboard-sm font-medium text-dashboard-text-primary">
            {editingId ? "Edit WBS" : "Create WBS"}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Code *</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Label</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Sort order</label>
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Budget amount ($)</label>
              <input type="number" min="0" step="0.01" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} className={inputClass} />
            </div>
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-dashboard-sm text-dashboard-text-secondary">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void submit()} disabled={saving} className="rounded-dashboard-md bg-dashboard-primary px-4 py-2 text-dashboard-sm font-medium text-white disabled:opacity-60">
              {saving ? "Saving..." : editingId ? "Save WBS" : "Create WBS"}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded-dashboard-md bg-dashboard-bg px-4 py-2 text-dashboard-sm font-medium text-dashboard-text-secondary">
                Cancel
              </button>
            )}
          </div>
        </div>

        <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-dashboard-sm font-medium text-dashboard-text-primary">WBS List</p>
            <p className="text-dashboard-xs text-dashboard-text-secondary">Total WBS budget: ${totalBudget.toFixed(2)}</p>
          </div>
          <div className="overflow-x-auto rounded-dashboard-md border border-dashboard-border">
            <table className="min-w-full text-left text-dashboard-xs">
              <thead className="border-b border-dashboard-border bg-dashboard-bg text-dashboard-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Label</th>
                  <th className="px-3 py-2 font-medium text-right">Budget</th>
                  <th className="px-3 py-2 font-medium text-right">Order</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-dashboard-text-muted">Loading WBS...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-dashboard-text-muted">No WBS rows yet.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.id} className="border-t border-dashboard-border">
                    <td className="px-3 py-2">{r.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-3 py-2 font-medium">{r.code}</td>
                    <td className="px-3 py-2">{r.label ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.budget_amount != null ? `$${Number(r.budget_amount).toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.sort_order}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(r.id);
                          setCode(r.code);
                          setLabel(r.label ?? "");
                          setSortOrder(String(r.sort_order ?? 0));
                          setBudgetAmount(r.budget_amount != null ? String(r.budget_amount) : "");
                          setIsActive(r.is_active);
                        }}
                        className="rounded-dashboard-sm px-2 py-1 text-dashboard-xs font-medium text-[#5B5FEF] hover:bg-[#5B5FEF]/10"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
