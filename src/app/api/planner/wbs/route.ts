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
          is_active: true,
        }))
        .filter((r) => r.code);

      if (rows.length === 0) return NextResponse.json({ ok: true, seeded: 0 });

      // Use deterministic matching in code because `code` is unique in DB.
      const { error } = await supabase.from("planner_wbs").upsert(rows, { onConflict: "code" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, seeded: rows.length });
    }

    const code = String(body.code ?? "").trim();
    if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

    const row = {
      code,
      label: body.label != null && String(body.label).trim() !== "" ? String(body.label).trim() : null,
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
      is_active: body.is_active !== false,
    };

    const { data, error } = await supabase
      .from("planner_wbs")
      .upsert(row, { onConflict: "code" })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

