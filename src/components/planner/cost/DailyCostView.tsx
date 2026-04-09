"use client";

import { formatCost } from "@/lib/planner-cost-utils";

type DailyRow = {
  cost_date: string;
  cost_code: string | null;
  category: "labour" | "machinery" | "materials";
  item_name: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  crew_name: string | null;
  resource_crew: string | null;
  section_name: string | null;
};

export default function DailyCostView({
  loading,
  rows,
  total,
  byCategory,
  byCostCode,
  allocatedByCostCode,
  allocatedByCategory,
  onDeleteAllocatedLine,
  deletingAllocatedId,
}: {
  loading: boolean;
  rows: DailyRow[];
  total: number;
  byCategory: Record<string, number>;
  byCostCode: Array<{ cost_code: string; amount: number }>;
  allocatedByCostCode: Array<{
    wbs_code: string;
    lines: Array<{
      id: string;
      item_name: string;
      quantity: number;
      unit: string;
      amount: number;
      category: "labour" | "machinery" | "materials";
    }>;
    total: number;
  }>;
  allocatedByCategory: { labour: number; machinery: number; materials: number };
  onDeleteAllocatedLine: (id: string) => void;
  deletingAllocatedId: string | null;
}) {
  const hasApiCategoryTotals =
    Number(byCategory.labour ?? 0) > 0 ||
    Number(byCategory.machinery ?? 0) > 0 ||
    Number(byCategory.materials ?? 0) > 0;
  const categoryTotals = hasApiCategoryTotals ? byCategory : allocatedByCategory;
  const allocatedTotal = allocatedByCostCode.reduce((sum, g) => sum + (Number(g.total) || 0), 0);
  const displayTotal = Number(total) > 0 ? Number(total) : allocatedTotal;

  const costCodesInUse =
    byCostCode.length > 0
      ? byCostCode.map((c) => ({ cost_code: c.cost_code, amount: c.amount }))
      : allocatedByCostCode.map((g) => ({ cost_code: g.wbs_code, amount: g.total }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3">
          <p className="text-dashboard-xs text-dashboard-text-muted">Total daily cost</p>
          <p className="mt-1 text-dashboard-lg font-semibold">${formatCost(displayTotal)}</p>
        </div>
        <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3">
          <p className="text-dashboard-xs text-dashboard-text-muted">By category</p>
          <p className="mt-1 text-dashboard-sm">
            Labor ${formatCost(categoryTotals.labour ?? 0)} · Machinery ${formatCost(categoryTotals.machinery ?? 0)} · Material ${formatCost(categoryTotals.materials ?? 0)}
          </p>
        </div>
        <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3">
          <p className="text-dashboard-xs text-dashboard-text-muted">Cost codes in use (day)</p>
          {costCodesInUse.length === 0 ? (
            <p className="mt-1 text-dashboard-sm">—</p>
          ) : (
            <div className="mt-1 space-y-0.5">
              {costCodesInUse.map((c) => (
                <p key={c.cost_code} className="text-dashboard-xs text-dashboard-text-secondary">
                  <span className="font-medium text-dashboard-text-primary">{c.cost_code}</span>{" "}
                  (${formatCost(c.amount)})
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-dashboard-md border border-dashboard-border">
        <table className="min-w-full text-left text-dashboard-xs">
          <thead className="border-b border-dashboard-border bg-dashboard-bg text-dashboard-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">WBS</th>
              <th className="px-3 py-2 font-medium">Crew (day)</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Item / Resource</th>
              <th className="px-3 py-2 font-medium text-right">Qty</th>
              <th className="px-3 py-2 font-medium">Unit</th>
              <th className="px-3 py-2 font-medium text-right">Rate</th>
              <th className="px-3 py-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-dashboard-text-muted">Loading daily costs…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-dashboard-text-muted">
                  <div className="space-y-2 text-left">
                    <p className="text-center">No assigned costs found for current filters.</p>
                    <div className="rounded-dashboard-sm border border-dashboard-border bg-dashboard-surface p-2">
                      <p className="mb-1 text-dashboard-xs font-medium text-dashboard-text-secondary">
                        Resources allocated by WBS (day)
                      </p>
                      {allocatedByCostCode.length === 0 ? (
                        <p className="text-dashboard-xs text-dashboard-text-muted">
                          No daily allocations found for this date.
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-dashboard-sm border border-dashboard-border">
                          <table className="min-w-full text-left text-dashboard-xs">
                            <thead className="border-b border-dashboard-border bg-dashboard-bg text-dashboard-text-secondary">
                              <tr>
                                <th className="px-2 py-1.5 font-medium">WBS</th>
                                <th className="px-2 py-1.5 font-medium">Item / Resource</th>
                                <th className="px-2 py-1.5 font-medium text-right">Qty</th>
                                <th className="px-2 py-1.5 font-medium">Unit</th>
                                <th className="px-2 py-1.5 font-medium text-right">Amount</th>
                                <th className="px-2 py-1.5 font-medium text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {allocatedByCostCode.flatMap((group) =>
                                group.lines.map((line, idx) => (
                                  <tr key={`${group.wbs_code}-${line.id || `${line.item_name}-${idx}`}`} className="border-t border-dashboard-border">
                                    <td className="px-2 py-1.5">{group.wbs_code}</td>
                                    <td className="px-2 py-1.5">{line.item_name}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{line.quantity}</td>
                                    <td className="px-2 py-1.5">{line.unit}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">${formatCost(line.amount)}</td>
                                    <td className="px-2 py-1.5 text-right">
                                      <button
                                        type="button"
                                        onClick={() => onDeleteAllocatedLine(line.id)}
                                        disabled={!line.id || deletingAllocatedId === line.id}
                                        className="rounded-dashboard-sm px-2 py-0.5 text-dashboard-xs font-medium text-dashboard-status-danger hover:bg-dashboard-status-danger/10 disabled:opacity-50"
                                        title="Delete assigned resource"
                                      >
                                        {deletingAllocatedId === line.id ? "..." : "×"}
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.cost_code ?? "uncoded"}-${r.item_name}-${r.cost_date}-${i}`} className="border-t border-dashboard-border">
                  <td className="px-3 py-2">{r.cost_date}</td>
                  <td className="px-3 py-2">{r.cost_code ?? "Uncoded"}</td>
                  <td className="px-3 py-2">{r.resource_crew ?? "—"}</td>
                  <td className="px-3 py-2 capitalize">{r.category}</td>
                  <td className="px-3 py-2">{r.item_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.quantity}</td>
                  <td className="px-3 py-2">{r.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${formatCost(r.rate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${formatCost(r.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

