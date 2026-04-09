import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeCostLineAmount } from "@/lib/planner-cost-utils";
import type { CostCategory, CostRecord } from "@/lib/planner-types";
import { COST_CATEGORIES } from "@/lib/planner-types";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = new Set<string>(COST_CATEGORIES);

type CostEntryRow = {
  id: string;
  catalogue_item_id: string | null;
  name: string;
  unit: string;
  unit_rate: number;
  override_unit_rate: number | null;
  quantity: number;
  amount: number;
  cost_date: string;
  category: string;
  description: string | null;
  created_at: string;
};

function parseCostEntries(raw: unknown): CostEntryRow[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  const out: CostEntryRow[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = String(o.id ?? "").trim();
    if (!id) continue;
    const quantity = Number(o.quantity);
    const unitRate = Number(o.unit_rate);
    const overrideRaw = o.override_unit_rate;
    const override =
      overrideRaw != null && String(overrideRaw).trim() !== "" && Number.isFinite(Number(overrideRaw))
        ? Number(overrideRaw)
        : null;
    const cost_date = String(o.cost_date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cost_date)) continue;
    let category = String(o.category ?? "materials");
    if (!VALID_CATEGORIES.has(category)) category = "materials";
    const q = Number.isFinite(quantity) ? quantity : 1;
    const ur = Number.isFinite(unitRate)
      ? unitRate
      : Number.isFinite(Number(o.amount)) && q > 0
        ? Number(o.amount) / q
        : 0;
    const amount = computeCostLineAmount(q, ur, override);
    out.push({
      id,
      catalogue_item_id:
        o.catalogue_item_id != null && String(o.catalogue_item_id).trim() !== ""
          ? String(o.catalogue_item_id)
          : null,
      name: String(o.name ?? "Cost item").trim() || "Cost item",
      unit: String(o.unit ?? "unit").trim() || "unit",
      unit_rate: ur,
      override_unit_rate: override,
      quantity: q,
      amount,
      cost_date,
      category,
      description: o.description != null && String(o.description).trim() !== "" ? String(o.description) : null,
      created_at: String(o.created_at ?? new Date().toISOString()),
    });
  }
  return out;
}

function toCostRecords(activityId: string, entries: CostEntryRow[]): CostRecord[] {
  return entries.map((e) => ({
    id: e.id,
    activity_id: activityId,
    catalogue_item_id: e.catalogue_item_id,
    name: e.name,
    unit: e.unit,
    unit_rate: e.unit_rate,
    override_unit_rate: e.override_unit_rate,
    quantity: e.quantity,
    amount: e.amount,
    cost_date: e.cost_date,
    category: e.category as CostCategory,
    description: e.description,
    created_at: e.created_at,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const activityId = req.nextUrl.searchParams.get("activity_id");

    if (!activityId) {
      return NextResponse.json({ error: "activity_id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("planner_activities")
      .select("id, cost_entries")
      .eq("id", activityId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    const entries = parseCostEntries((data as { cost_entries?: unknown }).cost_entries);
    const records = toCostRecords(activityId, entries).sort((a, b) => b.cost_date.localeCompare(a.cost_date));
    return NextResponse.json(records);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const { activity_id, quantity, unit_rate, cost_date } = body;
    if (!activity_id || quantity == null || unit_rate == null || !cost_date) {
      return NextResponse.json(
        { error: "activity_id, quantity, unit_rate and cost_date are required" },
        { status: 400 }
      );
    }

    const parsedQty = Number(quantity);
    const parsedRate = Number(unit_rate);
    if (!Number.isFinite(parsedQty) || !Number.isFinite(parsedRate)) {
      return NextResponse.json({ error: "quantity and unit_rate must be valid numbers" }, { status: 400 });
    }
    const overrideBody = body.override_unit_rate;
    const parsedOverride =
      overrideBody != null && String(overrideBody).trim() !== "" && Number.isFinite(Number(overrideBody))
        ? Number(overrideBody)
        : null;
    const parsedAmount = computeCostLineAmount(parsedQty, parsedRate, parsedOverride);

    const category =
      typeof body.category === "string" && VALID_CATEGORIES.has(body.category) ? body.category : "materials";

    const { data: row, error: fetchErr } = await supabase
      .from("planner_activities")
      .select("id, cost_entries")
      .eq("id", activity_id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    const existing = parseCostEntries((row as { cost_entries?: unknown }).cost_entries);
    const newEntry: CostEntryRow = {
      id: randomUUID(),
      catalogue_item_id:
        body.catalogue_item_id != null && String(body.catalogue_item_id).trim() !== ""
          ? String(body.catalogue_item_id).trim()
          : null,
      name: String(body.name ?? "Cost item").trim() || "Cost item",
      unit: String(body.unit ?? "unit").trim() || "unit",
      unit_rate: parsedRate,
      override_unit_rate: parsedOverride,
      quantity: parsedQty,
      amount: parsedAmount,
      cost_date: String(cost_date).trim(),
      category,
      description: body.description != null && String(body.description).trim() !== "" ? String(body.description) : null,
      created_at: new Date().toISOString(),
    };
    const next = [...existing, newEntry];

    const { data: updated, error: updErr } = await supabase
      .from("planner_activities")
      .update({ cost_entries: next })
      .eq("id", activity_id)
      .select("cost_entries")
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    const saved = parseCostEntries((updated as { cost_entries?: unknown }).cost_entries);
    const created = saved.find((e) => e.id === newEntry.id);
    if (!created) {
      return NextResponse.json({ error: "Failed to persist cost entry" }, { status: 500 });
    }

    return NextResponse.json(toCostRecords(activity_id, [created])[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const { id, activity_id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (!activity_id) {
      return NextResponse.json(
        { error: "activity_id is required (costs are stored on the activity row)" },
        { status: 400 }
      );
    }

    const filtered: Partial<
      Pick<
        CostEntryRow,
        "name" | "unit" | "unit_rate" | "override_unit_rate" | "quantity" | "amount" | "cost_date" | "category" | "description"
      >
    > = {};
    if ("name" in updates && String(updates.name ?? "").trim()) filtered.name = String(updates.name).trim();
    if ("unit" in updates && String(updates.unit ?? "").trim()) filtered.unit = String(updates.unit).trim();
    if ("unit_rate" in updates) {
      const v = Number(updates.unit_rate);
      if (Number.isFinite(v)) filtered.unit_rate = v;
    }
    if ("override_unit_rate" in updates) {
      const raw = updates.override_unit_rate;
      if (raw === null || raw === "") {
        filtered.override_unit_rate = null;
      } else {
        const v = Number(raw);
        if (Number.isFinite(v)) filtered.override_unit_rate = v;
      }
    }
    if ("quantity" in updates) {
      const v = Number(updates.quantity);
      if (Number.isFinite(v)) filtered.quantity = v;
    }
    if ("cost_date" in updates && updates.cost_date) {
      filtered.cost_date = String(updates.cost_date);
    }
    if ("category" in updates && typeof updates.category === "string" && VALID_CATEGORIES.has(updates.category)) {
      filtered.category = updates.category;
    }
    if ("description" in updates) {
      filtered.description =
        updates.description != null && String(updates.description).trim() !== ""
          ? String(updates.description)
          : null;
    }

    if (Object.keys(filtered).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data: row, error: fetchErr } = await supabase
      .from("planner_activities")
      .select("id, cost_entries")
      .eq("id", activity_id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    const entries = parseCostEntries((row as { cost_entries?: unknown }).cost_entries);
    const idx = entries.findIndex((e) => e.id === id);
    if (idx < 0) {
      return NextResponse.json({ error: "Cost record not found" }, { status: 404 });
    }

    const merged = { ...entries[idx], ...filtered };
    merged.amount = computeCostLineAmount(
      Number(merged.quantity),
      Number(merged.unit_rate),
      merged.override_unit_rate
    );
    const next = [...entries.slice(0, idx), merged, ...entries.slice(idx + 1)];

    const { data: updated, error: updErr } = await supabase
      .from("planner_activities")
      .update({ cost_entries: next })
      .eq("id", activity_id)
      .select("cost_entries")
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    const saved = parseCostEntries((updated as { cost_entries?: unknown }).cost_entries);
    const out = saved.find((e) => e.id === id);
    if (!out) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    return NextResponse.json(toCostRecords(activity_id, [out])[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const id = req.nextUrl.searchParams.get("id");
    const activityId = req.nextUrl.searchParams.get("activity_id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (!activityId) {
      return NextResponse.json(
        { error: "activity_id is required (costs are stored on the activity row)" },
        { status: 400 }
      );
    }

    const { data: row, error: fetchErr } = await supabase
      .from("planner_activities")
      .select("id, cost_entries")
      .eq("id", activityId)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    const entries = parseCostEntries((row as { cost_entries?: unknown }).cost_entries);
    const next = entries.filter((e) => e.id !== id);
    if (next.length === entries.length) {
      return NextResponse.json({ error: "Cost record not found" }, { status: 404 });
    }

    const { error: updErr } = await supabase
      .from("planner_activities")
      .update({ cost_entries: next })
      .eq("id", activityId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
