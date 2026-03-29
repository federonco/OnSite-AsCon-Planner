import { NextRequest, NextResponse } from "next/server";
import { mapRowToPlannerActivity } from "@/lib/planner-activity-mapper";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const params = req.nextUrl.searchParams;
  const crewId = params.get("crew_id");
  const startDate = params.get("start_date");
  const endDate = params.get("end_date");
  const statusFilter = params.get("status");

  let query = supabase
    .from("planner_activities")
    .select("*, crews(name)")
    .order("start_date", { ascending: true })
    .order("sort_order", { ascending: true });

  if (crewId) {
    query = query.eq("crew_id", crewId);
  }

  // Overlap filter: activity overlaps [startDate, endDate]
  if (startDate && endDate) {
    query = query.lte("start_date", endDate).gte("end_date", startDate);
  } else if (startDate) {
    query = query.gte("end_date", startDate);
  } else if (endDate) {
    query = query.lte("start_date", endDate);
  }

  if (statusFilter) {
    const statuses = statusFilter.split(",").map((s) => s.trim());
    query = query.in("status", statuses);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten crew name from join; drop rows the mapper rejects (bad dates / ids)
  const activities = (data || [])
    .map((row) => {
      const { crews, ...rest } = row as Record<string, unknown>;
      return mapRowToPlannerActivity({
        ...rest,
        crew_name: (crews as { name: string } | null)?.name ?? null,
      });
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  return NextResponse.json(activities);
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { crew_id, name, start_date, end_date } = body;
  const sectionId =
    body.drainer_section_id != null ? String(body.drainer_section_id).trim() : "";
  if (!crew_id || !name || !start_date || !end_date) {
    return NextResponse.json(
      { error: "crew_id, name, start_date, and end_date are required" },
      { status: 400 }
    );
  }
  if (!sectionId) {
    return NextResponse.json({ error: "drainer_section_id is required" }, { status: 400 });
  }

  const row = {
    crew_id,
    name,
    start_date,
    end_date,
    status: body.status || "planned",
    drainer_section_id: sectionId,
    drainer_segment_id: body.drainer_segment_id || null,
    notes: body.notes || null,
    wbs_code: body.wbs_code || null,
    is_baseline: body.is_baseline || false,
    parent_activity_id: body.parent_activity_id || null,
    sort_order: body.sort_order ?? 0,
  };

  const { data, error } = await supabase
    .from("planner_activities")
    .insert(row)
    .select("*, crews(name)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { crews, ...rest } = data as Record<string, unknown>;
  const mapped = mapRowToPlannerActivity({
    ...rest,
    crew_name: (crews as { name: string } | null)?.name ?? null,
  });
  if (!mapped) {
    return NextResponse.json({ error: "Invalid activity payload after save" }, { status: 500 });
  }
  return NextResponse.json(mapped);
}

export async function PUT(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { id, ...updates } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Only allow updating specific fields
  const allowed = [
    "name", "start_date", "end_date", "status", "notes",
    "wbs_code", "sort_order", "progress_percent",
    "drainer_section_id", "drainer_segment_id",
  ];
  const filtered: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) {
      filtered[key] = updates[key];
    }
  }

  if (
    "drainer_section_id" in filtered &&
    (filtered.drainer_section_id == null ||
      String(filtered.drainer_section_id).trim() === "")
  ) {
    return NextResponse.json(
      { error: "drainer_section_id cannot be empty when provided" },
      { status: 400 }
    );
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("planner_activities")
    .update(filtered)
    .eq("id", id)
    .select("*, crews(name)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { crews, ...rest } = data as Record<string, unknown>;
  const mapped = mapRowToPlannerActivity({
    ...rest,
    crew_name: (crews as { name: string } | null)?.name ?? null,
  });
  if (!mapped) {
    return NextResponse.json({ error: "Invalid activity payload after update" }, { status: 500 });
  }
  return NextResponse.json(mapped);
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("planner_activities")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
