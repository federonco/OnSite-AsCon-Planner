# SKILL: Email Sender — readX + PDF
> Patrón probado en producción (OnSite-D). Stack: Next.js App Router · nodemailer · Resend SMTP · Puppeteer · pdf-lib.

---

## Cuándo usar este skill

Cuando el usuario pida:
- Enviar un reporte, calendario, Gantt, o cualquier documento como PDF adjunto por email
- Generar un PDF server-side desde HTML y mandarlo por email
- Implementar notificaciones automáticas con PDF adjunto
- Replicar el sistema de email de OnSite-D en otra app del ecosistema OnSite

---

## Stack y dependencias

```json
{
  "nodemailer": "^8.0.1",
  "@types/nodemailer": "^6.4.x",
  "puppeteer-core": "^24.x",
  "pdf-lib": "^1.17.1"
}
```

**Variables de entorno requeridas:**
```
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM=OnSite-App <info@readx.com.au>   # opcional, tiene default
REPORT_DEFAULT_EMAIL=admin@example.com        # opcional fallback recipient
NEXT_PUBLIC_SITE_URL=https://myapp.vercel.app
```

---

## Arquitectura del sistema (3 capas)

```
lib/email-config.ts              ← Infraestructura (transporter, from, logo, firma)
lib/reporting/[report]-html.ts   ← Template HTML puro (sin JS) para Puppeteer
lib/reporting/[report]-pdf.ts    ← Puppeteer wrapper → Buffer
app/api/[app]/report/email/route.ts  ← API endpoint (genera PDF + envía email)
```

---

## Capa 1 — `lib/email-config.ts` (copiar sin modificar)

```typescript
import { readFileSync } from "fs";
import { join } from "path";
import nodemailer from "nodemailer";

export const EMAIL_FROM_DEFAULT = "OnSite <info@readx.com.au>";

export const RESEND_SMTP = {
  host: "smtp.resend.com",
  port: 465,
  user: "resend",
};

/** Crea el transporter de nodemailer para Resend SMTP. */
export function createEmailTransporter() {
  const pass = process.env.RESEND_API_KEY?.trim();
  if (!pass) throw new Error("RESEND_API_KEY required for email");
  return nodemailer.createTransport({
    host: RESEND_SMTP.host,
    port: RESEND_SMTP.port,
    secure: true,
    auth: { user: RESEND_SMTP.user, pass },
  });
}

/** Guard — verificar antes de intentar enviar. */
export function hasEmailConfig(): boolean {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return false;
  if (key === "..." || key.length < 10) return false;
  return true;
}

/** From address. Priority: RESEND_FROM > SMTP_FROM > ALERT_FROM_EMAIL > default */
export function getEmailFrom(): string {
  return (
    process.env.RESEND_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.ALERT_FROM_EMAIL?.trim() ||
    EMAIL_FROM_DEFAULT
  );
}

export const LOGO_CID = "readx-logo@onsite";

/** Adjunto inline del logo. Usar img src="cid:readx-logo@onsite" en el HTML. */
export function getLogoAttachment(): { filename: string; content: Buffer; cid: string } | null {
  try {
    const logoPath = join(process.cwd(), "public", "readx-logo.png");
    const content = readFileSync(logoPath);
    return { filename: "readx-logo.png", content, cid: LOGO_CID };
  } catch {
    return null;
  }
}

/** Firma HTML compartida para todos los emails. */
export function getEmailSignatureHtml(logoSrc: string): string {
  return `
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 32px 0;" />
  <table cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif;">
    <tr>
      <td style="padding-right: 16px; vertical-align: middle;">
        <a href="https://www.readx.com.au" target="_blank" style="display:block;">
          <img src="${logoSrc}" alt="readX" width="80" style="display:block;" />
        </a>
      </td>
      <td style="vertical-align: middle; border-left: 2px solid #1a5276; padding-left: 16px;">
        <p style="margin:0; font-size: 15px; font-weight: bold; color: #1a5276;">readX Team</p>
        <p style="margin:4px 0 0; font-size: 13px; color: #555;">OnSite Ecosystem</p>
        <p style="margin:4px 0 0; font-size: 12px;">
          <a href="https://www.readx.com.au" target="_blank"
             style="color: #1a5276; text-decoration: none;">www.readX.com.au</a>
        </p>
      </td>
    </tr>
  </table>`;
}
```

---

## Capa 2 — Template HTML para Puppeteer

### Reglas críticas para HTML que va a Puppeteer

1. **Sin JavaScript** — Puppeteer renderiza el HTML estático, no ejecuta lógica
2. **Layout table-based** para PDFs complejos (más predecible que flexbox/grid en print)
3. **`@page { size: A4 landscape/portrait; }`** al inicio del CSS
4. **`box-sizing: border-box`** en `*`
5. **Fuentes seguras**: Arial, sans-serif (sin Google Fonts — no hay internet en Puppeteer serverless)
6. **Colores inline** en elementos críticos — no confiar en variables CSS
7. **Imágenes**: usar data URLs (base64) o `cid:` para logos inlineados

### Template base para Gantt / calendario

```typescript
// lib/reporting/[report-name]-html.ts

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ReportTemplateOptions {
  title: string;
  subtitle?: string;
  generatedAt?: string;
  logoSrc?: string; // data URL o cid: URL
}

export function buildReportHtml(
  data: YourDataType[],
  options: ReportTemplateOptions
): string {
  const { title, subtitle, generatedAt, logoSrc } = options;

  // Construir filas HTML desde data
  const rowsHtml = data.map((item) => `
    <tr>
      <td style="padding: 4pt 6pt; border: 0.5pt solid #ccc;">${escapeHtml(item.name)}</td>
      <td style="padding: 4pt 6pt; border: 0.5pt solid #ccc;">${escapeHtml(item.value)}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 15mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      font-size: 8pt;
      color: #1a1a1a;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12pt;
      padding-bottom: 8pt;
      border-bottom: 1.5pt solid #1a5276;
    }
    .title { font-size: 14pt; font-weight: bold; color: #1a5276; }
    .subtitle { font-size: 9pt; color: #555; margin-top: 2pt; }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      background: #1a5276;
      color: #fff;
      padding: 4pt 6pt;
      font-size: 7pt;
      text-align: left;
    }
    tr:nth-child(even) td { background: #f5f7fb; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}
    </div>
    ${logoSrc ? `<img src="${logoSrc}" alt="Logo" height="40" style="display:block;" />` : ""}
  </div>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Value</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  ${generatedAt ? `<p style="margin-top: 12pt; font-size: 7pt; color: #999;">Generated: ${escapeHtml(generatedAt)}</p>` : ""}
</body>
</html>`;
}
```

### Template Gantt/Lookahead (barras horizontales)

```typescript
// Para reportes de tipo calendario/Gantt donde las actividades son barras

export function buildGanttHtml(
  activities: Activity[],
  weekDates: Date[],       // array de lunes de cada semana en el horizonte
  options: ReportTemplateOptions
): string {
  const totalDays = weekDates.length * 7;
  const horizonStart = weekDates[0];

  function barStyle(startDate: Date, endDate: Date, color: string): string {
    const startOffset = Math.max(0, differenceInDays(startDate, horizonStart));
    const duration = Math.min(
      differenceInDays(endDate, startDate) + 1,
      totalDays - startOffset
    );
    const left = (startOffset / totalDays) * 100;
    const width = (duration / totalDays) * 100;
    return `left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;background:${color};`;
  }

  const weekHeadersHtml = weekDates.map((d) =>
    `<th style="width:${(1/weekDates.length*100).toFixed(2)}%; font-size:6.5pt; font-weight:bold; color:#fff; background:#1a5276; padding:3pt; border:0.5pt solid #fff; text-align:center;">
      ${format(d, "dd MMM")}
    </th>`
  ).join("");

  const rowsHtml = activities.map((act) => {
    const color = STATUS_COLORS[act.status] ?? "#999";
    return `
    <tr>
      <td style="padding:3pt 5pt; border:0.5pt solid #ddd; font-size:7pt; white-space:nowrap; max-width:120pt; overflow:hidden;">
        ${escapeHtml(act.name)}
      </td>
      <td style="position:relative; border:0.5pt solid #ddd; height:16pt;">
        <div style="position:absolute; top:2pt; height:12pt; border-radius:2pt; ${barStyle(new Date(act.start_date), new Date(act.end_date), color)}">
          <span style="padding:1pt 3pt; font-size:6pt; color:#fff; white-space:nowrap; overflow:hidden;">
            ${escapeHtml(act.name)}
          </span>
        </div>
      </td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; font-size: 8pt; color: #222; }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>
  <div style="margin-bottom:10pt; border-bottom:1.5pt solid #1a5276; padding-bottom:6pt; display:flex; justify-content:space-between;">
    <div>
      <div style="font-size:13pt; font-weight:bold; color:#1a5276;">${escapeHtml(options.title)}</div>
      ${options.subtitle ? `<div style="font-size:8pt; color:#555;">${escapeHtml(options.subtitle)}</div>` : ""}
    </div>
    ${options.logoSrc ? `<img src="${options.logoSrc}" height="36" style="display:block;" />` : ""}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:120pt; background:#1a5276; color:#fff; padding:3pt 5pt; font-size:7pt; text-align:left; border:0.5pt solid #fff;">Activity</th>
        ${weekHeadersHtml}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  ${options.generatedAt ? `<p style="margin-top:8pt; font-size:6.5pt; color:#aaa;">Generated: ${escapeHtml(options.generatedAt)}</p>` : ""}
</body>
</html>`;
}
```

---

## Capa 3 — Puppeteer wrapper

```typescript
// lib/reporting/[report-name]-pdf.ts
import { launch } from "puppeteer-core";
import chromium from "@sparticuz/chromium"; // para Vercel/Lambda

export async function generateReportPdf(html: string): Promise<Buffer> {
  const browser = await launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    landscape: true,           // cambiar a false si es portrait
    printBackground: true,
    margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
  });

  await browser.close();
  return Buffer.from(pdfBuffer);
}
```

**Nota:** En Vercel necesitás `@sparticuz/chromium` en lugar de instalar Chrome manualmente. Agregar a deps:
```json
"@sparticuz/chromium": "^131.x",
"puppeteer-core": "^24.x"
```

Y en `vercel.json`:
```json
{
  "functions": {
    "app/api/*/report/*/route.ts": {
      "memory": 1024,
      "maxDuration": 30
    }
  }
}
```

---

## Capa 4 — API route completa

```typescript
// app/api/[app]/report/[report-name]/email/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  createEmailTransporter,
  getEmailFrom,
  getEmailSignatureHtml,
  getLogoAttachment,
  hasEmailConfig,
  LOGO_CID,
} from "@/lib/email-config";
import { buildReportHtml } from "@/lib/reporting/[report-name]-html";
import { generateReportPdf } from "@/lib/reporting/[report-name]-pdf";

export const runtime = "nodejs"; // CRÍTICO — no edge

export async function POST(request: NextRequest) {
  // 1. Auth (adaptar al sistema de auth de la app)
  // const { user, token } = await getUserFromRequest(request);
  // if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Parsear body
  const body = await request.json();
  const { recipientEmail, ...reportParams } = body;

  if (!recipientEmail) {
    return NextResponse.json({ error: "recipientEmail required" }, { status: 400 });
  }

  // 3. Guard de email config
  if (!hasEmailConfig()) {
    return NextResponse.json({ error: "RESEND_API_KEY required" }, { status: 500 });
  }

  // 4. Fetch data desde Supabase (adaptar)
  // const { data, error } = await supabase.from("...").select("*").eq("...", reportParams.id);
  // if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 5. Preparar logo para inline en PDF
  const logoAttachment = getLogoAttachment();
  const logoSrc = logoAttachment
    ? `cid:${LOGO_CID}`
    : `${process.env.NEXT_PUBLIC_SITE_URL}/readx-logo.png`;

  // 6. Generar HTML → PDF
  let pdfBuffer: Buffer;
  let fileName: string;
  try {
    const html = buildReportHtml(data, {
      title: "Reporte OnSite",
      subtitle: `Generado el ${new Date().toLocaleDateString("en-AU")}`,
      generatedAt: new Date().toISOString(),
      logoSrc,
    });
    pdfBuffer = await generateReportPdf(html);
    fileName = `OnSite-Report_${Date.now()}.pdf`;
  } catch (err) {
    console.error("[Report] PDF generation failed:", err);
    return NextResponse.json(
      { error: `PDF generation failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  // 7. Construir attachments
  const attachments: Array<{ filename: string; content: Buffer; contentType?: string; cid?: string }> = [
    { filename: fileName, content: pdfBuffer, contentType: "application/pdf" },
  ];
  if (logoAttachment) attachments.unshift(logoAttachment); // logo inline primero

  // 8. HTML del body del email
  const htmlBody = `
<div style="font-family: Arial, sans-serif; color: #333; padding: 24px;">
  <h2 style="color: #1a5276;">OnSite Report</h2>
  <p>Please find the attached report.</p>
  <p style="color: #666; font-size: 13px;">Generated automatically by OnSite.</p>
  ${getEmailSignatureHtml(logoSrc)}
</div>`;

  // 9. Enviar
  try {
    const transporter = createEmailTransporter();
    await transporter.sendMail({
      from: getEmailFrom(),
      to: recipientEmail.trim(),
      subject: `OnSite Report — ${new Date().toLocaleDateString("en-AU")}`,
      text: "Please find the attached OnSite report.",
      html: htmlBody,
      attachments,
    });
    return NextResponse.json({ ok: true, message: "Email sent" });
  } catch (err) {
    console.error("[Report] sendMail failed:", err);
    return NextResponse.json(
      { error: "Email failed. PDF was generated but could not be sent." },
      { status: 500 }
    );
  }
}
```

---

## Variante: Merge de múltiples PDFs en uno (pdf-lib)

```typescript
import { PDFDocument } from "pdf-lib";

export async function mergePdfs(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const pdf = await PDFDocument.load(buf);
    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return Buffer.from(await merged.save());
}
```

Usar cuando necesitás generar N PDFs (ej: una por crew) y mandar todo en un adjunto.

---

## Health check endpoint

```typescript
// app/api/health/email/route.ts
import { NextResponse } from "next/server";
import { hasEmailConfig } from "@/lib/email-config";

export async function GET() {
  const ok = hasEmailConfig();
  return NextResponse.json({
    emailConfigured: ok,
    message: ok
      ? "RESEND_API_KEY is set"
      : "RESEND_API_KEY missing or invalid",
  });
}
```

---

## Checklist de implementación

- [ ] Agregar `nodemailer`, `puppeteer-core`, `@sparticuz/chromium`, `pdf-lib` a `package.json`
- [ ] Copiar `lib/email-config.ts` sin modificar
- [ ] Crear `lib/reporting/[nombre]-html.ts` con el template HTML
- [ ] Crear `lib/reporting/[nombre]-pdf.ts` con el Puppeteer wrapper
- [ ] Crear `app/api/[app]/report/email/route.ts` con `export const runtime = "nodejs"`
- [ ] Subir `public/readx-logo.png` si no existe
- [ ] Agregar `RESEND_API_KEY` en Vercel Environment Variables
- [ ] Ajustar `vercel.json` con `memory: 1024` y `maxDuration: 30` para los routes de PDF
- [ ] Probar con `GET /api/health/email` antes de probar el PDF

---

## Errores comunes y soluciones

| Error | Causa | Solución |
|---|---|---|
| `RESEND_API_KEY required` | Env var no seteada | Agregar en Vercel dashboard o `.env.local` |
| PDF vacío / en blanco | `waitUntil: "networkidle0"` fallando | Cambiar a `"domcontentloaded"` |
| Fuentes feas en PDF | Puppeteer no tiene acceso a Google Fonts | Usar solo `Arial, sans-serif` |
| Timeout en Vercel | `maxDuration` por defecto (10s) insuficiente | `maxDuration: 30` en `vercel.json` |
| `runtime = "edge"` error | edge runtime no soporta nodemailer/Puppeteer | `export const runtime = "nodejs"` SIEMPRE |
| Logo no aparece en PDF | CID no resuelto | Verificar que `getLogoAttachment()` retorna el attachment y se pasa en `attachments[]` |
| PDF se abre en browser en vez de descargarse | Header faltante | `Content-Disposition: attachment; filename="..."` en el route de descarga (no aplica al email) |

---

## Referencia — archivos fuente en OnSite-D

```
OnSite-D/lib/email-config.ts                              ← Fuente de verdad
OnSite-D/lib/section-qr-email.ts                          ← Ejemplo: email con imagen inline (QR)
OnSite-D/lib/checkpoint-notify.ts                         ← Ejemplo: email de alerta sin PDF
OnSite-D/app/api/drainer/report/itr-pla-001/email/route.ts     ← Ejemplo: email con 1 PDF
OnSite-D/app/api/drainer/report/itr-pla-001/email-all/route.ts ← Ejemplo: merge N PDFs + email
OnSite-D/app/api/drainer/sections/audit/email/route.ts         ← Ejemplo más simple
OnSite-D/lib/reporting/itr-pla-001/itr-pla-001-html-template.ts ← Template HTML complejo (tabla ITR)
```
