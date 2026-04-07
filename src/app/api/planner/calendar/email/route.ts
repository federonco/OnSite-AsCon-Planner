import { NextRequest, NextResponse } from "next/server";
import {
  createEmailTransporter,
  getEmailFrom,
  getEmailSignatureHtml,
  getLogoAttachment,
  hasEmailConfig,
  LOGO_CID,
} from "@/lib/email-config";
import { buildPlannerCalendarPdfHtml } from "@/lib/reporting/planner-calendar-email-html";
import { generatePlannerCalendarPdf } from "@/lib/reporting/planner-calendar-pdf";
import type { PlannerActivity, PlannerPeopleLeave } from "@/lib/planner-types";

export const runtime = "nodejs";
export const maxDuration = 30;

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }

  const b = body as {
    recipientEmail?: unknown;
    horizonWeeks?: unknown;
    hideWeekends?: unknown;
    viewAnchorDate?: unknown;
    activities?: unknown;
    peopleLeaves?: unknown;
    crewMap?: unknown;
  };

  const recipientRaw =
    (typeof b.recipientEmail === "string" && b.recipientEmail.trim()) ||
    process.env.REPORT_DEFAULT_EMAIL?.trim() ||
    "";

  if (!recipientRaw || !isValidEmail(recipientRaw)) {
    return NextResponse.json(
      { error: "recipientEmail required (valid address) or set REPORT_DEFAULT_EMAIL" },
      { status: 400 }
    );
  }

  if (!hasEmailConfig()) {
    return NextResponse.json(
      { error: "Email not configured: set RESEND_API_KEY on the server" },
      { status: 500 }
    );
  }

  const horizonWeeks = Number(b.horizonWeeks);
  if (![2, 4, 6, 8].includes(horizonWeeks)) {
    return NextResponse.json({ error: "horizonWeeks must be 2, 4, 6, or 8" }, { status: 400 });
  }

  const hideWeekends = Boolean(b.hideWeekends);
  const viewAnchorDate =
    typeof b.viewAnchorDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.viewAnchorDate)
      ? b.viewAnchorDate
      : new Date().toISOString().slice(0, 10);

  const activities = Array.isArray(b.activities) ? (b.activities as PlannerActivity[]) : [];
  const peopleLeaves = Array.isArray(b.peopleLeaves)
    ? (b.peopleLeaves as PlannerPeopleLeave[])
    : [];
  const crewMapRaw =
    b.crewMap && typeof b.crewMap === "object" && !Array.isArray(b.crewMap)
      ? (b.crewMap as Record<string, unknown>)
      : {};
  const crewMap: Record<string, string> = Object.fromEntries(
    Object.entries(crewMapRaw).map(([crewId, value]) => [
      crewId,
      typeof value === "string"
        ? value
        : value && typeof value === "object" && "name" in value
          ? String((value as { name?: unknown }).name ?? "—")
          : "—",
    ])
  );

  const logoAttachment = getLogoAttachment();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "";
  const pdfLogoSrc = logoAttachment
    ? `data:image/png;base64,${logoAttachment.content.toString("base64")}`
    : siteUrl
      ? `${siteUrl}/readx-logo.png`
      : undefined;
  const emailLogoSrc = logoAttachment
    ? `cid:${LOGO_CID}`
    : siteUrl
      ? `${siteUrl}/readx-logo.png`
      : undefined;

  const reportTitle = `${horizonWeeks} week look ahead`;
  let pdfBuffer: Buffer;
  try {
    const html = buildPlannerCalendarPdfHtml({
      horizonWeeks,
      hideWeekends,
      viewAnchorDate,
      activities,
      peopleLeaves,
      crewNames: crewMap,
      title: reportTitle,
      logoSrc: pdfLogoSrc,
    });
    pdfBuffer = await generatePlannerCalendarPdf(html);
  } catch (err) {
    console.error("[planner/calendar/email] PDF failed:", err);
    return NextResponse.json(
      { error: `PDF generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  const fileName = `${reportTitle.replace(/\s+/g, "-")}_${new Date().toISOString().slice(0, 10)}.pdf`;
  const attachments: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
    cid?: string;
  }> = [{ filename: fileName, content: pdfBuffer, contentType: "application/pdf" }];
  if (logoAttachment) attachments.unshift(logoAttachment);

  const signatureBlock = emailLogoSrc
    ? getEmailSignatureHtml(emailLogoSrc)
    : `<p style="margin-top:24px;font-size:12px;color:#666;">OnSite Planner · readX</p>`;

  const htmlBody = `
<div style="font-family: Arial, sans-serif; color: #333; padding: 24px;">
  <h2 style="color: #1a5276;">${reportTitle}</h2>
  <p>Please find the planning calendar attached (A3 landscape).</p>
  <p style="color: #666; font-size: 13px;">Horizon: ${horizonWeeks} weeks · Week including ${viewAnchorDate}</p>
  ${signatureBlock}
</div>`;

  try {
    const transporter = createEmailTransporter();
    await transporter.sendMail({
      from: getEmailFrom(),
      to: recipientRaw,
      subject: `${reportTitle} — ${new Date().toLocaleDateString("en-AU")}`,
      text: `Please find the attached ${reportTitle} PDF.`,
      html: htmlBody,
      attachments,
    });
    return NextResponse.json({ ok: true, message: "Email sent" });
  } catch (err) {
    console.error("[planner/calendar/email] sendMail failed:", err);
    return NextResponse.json(
      { error: "Email send failed. PDF was generated but could not be sent." },
      { status: 500 }
    );
  }
}
