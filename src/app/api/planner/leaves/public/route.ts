import { NextRequest, NextResponse } from "next/server";
import { mapRowToPlannerPeopleLeave } from "@/lib/planner-leave-mapper";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isValidDateOnlyString, toDateOnly } from "@/lib/planner-date";
import { calendarSpanInclusiveDays } from "@/lib/planner-date";

export const dynamic = "force-dynamic";

const MAX_LEAVE_SPAN_DAYS = 120;

/** Validate QR token before showing the public form (no secrets returned). */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ valid: false, error: "token required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: tok, error } = await supabase
    .from("planner_leave_qr_tokens")
    .select("crew_id, label")
    .eq("token", token)
    .maybeSingle();

  if (error || !tok?.crew_id) {
    return NextResponse.json({ valid: false }, { status: 404 });
  }

  const { data: crewRow } = await supabase
    .from("crews")
    .select("name")
    .eq("id", tok.crew_id)
    .maybeSingle();

  return NextResponse.json({
    valid: true,
    crew_name: crewRow?.name ?? null,
    label: tok.label != null ? String(tok.label) : null,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const startRaw = toDateOnly(String((body as { start_date?: unknown }).start_date ?? ""));
  const endRaw = toDateOnly(String((body as { end_date?: unknown }).end_date ?? ""));
  const person_name =
    typeof (body as { person_name?: unknown }).person_name === "string"
      ? (body as { person_name: string }).person_name.trim().slice(0, 120)
      : "";

  if (!token || !isValidDateOnlyString(startRaw)) {
    return NextResponse.json({ error: "token and valid start_date are required" }, { status: 400 });
  }

  let end = isValidDateOnlyString(endRaw) ? endRaw : startRaw;
  if (end < startRaw) end = startRaw;

  const span = calendarSpanInclusiveDays(startRaw, end);
  if (span > MAX_LEAVE_SPAN_DAYS) {
    return NextResponse.json(
      { error: `Leave cannot exceed ${MAX_LEAVE_SPAN_DAYS} days` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("planner_leave_qr_tokens")
    .select("crew_id")
    .eq("token", token)
    .maybeSingle();

  if (tokenErr) {
    return NextResponse.json({ error: tokenErr.message }, { status: 500 });
  }
  if (!tokenRow?.crew_id) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const crew_id = String(tokenRow.crew_id);

  const { data: inserted, error: insertErr } = await supabase
    .from("planner_people_leaves")
    .insert({
      crew_id,
      start_date: startRaw,
      end_date: end,
      person_name: person_name || null,
    })
    .select("*")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const mapped = mapRowToPlannerPeopleLeave(inserted as Record<string, unknown>);
  if (!mapped) {
    return NextResponse.json({ error: "Invalid row after insert" }, { status: 500 });
  }

  return NextResponse.json(mapped);
}
