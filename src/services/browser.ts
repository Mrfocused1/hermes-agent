import puppeteer, { type Browser } from "puppeteer";
import type { BrowserService } from "./types.js";

/** A headless Chromium browser: screenshots and JS-rendered text. One browser
 *  instance is reused across calls; pages are opened and closed per request. */
export function makeBrowserService(): BrowserService {
  let browserPromise: Promise<Browser> | null = null;

  function getBrowser(): Promise<Browser> {
    if (!browserPromise) {
      browserPromise = puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
    }
    return browserPromise;
  }

  /** Full-page screenshot of a URL, returned as base64 PNG. */
  async function screenshot(url: string): Promise<string> {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      const buf = await page.screenshot({ type: "png", fullPage: true });
      return Buffer.from(buf).toString("base64");
    } finally {
      await page.close();
    }
  }

  /** Visible text of a JS-rendered page (handles sites simple fetch can't read). */
  async function renderText(url: string): Promise<string> {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      const text = await page.evaluate(() => document.body.innerText);
      return text.slice(0, 8000);
    } finally {
      await page.close();
    }
  }

  return { screenshot, renderText };
}
