"use client";

import { formatCost } from "@/lib/planner-cost-utils";

type AccrualRow = {
  cost_code: string | null;
  activity_name: string;
  category: "labour" | "machinery" | "materials";
  daily_amount: number;
  overlap_days: number;
  accrued_amount: number;
};

export default function AccrualsView({
  loading,
  rows,
  total,
  byDay,
  byCostCode,
}: {
  loading: boolean;
  rows: AccrualRow[];
  total: number;
  byDay: Array<{ date: string; amount: number }>;
  byCostCode: Array<{ cost_code: string; amount: number }>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3">
          <p className="text-dashboard-xs text-dashboard-text-muted">Total accrual cost</p>
          <p className="mt-1 text-dashboard-lg font-semibold">${formatCost(total)}</p>
        </div>
        <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3">
          <p className="text-dashboard-xs text-dashboard-text-muted">Accrual by day</p>
          <p className="mt-1 text-dashboard-sm">{byDay.length} day rows</p>
        </div>
        <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3">
          <p className="text-dashboard-xs text-dashboard-text-muted">Top cost code</p>
          <p className="mt-1 text-dashboard-sm">
            {byCostCode[0] ? `${byCostCode[0].cost_code} ($${formatCost(byCostCode[0].amount)})` : "—"}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-dashboard-md border border-dashboard-border">
        <table className="min-w-full text-left text-dashboard-xs">
          <thead className="border-b border-dashboard-border bg-dashboard-bg text-dashboard-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">Cost code</th>
              <th className="px-3 py-2 font-medium">Activity</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium text-right">Daily accrual</th>
              <th className="px-3 py-2 font-medium text-right">Overlap days</th>
              <th className="px-3 py-2 font-medium text-right">Accrued amount</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-dashboard-text-muted">Loading accruals…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-dashboard-text-muted">No accrual data for selected range.</td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.activity_name}-${r.cost_code}-${i}`} className="border-t border-dashboard-border">
                  <td className="px-3 py-2">{r.cost_code ?? "Uncoded"}</td>
                  <td className="px-3 py-2">{r.activity_name}</td>
                  <td className="px-3 py-2 capitalize">{r.category}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${formatCost(r.daily_amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.overlap_days}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${formatCost(r.accrued_amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

