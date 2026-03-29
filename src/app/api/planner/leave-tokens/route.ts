import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const crew_id =
    body && typeof body === "object" && typeof (body as { crew_id?: unknown }).crew_id === "string"
      ? (body as { crew_id: string }).crew_id.trim()
      : "";
  if (!crew_id) {
    return NextResponse.json({ error: "crew_id is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: crewRow, error: crewErr } = await supabase
    .from("crews")
    .select("id")
    .eq("id", crew_id)
    .maybeSingle();

  if (crewErr || !crewRow?.id) {
    return NextResponse.json({ error: "Invalid crew" }, { status: 400 });
  }

  const label =
    body &&
    typeof body === "object" &&
    typeof (body as { label?: unknown }).label === "string"
      ? (body as { label: string }).label.trim().slice(0, 80)
      : "";

  const token = randomBytes(18).toString("base64url");
  const { error: insErr } = await supabase.from("planner_leave_qr_tokens").insert({
    token,
    crew_id,
    label: label || null,
  });

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const path = `/planner/leave/${encodeURIComponent(token)}`;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const url = host ? `${proto}://${host}${path}` : path;

  return NextResponse.json({ token, path, url });
}
