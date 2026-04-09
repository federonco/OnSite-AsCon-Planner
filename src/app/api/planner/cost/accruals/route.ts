import { NextRequest, NextResponse } from "next/server";
import {
  fetchCostReportLines,
  makeCategoryTotals,
  makeCostCodeTotals,
  overlapDaysInclusive,
} from "@/lib/planner-cost-reporting";

export const dynamic = "force-dynamic";

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const rawFrom = req.nextUrl.searchParams.get("from");
    const rawTo = req.nextUrl.searchParams.get("to");
    const to = rawTo && /^\d{4}-\d{2}-\d{2}$/.test(rawTo) ? rawTo : todayYmd();
    const from = rawFrom && /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : addDays(to, -7);
    const crewId = req.nextUrl.searchParams.get("crew_id");
    const sectionId = req.nextUrl.searchParams.get("section_id");
    const costCode = req.nextUrl.searchParams.get("cost_code");

    const lines = await fetchCostReportLines({
      crewId,
      sectionId,
      costCode,
    });

    const accrualRows = lines
      .map((line) => {
        const overlap = overlapDaysInclusive(line.start_date, line.end_date, from, to);
        if (overlap <= 0) return null;
        const daily = line.amount / Math.max(1, line.duration_days);
        const accrued = Number((daily * overlap).toFixed(2));
        return {
          ...line,
          overlap_days: overlap,
          accrued_amount: accrued,
          daily_amount: Number(daily.toFixed(2)),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);

    const total = accrualRows.reduce((s, r) => s + r.accrued_amount, 0);

    const byDayMap = new Map<string, number>();
    for (const r of accrualRows) {
      const start = r.start_date > from ? r.start_date : from;
      const end = r.end_date < to ? r.end_date : to;
      const cur = new Date(`${start}T12:00:00Z`);
      const endDt = new Date(`${end}T12:00:00Z`);
      while (cur <= endDt) {
        const d = cur.toISOString().slice(0, 10);
        byDayMap.set(d, (byDayMap.get(d) ?? 0) + r.daily_amount);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    const by_day = Array.from(byDayMap.entries())
      .map(([date, amount]) => ({ date, amount: Number(amount.toFixed(2)) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      range: { from, to },
      rows: accrualRows.sort(
        (a, b) =>
          (a.cost_code ?? "").localeCompare(b.cost_code ?? "") ||
          a.activity_name.localeCompare(b.activity_name)
      ),
      summary: {
        total,
        by_category: makeCategoryTotals(accrualRows.map((r) => ({ category: r.category, amount: r.accrued_amount }))),
        by_cost_code: makeCostCodeTotals(accrualRows.map((r) => ({ cost_code: r.cost_code, amount: r.accrued_amount }))),
      },
      by_day,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

