import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { DrainerSectionListItem } from "@/lib/planner-types";

export const dynamic = "force-dynamic";

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Creates a `drainer_sections` row — same field shape as OnSite-D `POST /api/drainer/sections`,
 * plus required `crew_id` so the section appears for this crew in the planner.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }
  const b = body as {
    crew_id?: unknown;
    name?: unknown;
    start_ch?: unknown;
    end_ch?: unknown;
    direction?: unknown;
  };
  const crewId = String(b.crew_id ?? "").trim();
  const name = String(b.name ?? "").trim();
  if (!crewId) {
    return NextResponse.json({ error: "crew_id is required" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Missing section name" }, { status: 400 });
  }

  const start_ch = numOrNull(b.start_ch);
  const end_ch = numOrNull(b.end_ch);
  const direction =
    b.direction != null && String(b.direction).trim() !== "" ? String(b.direction).trim() : null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("drainer_sections")
    .insert({
      crew_id: crewId,
      name,
      start_ch,
      end_ch,
      direction,
    })
    .select("id, name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const section: DrainerSectionListItem = {
    id: String((data as { id?: unknown }).id ?? ""),
    name: String((data as { name?: unknown }).name ?? "").trim() || name,
  };

  return NextResponse.json({ section });
}

/**
 * Lists rows from `drainer_sections` for one crew (`crew_id` query param).
 * Service role avoids anon RLS blocking reads in production.
 */
export async function GET(req: NextRequest) {
  const crewId = req.nextUrl.searchParams.get("crew_id");
  if (!crewId) {
    return NextResponse.json({ error: "crew_id is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("drainer_sections")
    .select("id, name")
    .eq("crew_id", crewId)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sections: DrainerSectionListItem[] = (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "").trim() || "Section",
  }));

  return NextResponse.json({ sections });
}
