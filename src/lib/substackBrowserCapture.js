import { chromium } from 'playwright';
import { assertSafeSubstackTargetUrl } from './urlValidation.js';

/** Match server-side fetches in substack.js (reduces headless vs real browser gaps). */
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEFAULT_CAPTURE_TIMEOUT_MS = 45000;
const CONTENT_SELECTORS = [
  '[data-component-name="post-content"]',
  '.available-content',
  '.post-content',
  'article',
];

function countWords(text) {
  if (!text || !text.trim()) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function stripTags(html) {
  return (html || '').replace(/<[^>]+>/g, ' ');
}

function wordCountFromHtml(html) {
  return countWords(stripTags(html));
}

function collectBodyHtmlStringsFromJson(obj, depth = 0) {
  if (!obj || depth > 18) return [];
  if (typeof obj === 'string') return [];
  if (Array.isArray(obj)) {
    return obj.flatMap((x) => collectBodyHtmlStringsFromJson(x, depth + 1));
  }
  if (typeof obj !== 'object') return [];
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'body_html' && typeof v === 'string' && v.trim()) {
      out.push(v);
    } else if (v && typeof v === 'object') {
      out.push(...collectBodyHtmlStringsFromJson(v, depth + 1));
    }
  }
  return out;
}

/**
 * Subscriber HTML often arrives in XHR JSON before (or instead of) hydrating a long DOM.
 * Sniff /api/v1/posts/... responses and keep the longest body_html seen.
 */
function attachPostBodySniffer(page) {
  let bestHtml = '';
  let bestWords = 0;

  const consider = (html) => {
    if (typeof html !== 'string' || !html.trim()) return;
    const w = wordCountFromHtml(html);
    if (w > bestWords) {
      bestWords = w;
      bestHtml = html.trim();
    }
  };

  const handler = async (response) => {
    const url = response.url();
    if (!url.includes('/api/v1/posts/')) return;
    try {
      if (!response.ok()) return;
      const ct = (response.headers()['content-type'] || '').toLowerCase();
      if (!ct.includes('json')) return;
      const json = await response.json();
      for (const h of collectBodyHtmlStringsFromJson(json)) {
        consider(h);
      }
    } catch {
      /* aborted, non-json, etc. */
    }
  };

  page.on('response', handler);
  return {
    getBest: () => ({ bodyHtml: bestHtml, bodyWordCount: bestWords }),
    dispose: () => page.off('response', handler),
  };
}

async function scrollForLazyContent(page) {
  await page.evaluate(() => {
    try {
      const h =
        document.documentElement?.scrollHeight || document.body?.scrollHeight || 0;
      window.scrollTo(0, 0);
      window.scrollTo(0, Math.floor(h * 0.45));
      window.scrollTo(0, h);
    } catch {
      /* ignore */
    }
  });
  await new Promise((r) => setTimeout(r, 700));
}

/**
 * When Substack's API reports a high word_count, the DOM often shows a short teaser first,
 * then hydrates the full subscriber body. Without a floor we can "stabilize" on the teaser (~80+ words).
 *
 * Full HTML also frequently appears first in `/api/v1/posts/...` JSON (see attachPostBodySniffer) while
 * the visible DOM stays on the free preview — so we combine DOM + network and prefer the longer body.
 */
async function waitForStableContent(page, timeoutMs, options = {}) {
  const { minExpectedWords, getNetworkBest } = options;
  const needMin =
    typeof minExpectedWords === 'number' &&
    Number.isFinite(minExpectedWords) &&
    minExpectedWords > 0;

  const meetsWordFloor = (words) => !needMin || words >= minExpectedWords;

  const started = Date.now();
  let bestDom = null;
  let stableReads = 0;
  let lastNetWords = -1;
  let netStableReads = 0;

  while (Date.now() - started < timeoutMs) {
    const snapshot = await page.evaluate((selectors) => {
      const collectText = (node) =>
        (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();

      let bestNode = null;
      let bestWords = 0;
      for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        for (const node of nodes) {
          const text = collectText(node);
          const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
          if (words > bestWords) {
            bestNode = node;
            bestWords = words;
          }
        }
      }

      return {
        bodyHtml: bestNode?.innerHTML?.trim() || '',
        bodyWordCount: bestWords,
        title:
          document.querySelector('h1')?.textContent?.trim() ||
          document.title ||
          'Untitled',
        subtitle: document.querySelector('h2')?.textContent?.trim() || '',
        author:
          document.querySelector('meta[name="author"]')?.getAttribute('content') ||
          document.querySelector('[data-testid="byline"] a, [data-testid="byline"] span')
            ?.textContent?.trim() ||
          'Unknown',
        date:
          document.querySelector('time')?.getAttribute('datetime') ||
          document.querySelector('meta[property="article:published_time"]')
            ?.getAttribute('content') ||
          '',
      };
    }, CONTENT_SELECTORS);

    const net = getNetworkBest?.() ?? { bodyHtml: '', bodyWordCount: 0 };
    if (net.bodyWordCount > lastNetWords) {
      lastNetWords = net.bodyWordCount;
      netStableReads = 0;
    } else if (net.bodyWordCount > 0) {
      netStableReads += 1;
    }

    if (snapshot.bodyHtml) {
      if (bestDom && snapshot.bodyWordCount <= bestDom.bodyWordCount) {
        stableReads += 1;
      } else {
        bestDom = snapshot;
        stableReads = 0;
      }

      const domW = bestDom.bodyWordCount;
      const floorOkDom = meetsWordFloor(domW);
      const floorOkNet = meetsWordFloor(net.bodyWordCount);

      if (getNetworkBest && needMin && floorOkNet && netStableReads >= 1) {
        const merged = { ...bestDom, bodyHtml: net.bodyHtml, bodyWordCount: net.bodyWordCount };
        return { ...merged, captureShortfall: false };
      }

      if (floorOkDom) {
        if (domW >= 400 && stableReads >= 1) {
          const useNet = net.bodyWordCount > domW + 15;
          const merged = useNet
            ? { ...bestDom, bodyHtml: net.bodyHtml, bodyWordCount: net.bodyWordCount }
            : bestDom;
          return { ...merged, captureShortfall: false };
        }
        if (domW >= 80 && stableReads >= 2) {
          const useNet = net.bodyWordCount > domW + 15;
          const merged = useNet
            ? { ...bestDom, bodyHtml: net.bodyHtml, bodyWordCount: net.bodyWordCount }
            : bestDom;
          return { ...merged, captureShortfall: false };
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  if (bestDom?.bodyHtml) {
    const net = getNetworkBest?.() ?? { bodyHtml: '', bodyWordCount: 0 };
    const useNet = net.bodyWordCount > bestDom.bodyWordCount + 15;
    const merged = useNet
      ? { ...bestDom, bodyHtml: net.bodyHtml, bodyWordCount: net.bodyWordCount }
      : bestDom;
    const maxW = Math.max(merged.bodyWordCount, wordCountFromHtml(merged.bodyHtml));
    return {
      ...merged,
      bodyWordCount: maxW,
      captureShortfall: Boolean(needMin && maxW < minExpectedWords),
    };
  }
  throw new Error('Timed out waiting for the article body to fully render in the browser.');
}

async function createContext(browser, targetUrl, sid) {
  const parsed = assertSafeSubstackTargetUrl(targetUrl);
  const context = await browser.newContext({
    userAgent: CHROME_USER_AGENT,
    locale: 'en-US',
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const value = String(sid ?? '').trim();
  const base = {
    name: 'substack.sid',
    value,
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'Lax',
  };

  // Use domain+path only (never `url`). Playwright rejects cookies that set both `url` and `path`,
  // and URL-based cookies get `path` derived internally, which can trip the same check if mixed.
  const host = parsed.hostname.toLowerCase();
  const isSubstackHost = host === 'substack.com' || host.endsWith('.substack.com');
  const cookies = [{ ...base, domain: '.substack.com' }];
  if (!isSubstackHost) {
    cookies.push({ ...base, domain: host });
  }

  await context.addCookies(cookies);

  return context;
}

export async function withSubstackBrowserContext(targetUrl, sid, callback) {
  if (!sid) {
    throw new Error('Browser capture requires a valid substack.sid cookie.');
  }

  let browser;
  let context;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    context = await createContext(browser, targetUrl, sid);
    return await callback(context);
  } catch (err) {
    if (String(err?.message || '').includes("Executable doesn't exist")) {
      throw new Error(
        'Chromium is not installed for Playwright. Run `npx playwright install chromium` and try again.'
      );
    }
    throw err;
  } finally {
    await context?.close();
    await browser?.close();
  }
}

export async function captureSubstackPostHtml(
  url,
  sid,
  {
    context = null,
    timeoutMs: timeoutMsOption,
    minExpectedWords,
  } = {}
) {
  assertSafeSubstackTargetUrl(url);

  const hasMin =
    typeof minExpectedWords === 'number' &&
    Number.isFinite(minExpectedWords) &&
    minExpectedWords > 0;
  const timeoutMs =
    typeof timeoutMsOption === 'number' && timeoutMsOption > 0
      ? timeoutMsOption
      : hasMin && minExpectedWords > 1200
        ? Math.max(DEFAULT_CAPTURE_TIMEOUT_MS, 60000)
        : hasMin
          ? Math.max(DEFAULT_CAPTURE_TIMEOUT_MS, 45000)
          : DEFAULT_CAPTURE_TIMEOUT_MS;

  const runCapture = async (activeContext) => {
    const page = await activeContext.newPage();
    const sniffer = attachPostBodySniffer(page);
    try {
      await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
      await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 25000) }).catch(
        () => {}
      );

      for (const selector of CONTENT_SELECTORS) {
        const handle = await page.waitForSelector(selector, { timeout: 5000 }).catch(() => null);
        if (handle) break;
      }

      await scrollForLazyContent(page);

      const snapshot = await waitForStableContent(page, timeoutMs, {
        minExpectedWords,
        getNetworkBest: () => sniffer.getBest(),
      });
      return {
        ...snapshot,
        bodyWordCount: snapshot.bodyWordCount || countWords(stripTags(snapshot.bodyHtml)),
      };
    } finally {
      sniffer.dispose();
      await page.close();
    }
  };

  if (context) {
    return runCapture(context);
  }

  return withSubstackBrowserContext(url, sid, async (createdContext) => runCapture(createdContext));
}
