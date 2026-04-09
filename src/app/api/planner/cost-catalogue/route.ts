import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { CostCategory } from "@/lib/planner-types";
import { COST_CATEGORIES } from "@/lib/planner-types";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = new Set<string>(COST_CATEGORIES);

function sanitizeCategory(v: unknown): CostCategory {
  const s = String(v ?? "").trim().toLowerCase();
  return (VALID_CATEGORIES.has(s) ? s : "materials") as CostCategory;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const category = req.nextUrl.searchParams.get("category");
    const includeInactive = req.nextUrl.searchParams.get("include_inactive") === "true";

    let query = supabase
      .from("planner_cost_catalogue")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!includeInactive) query = query.eq("is_active", true);
    if (category && VALID_CATEGORIES.has(category)) query = query.eq("category", category);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const name = String(body.name ?? "").trim();
    const unit = String(body.unit ?? "").trim();
    const unitRate = Number(body.unit_rate);
    if (!name || !unit || !Number.isFinite(unitRate)) {
      return NextResponse.json(
        { error: "name, unit and unit_rate are required" },
        { status: 400 }
      );
    }
    const costCode =
      body.cost_code != null && String(body.cost_code).trim() !== ""
        ? String(body.cost_code).trim()
        : null;

    const row = {
      category: sanitizeCategory(body.category),
      name,
      description:
        body.description != null && String(body.description).trim() !== ""
          ? String(body.description).trim()
          : null,
      cost_code: costCode,
      unit,
      unit_rate: unitRate,
      is_active: body.is_active !== false,
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    };

    const inserted = await supabase.from("planner_cost_catalogue").insert(row).select("*").single();
    if (inserted.error && inserted.error.message.toLowerCase().includes("cost_code")) {
      const { cost_code, ...fallback } = row;
      void cost_code;
      const retry = await supabase
        .from("planner_cost_catalogue")
        .insert(fallback)
        .select("*")
        .single();
      if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 });
      return NextResponse.json(retry.data);
    }

    if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    return NextResponse.json(inserted.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if ("category" in body) updates.category = sanitizeCategory(body.category);
    if ("name" in body) {
      const n = String(body.name ?? "").trim();
      if (!n) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      updates.name = n;
    }
    if ("description" in body) {
      updates.description =
        body.description != null && String(body.description).trim() !== ""
          ? String(body.description).trim()
          : null;
    }
    if ("cost_code" in body) {
      updates.cost_code =
        body.cost_code != null && String(body.cost_code).trim() !== ""
          ? String(body.cost_code).trim()
          : null;
    }
    if ("unit" in body) {
      const u = String(body.unit ?? "").trim();
      if (!u) return NextResponse.json({ error: "unit cannot be empty" }, { status: 400 });
      updates.unit = u;
    }
    if ("unit_rate" in body) {
      const n = Number(body.unit_rate);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ error: "unit_rate must be numeric" }, { status: 400 });
      }
      updates.unit_rate = n;
    }
    if ("is_active" in body) updates.is_active = Boolean(body.is_active);
    if ("sort_order" in body) {
      updates.sort_order = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("planner_cost_catalogue")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error && error.message.toLowerCase().includes("cost_code")) {
      const { cost_code, ...fallback } = updates;
      void cost_code;
      const retry = await supabase
        .from("planner_cost_catalogue")
        .update(fallback)
        .eq("id", id)
        .select("*")
        .single();
      if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 });
      return NextResponse.json(retry.data);
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
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await supabase
      .from("planner_cost_catalogue")
      .update({ is_active: false })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

