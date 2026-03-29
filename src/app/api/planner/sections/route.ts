import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { DrainerSectionListItem } from "@/lib/planner-types";

export const dynamic = "force-dynamic";

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
