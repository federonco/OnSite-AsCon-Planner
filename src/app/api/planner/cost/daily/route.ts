import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { makeCategoryTotals, makeCostCodeTotals } from "@/lib/planner-cost-reporting";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    const costCode = req.nextUrl.searchParams.get("cost_code");

    let q = supabase
      .from("planner_daily_cost_actuals")
      .select("cost_date,wbs_code,category,item_name,quantity,unit,unit_rate,override_unit_rate,amount,resource_crew")
      .order("cost_date", { ascending: true })
      .order("wbs_code", { ascending: true })
      .order("item_name", { ascending: true });
    if (from) q = q.gte("cost_date", from);
    if (to) q = q.lte("cost_date", to);
    if (costCode) q = q.eq("wbs_code", costCode);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []).map((r) => ({
      cost_date: String(r.cost_date ?? ""),
      cost_code: r.wbs_code != null && String(r.wbs_code).trim() ? String(r.wbs_code).trim() : null,
      activity_name: "Actual daily",
      category: String(r.category ?? "materials") as "labour" | "machinery" | "materials",
      item_name: String(r.item_name ?? ""),
      quantity: Number(r.quantity ?? 0),
      unit: String(r.unit ?? "unit"),
      rate:
        r.override_unit_rate != null && Number.isFinite(Number(r.override_unit_rate))
          ? Number(r.override_unit_rate)
          : Number(r.unit_rate ?? 0),
      amount: Number(r.amount ?? 0),
      crew_name: null,
      resource_crew:
        r.resource_crew != null && String(r.resource_crew).trim() ? String(r.resource_crew).trim() : null,
      section_name: null,
    }));

    const sorted = rows.sort(
      (a, b) =>
        a.cost_date.localeCompare(b.cost_date) ||
        (a.cost_code ?? "").localeCompare(b.cost_code ?? "") ||
        a.item_name.localeCompare(b.item_name)
    );
    const total = sorted.reduce((s, r) => s + r.amount, 0);

    return NextResponse.json({
      rows: sorted,
      summary: {
        total,
        by_category: makeCategoryTotals(sorted),
        by_cost_code: makeCostCodeTotals(sorted),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

