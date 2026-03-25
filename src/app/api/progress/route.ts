import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { SEGMENT_STATUSES } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const { segment_id, status, updated_by } = body;

  if (!segment_id || !status) {
    return NextResponse.json(
      { error: "segment_id and status are required" },
      { status: 400 }
    );
  }

  if (!SEGMENT_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${SEGMENT_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("alignment_progress")
    .insert({
      segment_id,
      status,
      status_date: new Date().toISOString().split("T")[0],
      updated_by: updated_by || "admin",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/** Batch update: change status for multiple segments at once */
export async function PUT(req: NextRequest) {
  const body = await req.json();

  const { segment_ids, status, updated_by } = body;

  if (!Array.isArray(segment_ids) || segment_ids.length === 0 || !status) {
    return NextResponse.json(
      { error: "segment_ids[] and status are required" },
      { status: 400 }
    );
  }

  if (!SEGMENT_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${SEGMENT_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const rows = segment_ids.map((id: string) => ({
    segment_id: id,
    status,
    status_date: new Date().toISOString().split("T")[0],
    updated_by: updated_by || "admin",
  }));

  const { data, error } = await supabase
    .from("alignment_progress")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: data?.length || 0 });
}
