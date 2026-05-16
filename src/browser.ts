import { chromium, Browser, BrowserContext, Page } from "playwright";

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

export async function withPage<T>(
  url: string,
  viewport: { width: number; height: number },
  fn: (page: Page) => Promise<T>
): Promise<T> {
  const b = await getBrowser();
  let context: BrowserContext | null = null;
  try {
    context = await b.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return await fn(page);
  } finally {
    await context?.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
