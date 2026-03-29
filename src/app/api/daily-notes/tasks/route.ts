import { NextRequest, NextResponse } from "next/server";
import { mapRowToDailyTask } from "@/lib/daily-task-mapper";
import { toTaskViewsForDate } from "@/lib/daily-task-visibility";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isValidDateOnlyString, toDateOnly } from "@/lib/planner-date";

export const dynamic = "force-dynamic";

function parseDateParam(v: string | null): string | null {
  if (!v) return null;
  const d = toDateOnly(v);
  return isValidDateOnlyString(d) ? d : null;
}

export async function GET(req: NextRequest) {
  const date = parseDateParam(req.nextUrl.searchParams.get("date"));
  if (!date) {
    return NextResponse.json({ error: "date=YYYY-MM-DD is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Predicate union must match isTaskVisibleOnDate() in @/lib/daily-task-visibility
  const [doneRes, pendingRes] = await Promise.all([
    supabase.from("daily_tasks").select("*").eq("completed_on_date", date),
    supabase.from("daily_tasks").select("*").is("completed_on_date", null).lte("origin_date", date),
  ]);

  const err = doneRes.error || pendingRes.error;
  if (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const rows = [...(doneRes.data ?? []), ...(pendingRes.data ?? [])];
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const id = String((r as { id?: unknown }).id ?? "");
    if (id) byId.set(id, r as Record<string, unknown>);
  }

  const tasks = Array.from(byId.values())
    .map((row) => mapRowToDailyTask(row))
    .filter((t): t is NonNullable<typeof t> => t != null);

  const views = toTaskViewsForDate(tasks, date);
  return NextResponse.json(views);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const origin_date = parseDateParam(typeof body.origin_date === "string" ? body.origin_date : null);
  if (!title || !origin_date) {
    return NextResponse.json({ error: "title and origin_date (YYYY-MM-DD) are required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("daily_tasks")
    .insert({ title, origin_date })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mapped = mapRowToDailyTask(data as Record<string, unknown>);
  if (!mapped) {
    return NextResponse.json({ error: "Invalid row after insert" }, { status: 500 });
  }
  return NextResponse.json(mapped);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  let completed_on_date: string | null = null;
  if (body.completed_on_date === null) {
    completed_on_date = null;
  } else if (typeof body.completed_on_date === "string") {
    const d = parseDateParam(body.completed_on_date);
    if (!d) {
      return NextResponse.json({ error: "completed_on_date must be YYYY-MM-DD or null" }, { status: 400 });
    }
    completed_on_date = d;
  } else {
    return NextResponse.json({ error: "completed_on_date is required (date or null)" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: existing, error: fetchErr } = await supabase
    .from("daily_tasks")
    .select("origin_date")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: fetchErr?.message || "Task not found" }, { status: fetchErr ? 500 : 404 });
  }

  const origin = toDateOnly(String((existing as { origin_date: unknown }).origin_date));
  if (completed_on_date != null && completed_on_date < origin) {
    return NextResponse.json(
      { error: "completed_on_date cannot be before origin_date" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("daily_tasks")
    .update({ completed_on_date })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mapped = mapRowToDailyTask(data as Record<string, unknown>);
  if (!mapped) {
    return NextResponse.json({ error: "Invalid row after update" }, { status: 500 });
  }
  return NextResponse.json(mapped);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("daily_tasks").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
