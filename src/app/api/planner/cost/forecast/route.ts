import { NextRequest, NextResponse } from "next/server";
import {
  fetchCostReportLines,
  makeCategoryTotals,
  makeCostCodeTotals,
} from "@/lib/planner-cost-reporting";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const crewId = req.nextUrl.searchParams.get("crew_id");
    const sectionId = req.nextUrl.searchParams.get("section_id");
    const costCode = req.nextUrl.searchParams.get("cost_code");

    const lines = await fetchCostReportLines({ crewId, sectionId, costCode });

    const byActivity = new Map<
      string,
      {
        activity_id: string;
        activity_name: string;
        crew_name: string | null;
        section_name: string | null;
        start_date: string;
        end_date: string;
        duration_days: number;
        budget_amount: number | null;
        total_estimated_cost: number;
        assigned_resources: number;
        by_category: Record<string, number>;
        by_cost_code: Record<string, number>;
      }
    >();

    for (const line of lines) {
      const key = line.activity_id;
      const rec =
        byActivity.get(key) ??
        {
          activity_id: line.activity_id,
          activity_name: line.activity_name,
          crew_name: line.crew_name,
          section_name: line.section_name,
          start_date: line.start_date,
          end_date: line.end_date,
          duration_days: Math.max(1, line.duration_days),
          budget_amount: line.budget_amount,
          total_estimated_cost: 0,
          assigned_resources: 0,
          by_category: {},
          by_cost_code: {},
        };
      rec.total_estimated_cost += line.amount;
      rec.assigned_resources += 1;
      rec.by_category[line.category] = (rec.by_category[line.category] ?? 0) + line.amount;
      const cc = line.cost_code ?? "Uncoded";
      rec.by_cost_code[cc] = (rec.by_cost_code[cc] ?? 0) + line.amount;
      byActivity.set(key, rec);
    }

    const activities = Array.from(byActivity.values())
      .map((a) => {
        const dailyBurn = a.total_estimated_cost / Math.max(1, a.duration_days);
        const varianceVsBudget =
          a.budget_amount != null ? Number((a.budget_amount - a.total_estimated_cost).toFixed(2)) : null;
        return {
          ...a,
          total_estimated_cost: Number(a.total_estimated_cost.toFixed(2)),
          daily_burn_rate: Number(dailyBurn.toFixed(2)),
          variance_vs_budget: varianceVsBudget,
        };
      })
      .sort(
        (a, b) =>
          a.start_date.localeCompare(b.start_date) ||
          a.activity_name.localeCompare(b.activity_name)
      );

    const totalForecast = activities.reduce((s, a) => s + a.total_estimated_cost, 0);

    return NextResponse.json({
      activities,
      summary: {
        total_forecast: totalForecast,
        by_category: makeCategoryTotals(lines),
        by_cost_code: makeCostCodeTotals(lines),
        total_budget: activities.reduce((s, a) => s + (a.budget_amount ?? 0), 0),
        total_variance_vs_budget: activities.reduce(
          (s, a) => s + (a.variance_vs_budget ?? 0),
          0
        ),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

