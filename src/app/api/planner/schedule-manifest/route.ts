import { NextRequest, NextResponse } from "next/server";
import { mapRowToPlannerActivity } from "@/lib/planner-activity-mapper";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Stable JSON snapshot of activities for external schedulers (MS Project adapters, BIM extensions, etc.).
 * Each row uses `id` (UUID) as the canonical external key.
 */
export async function GET(req: NextRequest) {
  const crewId = req.nextUrl.searchParams.get("crew_id");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("planner_activities")
    .select("*, crews(name)")
    .order("start_date", { ascending: true })
    .order("sort_order", { ascending: true });

  if (crewId) {
    query = query.eq("crew_id", crewId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const activities = (data || []).map((row) => {
    const { crews, ...rest } = row as Record<string, unknown>;
    return mapRowToPlannerActivity({
      ...rest,
      crew_name: (crews as { name: string } | null)?.name ?? null,
    });
  });

  const slim = activities.map((a) => ({
    id: a.id,
    name: a.name,
    start_date: a.start_date,
    end_date: a.end_date,
    crew_id: a.crew_id,
    drainer_section_id: a.drainer_section_id,
    drainer_segment_id: a.drainer_segment_id,
    wbs_code: a.wbs_code,
    status: a.status,
    progress_percent: a.progress_percent,
  }));

  return NextResponse.json({
    schema: "onsite.planner.schedule_manifest.v1",
    generated_at: new Date().toISOString(),
    activities: slim,
  });
}
