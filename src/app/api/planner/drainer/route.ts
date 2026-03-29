import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const sectionId = req.nextUrl.searchParams.get("section_id");

  if (!sectionId) {
    return NextResponse.json({ error: "section_id is required" }, { status: 400 });
  }

  // Fetch all segments for the section
  const { data: segments, error: segError } = await supabase
    .from("alignment_segments")
    .select("id")
    .eq("section_id", sectionId);

  if (segError) {
    return NextResponse.json({ error: segError.message }, { status: 500 });
  }

  const segmentIds = (segments || []).map((s) => s.id);
  const totalSegments = segmentIds.length;

  if (totalSegments === 0) {
    return NextResponse.json({
      section_id: sectionId,
      total_segments: 0,
      installed_count: 0,
      backfilled_count: 0,
      progress_percent: 0,
    });
  }

  // Fetch latest progress per segment
  const { data: progress, error: progError } = await supabase
    .from("alignment_progress")
    .select("segment_id, status")
    .in("segment_id", segmentIds)
    .order("created_at", { ascending: false });

  if (progError) {
    return NextResponse.json({ error: progError.message }, { status: 500 });
  }

  // Resolve latest status per segment
  const latestStatus = new Map<string, string>();
  for (const p of progress || []) {
    if (!latestStatus.has(p.segment_id)) {
      latestStatus.set(p.segment_id, p.status);
    }
  }

  let installedCount = 0;
  let backfilledCount = 0;
  latestStatus.forEach((status) => {
    if (status === "installed") installedCount++;
    else if (status === "backfilled") backfilledCount++;
  });

  // Progress = (installed + backfilled) / total * 100
  const progressPercent = Math.round(
    ((installedCount + backfilledCount) / totalSegments) * 100
  );

  return NextResponse.json({
    section_id: sectionId,
    total_segments: totalSegments,
    installed_count: installedCount,
    backfilled_count: backfilledCount,
    progress_percent: progressPercent,
  });
}
