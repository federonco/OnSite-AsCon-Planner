import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const sectionId = req.nextUrl.searchParams.get("section_id");

  if (!sectionId) {
    return NextResponse.json({ error: "section_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("alignment_checkpoints")
    .select("*")
    .eq("section_id", sectionId)
    .order("chainage", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const { section_id, chainage, lat, lng, type, label, notes } = body;

  if (!section_id || chainage == null || !lat || !lng || !type || !label) {
    return NextResponse.json(
      { error: "section_id, chainage, lat, lng, type, and label are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("alignment_checkpoints")
    .insert({ section_id, chainage, lat, lng, type, label, notes: notes || null })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("alignment_checkpoints")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
