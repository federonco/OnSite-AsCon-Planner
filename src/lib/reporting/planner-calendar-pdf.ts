import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { existsSync } from "fs";

function firstExistingPath(paths: string[]): string | null {
  for (const p of paths) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

async function resolveChromeExecutablePath(): Promise<{
  executablePath: string;
  useServerlessChromium: boolean;
}> {
  const localChrome = process.env.LOCAL_CHROME_PATH?.trim();
  if (localChrome && existsSync(localChrome)) {
    return { executablePath: localChrome, useServerlessChromium: false };
  }

  if (process.platform === "win32") {
    const programFiles = process.env["PROGRAMFILES"] ?? "C:\\Program Files";
    const programFilesX86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
    const localAppData = process.env["LOCALAPPDATA"] ?? "";
    const detected = firstExistingPath([
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ]);
    if (detected) {
      return { executablePath: detected, useServerlessChromium: false };
    }
  }

  try {
    const executablePath = await chromium.executablePath();
    return { executablePath, useServerlessChromium: true };
  } catch {
    throw new Error(
      "No local Chrome/Edge detected and serverless Chromium is unavailable. Set LOCAL_CHROME_PATH to chrome.exe for local development."
    );
  }
}

/** Puppeteer → single PDF buffer (A3 landscape). Serverless: @sparticuz/chromium. */
export async function generatePlannerCalendarPdf(html: string): Promise<Buffer> {
  const { executablePath, useServerlessChromium } = await resolveChromeExecutablePath();

  const browser = await puppeteer.launch({
    args: useServerlessChromium ? chromium.args : ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: useServerlessChromium ? chromium.defaultViewport : { width: 1400, height: 900 },
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
