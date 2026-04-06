import { NextResponse } from "next/server";
import { hasEmailConfig } from "@/lib/email-config";

export const runtime = "nodejs";

export async function GET() {
  const ok = hasEmailConfig();
  return NextResponse.json({
    emailConfigured: ok,
    message: ok ? "RESEND_API_KEY is set" : "RESEND_API_KEY missing or invalid",
  });
}
