import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeCostLineAmount } from "@/lib/planner-cost-utils";

export const dynamic = "force-dynamic";

const VALID = new Set(["machinery", "labour", "materials"]);

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const wbsCode = String(req.nextUrl.searchParams.get("wbs_code") ?? "").trim();
    const costDate = String(req.nextUrl.searchParams.get("cost_date") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(costDate)) {
      return NextResponse.json({ rows: [], catalogue_item_ids: [] });
    }

    let q = supabase
      .from("planner_daily_cost_actuals")
      .select("id,catalogue_item_id,item_name,quantity,unit,amount,wbs_code,category")
      .eq("cost_date", costDate);
    if (wbsCode) q = q.eq("wbs_code", wbsCode);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []).map((r) => ({
      id: String(r.id ?? ""),
      catalogue_item_id:
        r.catalogue_item_id != null && String(r.catalogue_item_id).trim() !== ""
          ? String(r.catalogue_item_id).trim()
          : null,
      item_name: String(r.item_name ?? ""),
      quantity: Number(r.quantity ?? 0),
      unit: String(r.unit ?? "unit"),
      amount: Number(r.amount ?? 0),
      wbs_code: String(r.wbs_code ?? ""),
      category: String(r.category ?? "materials"),
    }));
    const ids = Array.from(
      new Set(rows.map((r) => r.catalogue_item_id).filter((x): x is string => Boolean(x)))
    );
    return NextResponse.json({ rows, catalogue_item_ids: ids });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const wbsCode = String(body.wbs_code ?? "").trim();
    const name = String(body.name ?? "").trim();
    const unit = String(body.unit ?? "").trim() || "unit";
    const costDate = String(body.cost_date ?? "").trim();
    const qty = Number(body.quantity);
    const unitRate = Number(body.unit_rate);
    const override =
      body.override_unit_rate != null && String(body.override_unit_rate).trim() !== ""
        ? Number(body.override_unit_rate)
        : null;
    const categoryRaw = String(body.category ?? "materials").toLowerCase();
    const category = VALID.has(categoryRaw) ? categoryRaw : "materials";

    if (!wbsCode || !name || !/^\d{4}-\d{2}-\d{2}$/.test(costDate)) {
      return NextResponse.json({ error: "wbs_code, name and valid cost_date are required" }, { status: 400 });
    }
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitRate)) {
      return NextResponse.json({ error: "quantity and unit_rate must be valid numbers" }, { status: 400 });
    }
    if (override != null && !Number.isFinite(override)) {
      return NextResponse.json({ error: "override_unit_rate must be numeric" }, { status: 400 });
    }

    const amount = computeCostLineAmount(qty, unitRate, override);
    const catalogueItemId =
      body.catalogue_item_id != null && String(body.catalogue_item_id).trim() !== ""
        ? String(body.catalogue_item_id).trim()
        : null;

    if (catalogueItemId) {
      const { data: dup, error: dupErr } = await supabase
        .from("planner_daily_cost_actuals")
        .select("id,wbs_code")
        .eq("cost_date", costDate)
        .eq("catalogue_item_id", catalogueItemId)
        .limit(1)
        .maybeSingle();
      if (dupErr) return NextResponse.json({ error: dupErr.message }, { status: 500 });
      if (dup) {
        return NextResponse.json(
          { error: `Resource already assigned on ${costDate} (WBS ${String(dup.wbs_code ?? "unknown")})` },
          { status: 409 }
        );
      }
    }

    const row = {
      cost_date: costDate,
      wbs_code: wbsCode,
      category,
      item_name: name,
      unit,
      quantity: qty,
      unit_rate: unitRate,
      override_unit_rate: override,
      amount,
      catalogue_item_id: catalogueItemId,
      resource_crew:
        body.resource_crew != null && String(body.resource_crew).trim() !== ""
          ? String(body.resource_crew).trim()
          : null,
      notes: body.description != null && String(body.description).trim() !== "" ? String(body.description).trim() : null,
    };

    const { data, error } = await supabase.from("planner_daily_cost_actuals").insert(row).select("*").single();
    if (error && error.message.toLowerCase().includes("planner_daily_cost_actuals_unique_resource_per_day_idx")) {
      return NextResponse.json({ error: `Resource already assigned on ${costDate}` }, { status: 409 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const id = String(req.nextUrl.searchParams.get("id") ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { error } = await supabase.from("planner_daily_cost_actuals").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

