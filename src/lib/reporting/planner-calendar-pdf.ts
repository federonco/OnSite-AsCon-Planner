import { existsSync } from "fs";

function firstExistingPath(paths: string[]): string | null {
  for (const p of paths) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

export class PdfGenerationError extends Error {
  stage: "resolve-engine" | "launch" | "render";
  details?: string;
  constructor(stage: "resolve-engine" | "launch" | "render", message: string, details?: string) {
    super(message);
    this.name = "PdfGenerationError";
    this.stage = stage;
    this.details = details;
  }
}

async function resolvePdfEngine(): Promise<{
  executablePath: string;
  useServerlessChromium: boolean;
  pathSource: "env" | "autodetect" | "sparticuz";
}> {
  const isVercel = Boolean(process.env.VERCEL);
  const isProd = process.env.NODE_ENV === "production";
  const shouldUseServerlessChromium = isVercel || isProd;

  // On Vercel/prod we must use sparticuz chromium, never local desktop browser.
  if (shouldUseServerlessChromium) {
    try {
      const chromiumMod = await import("@sparticuz/chromium");
      const executablePath = await chromiumMod.default.executablePath();
      console.info("[planner/pdf] engine resolved", {
        env: { nodeEnv: process.env.NODE_ENV, vercel: isVercel, platform: process.platform },
        engine: "sparticuz",
        pathSource: "sparticuz",
      });
      return { executablePath, useServerlessChromium: true, pathSource: "sparticuz" };
    } catch (err) {
      throw new PdfGenerationError(
        "resolve-engine",
        "Could not resolve serverless Chromium executable in production runtime.",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  const localChrome = process.env.LOCAL_CHROME_PATH?.trim();
  if (localChrome && existsSync(localChrome)) {
    console.info("[planner/pdf] engine resolved", {
      env: { nodeEnv: process.env.NODE_ENV, vercel: isVercel, platform: process.platform },
      engine: "local-chrome",
      pathSource: "env",
    });
    return { executablePath: localChrome, useServerlessChromium: false, pathSource: "env" };
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
      console.info("[planner/pdf] engine resolved", {
        env: { nodeEnv: process.env.NODE_ENV, vercel: isVercel, platform: process.platform },
        engine: "local-chrome",
        pathSource: "autodetect",
      });
      return { executablePath: detected, useServerlessChromium: false, pathSource: "autodetect" };
    }
  }

  throw new PdfGenerationError(
    "resolve-engine",
    "No local Chrome/Edge detected for development.",
    "Set LOCAL_CHROME_PATH to chrome.exe (or msedge.exe) on your machine."
  );
}

/** Puppeteer → single PDF buffer (A3 landscape). Serverless: @sparticuz/chromium. */
export async function generatePlannerCalendarPdf(html: string): Promise<Buffer> {
  const { executablePath, useServerlessChromium, pathSource } = await resolvePdfEngine();
  const puppeteerMod = await import("puppeteer-core");
  const chromiumMod = useServerlessChromium ? await import("@sparticuz/chromium") : null;
  const puppeteer = puppeteerMod.default;
  const launchArgs = useServerlessChromium
    ? chromiumMod!.default.args
    : ["--no-sandbox", "--disable-setuid-sandbox"];
  const launchViewport = useServerlessChromium
    ? chromiumMod!.default.defaultViewport
    : { width: 1400, height: 900 };

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    console.info("[planner/pdf] launching browser", {
      engine: useServerlessChromium ? "sparticuz" : "local-chrome",
      pathSource,
      pathProvided: Boolean(executablePath),
    });
    browser = await puppeteer.launch({
      args: launchArgs,
      defaultViewport: launchViewport,
      executablePath,
      headless: true,
    });
  } catch (err) {
    throw new PdfGenerationError(
      "launch",
      "Could not launch browser for PDF generation.",
      err instanceof Error ? err.message : String(err)
    );
  }

  try {
    const page = await browser.newPage();
    console.info("[planner/pdf] rendering html");
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdfBuffer = await page.pdf({
      format: "A3",
      landscape: true,
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
    return Buffer.from(pdfBuffer);
  } catch (err) {
    throw new PdfGenerationError(
      "render",
      "Could not render PDF document.",
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    await browser?.close();
  }
}
