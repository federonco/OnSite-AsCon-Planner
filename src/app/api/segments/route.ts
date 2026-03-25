import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const sectionId = req.nextUrl.searchParams.get("section_id");

  if (!sectionId) {
    return NextResponse.json({ error: "section_id is required" }, { status: 400 });
  }

  // Fetch segments with their latest status
  const { data: segments, error: segError } = await supabase
    .from("alignment_segments")
    .select("*")
    .eq("section_id", sectionId)
    .order("segment_number", { ascending: true });

  if (segError) {
    return NextResponse.json({ error: segError.message }, { status: 500 });
  }

  // Fetch latest progress for each segment
  const segmentIds = (segments || []).map((s) => s.id);
  const { data: progress, error: progError } = await supabase
    .from("alignment_progress")
    .select("*")
    .in("segment_id", segmentIds)
    .order("created_at", { ascending: false });

  if (progError) {
    return NextResponse.json({ error: progError.message }, { status: 500 });
  }

  // Build latest status map (latest entry per segment)
  const latestStatus = new Map<string, { status: string; status_date: string }>();
  for (const p of progress || []) {
    if (!latestStatus.has(p.segment_id)) {
      latestStatus.set(p.segment_id, { status: p.status, status_date: p.status_date });
    }
  }

  // Merge segments with status
  const segmentsWithStatus = (segments || []).map((seg) => {
    const statusEntry = latestStatus.get(seg.id);
    return {
      ...seg,
      status: statusEntry?.status || "pending",
      status_date: statusEntry?.status_date || null,
    };
  });

  return NextResponse.json(segmentsWithStatus);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!Array.isArray(body.segments) || !body.section_id) {
    return NextResponse.json(
      { error: "section_id and segments[] are required" },
      { status: 400 }
    );
  }

  const rows = body.segments.map((seg: Record<string, unknown>) => ({
    section_id: body.section_id,
    segment_number: seg.segment_number,
    chainage_start: seg.chainage_start,
    chainage_end: seg.chainage_end,
    lat_start: seg.lat_start,
    lng_start: seg.lng_start,
    lat_end: seg.lat_end,
    lng_end: seg.lng_end,
    pipe_type: seg.pipe_type,
  }));

  const { data, error } = await supabase
    .from("alignment_segments")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: data?.length || 0, segments: data });
}
