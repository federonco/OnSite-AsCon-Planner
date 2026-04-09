import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/** List crews (server-side; anon client often cannot read `crews` under RLS in production). */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("crews").select("id, name").order("name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ crews: data ?? [] });
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
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("crews")
      .insert({ name })
      .select("id, name")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
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
    const name = String(body.name ?? "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });

    const { data, error } = await supabase
      .from("crews")
      .update({ name })
      .eq("id", id)
      .select("id, name")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
