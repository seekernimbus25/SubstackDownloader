import { chromium } from 'playwright';
import { assertSafeSubstackTargetUrl } from './urlValidation.js';
import {
  collectBodyHtmlStringsFromPreloads,
  parseWindowPreloadsJson,
} from './substackPreloads.js';
import { isSubstackHostedHostname, substackSessionCookieName } from './substackSession.js';

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
    if (
      (k === 'body_html' || k === 'bodyHtml') &&
      typeof v === 'string' &&
      v.trim()
    ) {
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
    if (!/\/api\/|graphql/i.test(url)) return;
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

function postSlugFromUrl(urlString) {
  try {
    const { pathname } = new URL(urlString);
    const m = pathname.match(/\/p\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function pickLongestBodyCandidate(...parts) {
  let bestHtml = '';
  let bestWords = 0;
  for (const p of parts) {
    if (!p) continue;
    const html = typeof p.bodyHtml === 'string' ? p.bodyHtml : '';
    if (!html.trim()) continue;
    const w =
      typeof p.bodyWordCount === 'number' && p.bodyWordCount > 0
        ? p.bodyWordCount
        : wordCountFromHtml(html);
    if (w > bestWords) {
      bestWords = w;
      bestHtml = html.trim();
    }
  }
  return { bodyHtml: bestHtml, bodyWordCount: bestWords };
}

/**
 * Full post HTML is often only in window._preloads / in-memory JSON / in-page fetch — not in the visible DOM.
 */
async function gatherEmbeddedBodies(page, postUrl, slug) {
  const candidates = [];

  try {
    const html = await page.content();
    const preloads = parseWindowPreloadsJson(html);
    if (preloads) {
      candidates.push(...collectBodyHtmlStringsFromPreloads(preloads));
    }
  } catch {
    /* ignore */
  }

  try {
    const fromWin = await page.evaluate(() => {
      const bodies = [];
      const walk = (o, d) => {
        if (!o || d > 24) return;
        if (typeof o === 'object') {
          if (typeof o.body_html === 'string' && o.body_html.trim()) bodies.push(o.body_html);
          if (typeof o.bodyHtml === 'string' && o.bodyHtml.trim()) bodies.push(o.bodyHtml);
          if (Array.isArray(o)) o.forEach((x) => walk(x, d + 1));
          else Object.values(o).forEach((x) => walk(x, d + 1));
        }
      };
      try {
        const direct = ['_preloads', '__NEXT_DATA__', '__APOLLO_STATE__'];
        for (const k of direct) {
          try {
            if (window[k]) walk(window[k], 0);
          } catch {
            /* ignore */
          }
        }
        for (const k of Object.keys(window)) {
          if (!/preloads|SUBSTACK|next|apollo|relay|__NEXT|__SSR|__APOLLO/i.test(k)) continue;
          try {
            walk(window[k], 0);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
      let best = '';
      let bw = 0;
      for (const h of bodies) {
        const w = h.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
        if (w > bw) {
          bw = w;
          best = h;
        }
      }
      return { bodyHtml: best, bodyWordCount: bw };
    });
    if (fromWin.bodyHtml) {
      candidates.push(fromWin.bodyHtml);
    }
  } catch {
    /* ignore */
  }

  if (slug) {
    try {
      const json = await page.evaluate(async (s) => {
        const origin = window.location.origin;
        const res = await fetch(`${origin}/api/v1/posts/${encodeURIComponent(s)}`, {
          credentials: 'include',
          headers: { Accept: 'application/json, text/plain, */*' },
        });
        if (!res.ok) return null;
        return await res.json();
      }, slug);
      if (json) {
        candidates.push(...collectBodyHtmlStringsFromJson(json));
      }
    } catch {
      /* ignore */
    }
  }

  if (!candidates.length) {
    return { bodyHtml: '', bodyWordCount: 0 };
  }
  return pickLongestBodyCandidate(
    ...candidates.map((bodyHtml) => ({
      bodyHtml,
      bodyWordCount: wordCountFromHtml(bodyHtml),
    }))
  );
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
  const host = parsed.hostname.toLowerCase();
  const name = substackSessionCookieName(host);
  const base = {
    name,
    value,
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'Lax',
  };

  // Use domain+path only (never `url`). Playwright rejects cookies that set both `url` and `path`,
  // and URL-based cookies get `path` derived internally, which can trip the same check if mixed.
  const cookies = isSubstackHostedHostname(host)
    ? [{ ...base, domain: '.substack.com' }]
    : [{ ...base, domain: host }];

  await context.addCookies(cookies);

  return context;
}

export async function withSubstackBrowserContext(targetUrl, sid, callback) {
  if (!sid) {
    throw new Error(
      'Browser capture requires a valid session cookie (substack.sid on *.substack.com, connect.sid on custom domains).'
    );
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
    const slug = postSlugFromUrl(url);
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
      await new Promise((r) => setTimeout(r, 3500));

      let embedded = await gatherEmbeddedBodies(page, url, slug);

      const snapshot = await waitForStableContent(page, timeoutMs, {
        minExpectedWords,
        getNetworkBest: () => pickLongestBodyCandidate(sniffer.getBest(), embedded),
      });

      embedded = pickLongestBodyCandidate(
        embedded,
        await gatherEmbeddedBodies(page, url, slug)
      );

      const finalBody = pickLongestBodyCandidate(
        { bodyHtml: snapshot.bodyHtml, bodyWordCount: snapshot.bodyWordCount },
        sniffer.getBest(),
        embedded
      );

      const finalWords =
        finalBody.bodyWordCount || wordCountFromHtml(finalBody.bodyHtml);
      const captureShortfall = Boolean(
        typeof minExpectedWords === 'number' &&
          minExpectedWords > 0 &&
          finalWords < minExpectedWords
      );

      return {
        ...snapshot,
        bodyHtml: finalBody.bodyHtml || snapshot.bodyHtml,
        bodyWordCount: finalWords || countWords(stripTags(snapshot.bodyHtml)),
        captureShortfall,
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
