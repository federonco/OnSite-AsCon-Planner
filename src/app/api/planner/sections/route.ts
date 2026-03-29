import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/** List drainer_sections for a crew (server-side; avoids client RLS gaps). */
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

  return NextResponse.json({ sections: data ?? [] });
}
