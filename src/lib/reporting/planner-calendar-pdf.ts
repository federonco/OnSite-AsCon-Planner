import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

/** Puppeteer → single PDF buffer (A3 landscape). Serverless: @sparticuz/chromium. */
export async function generatePlannerCalendarPdf(html: string): Promise<Buffer> {
  const localChrome = process.env.LOCAL_CHROME_PATH?.trim();
  const executablePath = localChrome || (await chromium.executablePath());

  const browser = await puppeteer.launch({
    args: localChrome ? ["--no-sandbox", "--disable-setuid-sandbox"] : chromium.args,
    defaultViewport: localChrome ? { width: 1400, height: 900 } : chromium.defaultViewport,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdfBuffer = await page.pdf({
      format: "A3",
      landscape: true,
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
