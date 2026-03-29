import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/** List crews (server-side; anon client often cannot read `crews` under RLS in production). */
export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("crews").select("id, name").order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ crews: data ?? [] });
}
