import { NextRequest, NextResponse } from "next/server";
import { mapRowToPlannerPeopleLeave } from "@/lib/planner-leave-mapper";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const crewId = req.nextUrl.searchParams.get("crew_id");

    let query = supabase
      .from("planner_people_leaves")
      .select("*")
      .order("start_date", { ascending: true });

    if (crewId) {
      query = query.eq("crew_id", crewId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const leaves = (data || [])
      .map((row) => mapRowToPlannerPeopleLeave(row as Record<string, unknown>))
      .filter((l): l is NonNullable<typeof l> => l !== null);

    return NextResponse.json(leaves);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
