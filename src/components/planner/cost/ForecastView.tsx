"use client";

import { formatCost } from "@/lib/planner-cost-utils";

type ForecastActivity = {
  activity_name: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  assigned_resources: number;
  total_estimated_cost: number;
  daily_burn_rate: number;
  variance_vs_budget: number | null;
};

export default function ForecastView({
  loading,
  activities,
  totalForecast,
  totalVariance,
}: {
  loading: boolean;
  activities: ForecastActivity[];
  totalForecast: number;
  totalVariance: number;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3">
          <p className="text-dashboard-xs text-dashboard-text-muted">Total forecast</p>
          <p className="mt-1 text-dashboard-lg font-semibold">${formatCost(totalForecast)}</p>
        </div>
        <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3">
          <p className="text-dashboard-xs text-dashboard-text-muted">Activities with assigned costs</p>
          <p className="mt-1 text-dashboard-sm">{activities.length}</p>
        </div>
        <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3">
          <p className="text-dashboard-xs text-dashboard-text-muted">Variance vs budget (total)</p>
          <p className="mt-1 text-dashboard-sm">${formatCost(totalVariance)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-dashboard-md border border-dashboard-border">
        <table className="min-w-full text-left text-dashboard-xs">
          <thead className="border-b border-dashboard-border bg-dashboard-bg text-dashboard-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">Activity</th>
              <th className="px-3 py-2 font-medium">Start</th>
              <th className="px-3 py-2 font-medium">End</th>
              <th className="px-3 py-2 font-medium text-right">Duration</th>
              <th className="px-3 py-2 font-medium text-right">Resources</th>
              <th className="px-3 py-2 font-medium text-right">Estimated cost</th>
              <th className="px-3 py-2 font-medium text-right">Daily burn</th>
              <th className="px-3 py-2 font-medium text-right">Var vs budget</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-dashboard-text-muted">Loading forecast…</td>
              </tr>
            ) : activities.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-dashboard-text-muted">
                  No forecast rows yet. Assign resources to activities first.
                </td>
              </tr>
            ) : (
              activities.map((a, i) => (
                <tr key={`${a.activity_name}-${i}`} className="border-t border-dashboard-border">
                  <td className="px-3 py-2">{a.activity_name}</td>
                  <td className="px-3 py-2">{a.start_date}</td>
                  <td className="px-3 py-2">{a.end_date}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.duration_days}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.assigned_resources}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${formatCost(a.total_estimated_cost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${formatCost(a.daily_burn_rate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {a.variance_vs_budget == null ? "—" : `$${formatCost(a.variance_vs_budget)}`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

