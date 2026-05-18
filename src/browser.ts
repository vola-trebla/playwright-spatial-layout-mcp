import { chromium, Browser, BrowserContext, Page } from 'playwright';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) browserPromise = chromium.launch({ headless: true });
  const b = await browserPromise;
  if (!b.isConnected()) browserPromise = chromium.launch({ headless: true });
  return b;
}

export async function withPage<T>(
  url: string,
  viewport: { width: number; height: number },
  fn: (page: Page) => Promise<T>
): Promise<T> {
  const browser = await getBrowser();
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return await fn(page);
  } finally {
    await context?.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    await b?.close();
    browserPromise = null;
  }
}
