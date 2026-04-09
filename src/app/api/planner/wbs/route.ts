import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { PRELOADED_WBS } from "@/lib/planner-wbs-defaults";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const includeInactive = req.nextUrl.searchParams.get("include_inactive") === "true";

    let query = supabase
      .from("planner_wbs")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true });

    if (!includeInactive) query = query.eq("is_active", true);

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

    // Lightweight seed path (idempotent). No-op when list is empty.
    if (body?.seed === true) {
      if (PRELOADED_WBS.length === 0) return NextResponse.json({ ok: true, seeded: 0 });
      const rows = PRELOADED_WBS
        .map((r, idx) => ({
          code: String(r.code ?? "").trim(),
          label:
            r.label != null && String(r.label).trim() !== "" ? String(r.label).trim() : null,
          sort_order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : idx,
          budget_amount: null,
          is_active: true,
        }))
        .filter((r) => r.code);

      if (rows.length === 0) return NextResponse.json({ ok: true, seeded: 0 });

      // Use deterministic matching in code because `code` is unique in DB.
      const seeded = await supabase.from("planner_wbs").upsert(rows, { onConflict: "code" });
      if (seeded.error && seeded.error.message.toLowerCase().includes("budget_amount")) {
        const fallback = rows.map(({ budget_amount, ...rest }) => {
          void budget_amount;
          return rest;
        });
        const retry = await supabase.from("planner_wbs").upsert(fallback, { onConflict: "code" });
        if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 });
        return NextResponse.json({ ok: true, seeded: rows.length });
      }
      if (seeded.error) return NextResponse.json({ error: seeded.error.message }, { status: 500 });
      return NextResponse.json({ ok: true, seeded: rows.length });
    }

    const code = String(body.code ?? "").trim();
    if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

    const row = {
      code,
      label: body.label != null && String(body.label).trim() !== "" ? String(body.label).trim() : null,
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
      budget_amount:
        body.budget_amount != null && Number.isFinite(Number(body.budget_amount))
          ? Number(body.budget_amount)
          : null,
      is_active: body.is_active !== false,
    };

    const created = await supabase
      .from("planner_wbs")
      .upsert(row, { onConflict: "code" })
      .select("*")
      .single();
    if (created.error && created.error.message.toLowerCase().includes("budget_amount")) {
      const { budget_amount, ...fallback } = row;
      void budget_amount;
      const retry = await supabase
        .from("planner_wbs")
        .upsert(fallback, { onConflict: "code" })
        .select("*")
        .single();
      if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 });
      return NextResponse.json(retry.data);
    }
    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });
    return NextResponse.json(created.data);
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
    if ("code" in body) {
      const code = String(body.code ?? "").trim();
      if (!code) return NextResponse.json({ error: "code cannot be empty" }, { status: 400 });
      updates.code = code;
    }
    if ("label" in body) {
      updates.label =
        body.label != null && String(body.label).trim() !== "" ? String(body.label).trim() : null;
    }
    if ("sort_order" in body) {
      updates.sort_order = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
    }
    if ("budget_amount" in body) {
      updates.budget_amount =
        body.budget_amount != null && Number.isFinite(Number(body.budget_amount))
          ? Number(body.budget_amount)
          : null;
    }
    if ("is_active" in body) {
      updates.is_active = Boolean(body.is_active);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await supabase
      .from("planner_wbs")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (updated.error && updated.error.message.toLowerCase().includes("budget_amount")) {
      const { budget_amount, ...fallback } = updates;
      void budget_amount;
      const retry = await supabase
        .from("planner_wbs")
        .update(fallback)
        .eq("id", id)
        .select("*")
        .single();
      if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 });
      return NextResponse.json(retry.data);
    }
    if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
    return NextResponse.json(updated.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

