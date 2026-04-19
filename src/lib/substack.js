import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { captureSubstackPostHtml, withSubstackBrowserContext } from './substackBrowserCapture.js';
import { collectBodyHtmlStringsFromPreloads, parseWindowPreloadsJson } from './substackPreloads.js';
import {
  substackSessionCookieHeader,
  SUBSTACK_SESSION_REJECTED_MESSAGE,
} from './substackSession.js';

export { parseWindowPreloadsJson } from './substackPreloads.js';

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

/** Substack/CDN often serves a stripped document to non-browser clients; keep requests browser-like. */
const SUBSTACK_BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

function substackFetchInit(extraHeaders = {}) {
  return { headers: { ...SUBSTACK_BROWSER_HEADERS, ...extraHeaders } };
}

function extractPostSlugFromUrl(urlString) {
  try {
    const { pathname } = new URL(urlString);
    const m = pathname.match(/\/p\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export function markdownFromApiPost(
  full,
  { emptyBodyFallback = '*(No body returned for this post.)*' } = {}
) {
  const title = full.title || 'Untitled';
  const subtitle = full.subtitle || '';
  const author = full.publishedBylines?.[0]?.name || 'Unknown';
  const date = (full.post_date || '').slice(0, 10);
  const bodyHtml = full.body_html || '';
  const body = bodyHtml.trim() ? td.turndown(bodyHtml) : '';

  const lines = [`# ${title}\n`];
  if (subtitle) {
    lines.push(`*${subtitle}*\n`);
  }
  lines.push(`\n**Author:** ${author}  \n**Date:** ${date}\n\n---\n\n`);
  lines.push(body || emptyBodyFallback);

  return {
    title,
    author,
    date,
    markdown: lines.join(''),
  };
}

function metadataToApiShape(meta, fallback = {}) {
  return {
    title: meta.title || fallback.title || 'Untitled',
    subtitle: meta.subtitle || fallback.subtitle || '',
    publishedBylines: [{ name: meta.author || fallback.author || 'Unknown' }],
    post_date: meta.date || fallback.date || fallback.post_date || '',
    body_html: meta.bodyHtml || fallback.body_html || '',
    word_count: meta.word_count ?? fallback.word_count,
    audience: fallback.audience,
  };
}

/** Prefer REST API for title/subtitle/byline/date when present; body = longest of DOM/network capture vs API. */
function mergeBrowserCaptureWithApi(captured, apiFull) {
  if (!apiFull || typeof apiFull !== 'object') {
    return metadataToApiShape(captured);
  }
  const apiAuthor = apiFull.publishedBylines?.[0]?.name;
  const bodyCandidates = [captured.bodyHtml, apiFull.body_html].filter(
    (s) => typeof s === 'string' && s.trim()
  );
  const body_html = bodyCandidates.length ? pickLongestBodyHtml(bodyCandidates) : '';
  return {
    title: apiFull.title || captured.title || 'Untitled',
    subtitle: apiFull.subtitle || captured.subtitle || '',
    publishedBylines: [{ name: apiAuthor || captured.author || 'Unknown' }],
    post_date: apiFull.post_date || captured.date || '',
    body_html,
    word_count: apiFull.word_count ?? apiFull.wordcount,
    audience: apiFull.audience,
  };
}

export async function fetchArticle(url, sid = '', options = {}) {
  const { browserCapture = false } = options;
  if (browserCapture) {
    if (!sid) {
      throw new Error(
        'Browser capture requires a valid session cookie (substack.sid on *.substack.com, connect.sid on custom domains).'
      );
    }
    const parsedUrl = new URL(url);
    const { hostname } = parsedUrl;
    const slug = extractPostSlugFromUrl(url);
    let apiFull = null;
    if (slug) {
      const apiRes = await fetch(
        `https://${hostname}/api/v1/posts/${encodeURIComponent(slug)}`,
        substackFetchInit({
          Accept: 'application/json, text/plain, */*',
          ...substackSessionCookieHeader(hostname, sid),
        })
      );
      if (apiRes.ok) {
        try {
          apiFull = await apiRes.json();
        } catch {
          apiFull = null;
        }
      }
    }
    const minExpectedWords = minExpectedBrowserBodyWords(apiFull, null);
    const captured = await captureSubstackPostHtml(url, sid, {
      minExpectedWords,
    });
    const full = mergeBrowserCaptureWithApi(captured, apiFull);
    const base = markdownFromApiPost(full);
    const out = { ...base, browser_capture: true, html_body_fallback: true };
    if (captured.captureShortfall) {
      const apiWC = pickApiWordCount(apiFull, null);
      out.warnings = {
        browser_capture_incomplete: true,
        api_word_count: apiWC,
        captured_body_word_count: captured.bodyWordCount,
        message:
          'Browser capture timed out before the page reached the word count implied by Substack metadata. The download may still be a teaser or partial body; try again, or confirm in the Substack app.',
      };
    }
    return out;
  }

  const parsedUrl = new URL(url);
  const { hostname } = parsedUrl;
  const slug = extractPostSlugFromUrl(url);

  if (slug) {
    const apiRes = await fetch(
      `https://${hostname}/api/v1/posts/${encodeURIComponent(slug)}`,
      substackFetchInit({
        Accept: 'application/json, text/plain, */*',
        ...(sid ? substackSessionCookieHeader(hostname, sid) : {}),
      })
    );

    if (apiRes.status === 401 || apiRes.status === 403) {
      if (sid) {
        throw new Error(SUBSTACK_SESSION_REJECTED_MESSAGE);
      }
    } else if (apiRes.ok) {
      let full = await apiRes.json();
      const bodyHtml = (full.body_html || '').trim();
      if (bodyHtml) {
        const { full: upgraded, htmlFallback } = await upgradeFullPostFromSubscriberPage(
          full,
          url,
          sid
        );
        full = upgraded;
        const base = markdownFromApiPost(full);
        const apiWC = pickApiWordCount(full, null);
        const wc = evaluateWordCountDiscrepancy(apiWC, full.body_html || '');
        if (!wc.word_count_discrepancy) {
          return htmlFallback ? { ...base, html_body_fallback: true } : base;
        }
        const likelyClientOnlyPaidBody =
          Boolean(sid) &&
          full.audience === 'only_paid' &&
          wc.word_count_discrepancy;
        return {
          ...base,
          warnings: {
            word_count_discrepancy: true,
            api_word_count: wc.api_word_count,
            exported_body_word_count: wc.exported_body_word_count,
            word_count_ratio: wc.word_count_ratio,
            likely_client_only_body: likelyClientOnlyPaidBody,
            message: likelyClientOnlyPaidBody
              ? 'Substack metadata says this post is much longer than the HTML we get from their API and initial page data. That often happens on paid posts: the full article appears in your browser only after the app loads, while server-side fetches still see a preview. Your subscription can be fine - this is a delivery gap, not proof the session is wrong. Try the Full browser capture option, or open the post in the browser to confirm.'
              : 'Substack reported more words than we received in the article body. This download may be incomplete - reconnect with a fresh session cookie while logged in as a subscriber, or open the post in the browser to confirm.',
          },
        };
      }
      if (sid) {
        throw new Error(
          'No article body returned for this URL. Confirm you are subscribed to this publication and your session cookie is current (substack.sid on *.substack.com, connect.sid on custom domains).'
        );
      }
    }
  }

  const res = await fetch(
    url,
    substackFetchInit({
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(sid ? substackSessionCookieHeader(parsedUrl.hostname, sid) : {}),
    })
  );
  if (!res.ok) throw new Error(`Failed to fetch article: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim() || 'Untitled';
  const author = $('meta[name="author"]').attr('content') || 'Unknown';
  const date = $('time').first().attr('datetime') || '';

  const articleEl = $('article');
  if (!articleEl.length) throw new Error('No article content found');

  const rawHtml = articleEl.html() ?? '';
  const body = td.turndown(rawHtml);
  const frontmatter = `# ${title}\n\n**Author:** ${author}  \n**Date:** ${date}\n\n---\n\n`;

  return { title, author, date, markdown: frontmatter + body };
}

export const BULK_SHORT_BODY_WARNING_THRESHOLD = 600;
export const WORD_COUNT_DISCREPANCY_RATIO = 0.72;
export const WORD_COUNT_DISCREPANCY_MIN_REPORTED = 400;

function countWordsFromPlainText(text) {
  if (!text || !text.trim()) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function countWordsFromBodyHtml(html) {
  if (!html || !html.trim()) return 0;
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return countWordsFromPlainText($.text());
}

function pickApiWordCount(full, listPost) {
  const from = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    const w = obj.word_count ?? obj.wordcount;
    if (typeof w === 'number' && w > 0 && Number.isFinite(w)) return Math.round(w);
    return null;
  };
  return from(full) ?? from(listPost);
}

/** Floor for browser DOM word count vs API metadata (see WORD_COUNT_DISCREPANCY_RATIO). */
function minExpectedBrowserBodyWords(apiFull, listPost) {
  const apiWC = pickApiWordCount(apiFull, listPost);
  if (typeof apiWC !== 'number' || !Number.isFinite(apiWC) || apiWC < 200) {
    return undefined;
  }
  return Math.max(1, Math.floor(apiWC * WORD_COUNT_DISCREPANCY_RATIO));
}

function evaluateWordCountDiscrepancy(apiReportedWords, bodyHtml) {
  const exportedBodyWords = countWordsFromBodyHtml(bodyHtml);
  if (
    !apiReportedWords ||
    apiReportedWords < WORD_COUNT_DISCREPANCY_MIN_REPORTED ||
    exportedBodyWords < 1
  ) {
    return {
      exported_body_word_count: exportedBodyWords,
      api_word_count: apiReportedWords ?? null,
      word_count_discrepancy: false,
      word_count_ratio: null,
    };
  }
  const ratio = exportedBodyWords / apiReportedWords;
  const word_count_discrepancy = ratio < WORD_COUNT_DISCREPANCY_RATIO;
  return {
    exported_body_word_count: exportedBodyWords,
    api_word_count: apiReportedWords,
    word_count_discrepancy,
    word_count_ratio: Math.round(ratio * 1000) / 1000,
  };
}

function extractArticleInnerHtml(pageHtml) {
  const $ = cheerio.load(pageHtml);
  $('script, style, noscript').remove();
  const selectors = [
    '[data-component-name="post-content"]',
    '.available-content',
    '.post-content',
    'article',
  ];
  let best = null;
  let bestWords = 0;
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const h = $(el).html();
      if (!h || !h.trim()) return;
      const w = countWordsFromBodyHtml(h);
      if (w > bestWords) {
        bestWords = w;
        best = h;
      }
    });
  }
  return best;
}

function pickLongestBodyHtml(candidates) {
  const valid = candidates.filter((h) => typeof h === 'string' && h.trim());
  if (!valid.length) return null;
  return valid.reduce((best, cur) => {
    const bw = countWordsFromBodyHtml(best);
    const cw = countWordsFromBodyHtml(cur);
    if (cw > bw) return cur;
    if (cw === bw && cur.length > best.length) return cur;
    return best;
  });
}

async function upgradeFullPostFromSubscriberPage(full, postPageUrl, sid) {
  if (!sid) return { full, htmlFallback: false };
  const apiBody = full.body_html || '';
  try {
    const { hostname } = new URL(postPageUrl);
    const res = await fetch(
      postPageUrl,
      substackFetchInit({
        ...substackSessionCookieHeader(hostname, sid),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      })
    );
    if (!res.ok) return { full, htmlFallback: false };
    const pageHtml = await res.text();
    const preloads = parseWindowPreloadsJson(pageHtml);
    const preloadBodies = preloads ? collectBodyHtmlStringsFromPreloads(preloads) : [];
    const preloadsBody = pickLongestBodyHtml(preloadBodies) || '';
    const inner = extractArticleInnerHtml(pageHtml) || '';
    const best = pickLongestBodyHtml([apiBody, preloadsBody, inner]);
    if (!best || !best.trim() || best === apiBody) return { full, htmlFallback: false };
    return {
      full: { ...full, body_html: best },
      htmlFallback: true,
    };
  } catch {
    return { full, htmlFallback: false };
  }
}

async function fetchPostJsonWithRetry(url, headers, { retries = 3 } = {}) {
  let lastRes;
  for (let attempt = 0; attempt < retries; attempt++) {
    lastRes = await fetch(url, { headers });
    if (lastRes.ok) return lastRes;
    if ((lastRes.status === 429 || lastRes.status === 503) && attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    return lastRes;
  }
  return lastRes;
}

function addBulkExportFrontmatter(markdown, meta) {
  const lines = [
    '---',
    `offstackvault_slug: ${meta.slug}`,
    `offstackvault_body_html_chars: ${meta.body_html_chars}`,
    `offstackvault_markdown_chars: ${meta.markdown_total_chars}`,
    `offstackvault_export_status: ${meta.export_status}`,
    `offstackvault_short_body_warning: ${meta.short_body_warning}`,
    `offstackvault_api_word_count: ${meta.api_word_count ?? 'null'}`,
    `offstackvault_exported_body_word_count: ${meta.exported_body_word_count}`,
    `offstackvault_word_count_discrepancy: ${meta.word_count_discrepancy}`,
    `offstackvault_word_count_ratio: ${meta.word_count_ratio ?? 'null'}`,
    `offstackvault_html_body_fallback: ${meta.html_body_fallback ?? false}`,
    `offstackvault_browser_capture: ${meta.browser_capture ?? false}`,
    '---',
    '',
  ];
  return `${lines.join('\n')}${markdown}`;
}

export async function fetchAllPosts(publicationUrl, sid, options = {}) {
  const { browserCapture = false } = options;
  const { hostname } = new URL(publicationUrl);
  const listInit = substackFetchInit({
    Accept: 'application/json, text/plain, */*',
    ...substackSessionCookieHeader(hostname, sid),
  });

  const posts = [];
  let offset = 0;
  const limit = 25;

  while (true) {
    const res = await fetch(
      `https://${hostname}/api/v1/posts?sort=new&offset=${offset}&limit=${limit}`,
      listInit
    );
    if (!res.ok) throw new Error(`Failed to fetch posts: ${res.status}`);
    const batch = await res.json();
    if (!batch.length) break;
    posts.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  const entries = [];
  const fetchFailures = [];
  const postJsonInit = substackFetchInit({
    Accept: 'application/json, text/plain, */*',
    ...substackSessionCookieHeader(hostname, sid),
  });

  const processPost = async (post, context = null) => {
    const { slug } = post;
    const postUrl = `https://${hostname}/api/v1/posts/${encodeURIComponent(slug)}`;
    const res = await fetchPostJsonWithRetry(postUrl, postJsonInit.headers);

    if (!res.ok) {
      fetchFailures.push({ slug, http_status: res.status });
      return;
    }

    let full = await res.json();
    let htmlFallback = false;
    const postPageUrl = `https://${hostname}/p/${encodeURIComponent(slug)}`;

    if (browserCapture) {
      try {
        const minExpectedWords = minExpectedBrowserBodyWords(full, post);
        const captured = await captureSubstackPostHtml(postPageUrl, sid, {
          context,
          minExpectedWords,
        });
        full = {
          ...full,
          ...metadataToApiShape(captured, full),
        };
        htmlFallback = true;
      } catch (err) {
        fetchFailures.push({ slug, browser_capture_error: err.message });
        return;
      }
    } else {
      const upgraded = await upgradeFullPostFromSubscriberPage(full, postPageUrl, sid);
      full = upgraded.full;
      htmlFallback = upgraded.htmlFallback;
    }

    const bodyHtml = (full.body_html || '').trim();
    const bodyHtmlChars = bodyHtml.length;

    const { markdown } = markdownFromApiPost(full, {
      emptyBodyFallback: '*(No content - article may be paywalled)*',
    });

    const title = full.title || 'Untitled';
    const date = (full.post_date || '').slice(0, 10);
    const filename = `${date ? date + '-' : ''}${slug}.md`;

    const export_status = bodyHtmlChars === 0 ? 'empty_body' : 'ok';
    const short_body_warning =
      bodyHtmlChars > 0 && bodyHtmlChars < BULK_SHORT_BODY_WARNING_THRESHOLD;

    const apiWordCount = pickApiWordCount(full, post);
    const wc = evaluateWordCountDiscrepancy(apiWordCount, bodyHtml);

    const meta = {
      slug,
      title,
      body_html_chars: bodyHtmlChars,
      markdown_total_chars: markdown.length,
      export_status,
      short_body_warning,
      api_word_count: wc.api_word_count ?? null,
      exported_body_word_count: wc.exported_body_word_count,
      word_count_discrepancy: wc.word_count_discrepancy,
      word_count_ratio: wc.word_count_ratio,
      html_body_fallback: htmlFallback,
      browser_capture: browserCapture,
    };

    entries.push({ filename, markdown, meta });
  };

  if (browserCapture) {
    await withSubstackBrowserContext(publicationUrl, sid, async (context) => {
      for (const post of posts) {
        await processPost(post, context);
      }
    });
  } else {
    for (const post of posts) {
      await processPost(post, null);
    }
  }

  const suspectedIncomplete = entries
    .filter(
      (e) =>
        e.meta.export_status === 'empty_body' ||
        e.meta.short_body_warning ||
        e.meta.word_count_discrepancy
    )
    .map((e) => ({
      filename: e.filename,
      slug: e.meta.slug,
      title: e.meta.title,
      body_html_chars: e.meta.body_html_chars,
      export_status: e.meta.export_status,
      short_body_warning: e.meta.short_body_warning,
      api_word_count: e.meta.api_word_count,
      exported_body_word_count: e.meta.exported_body_word_count,
      word_count_discrepancy: e.meta.word_count_discrepancy,
      word_count_ratio: e.meta.word_count_ratio,
      html_body_fallback: e.meta.html_body_fallback,
      browser_capture: e.meta.browser_capture,
    }));

  const wordCountDiscrepancies = entries
    .filter((e) => e.meta.word_count_discrepancy)
    .map((e) => ({
      filename: e.filename,
      slug: e.meta.slug,
      title: e.meta.title,
      api_word_count: e.meta.api_word_count,
      exported_body_word_count: e.meta.exported_body_word_count,
      word_count_ratio: e.meta.word_count_ratio,
    }));

  return {
    entries,
    report: {
      publication: hostname,
      posts_listed: posts.length,
      files_written: entries.length,
      fetch_failures: fetchFailures,
      suspected_incomplete: suspectedIncomplete,
      word_count_discrepancies: wordCountDiscrepancies,
      word_count_discrepancy_ratio_threshold: WORD_COUNT_DISCREPANCY_RATIO,
      browser_capture: browserCapture,
      generated_at: new Date().toISOString(),
      notes:
        'Compare offstackvault_api_word_count to offstackvault_exported_body_word_count. html_body_fallback:true means we replaced short API body_html with a longer subscriber HTML source, including optional browser capture. If word_count_discrepancy is still true, try a fresh session cookie (substack.sid or connect.sid). short_body_warning uses a small HTML character threshold. fetch_failures lists slugs with no file.',
    },
  };
}

export { addBulkExportFrontmatter };

export async function validateSubstackSid(publicationUrl, sid) {
  const { hostname } = new URL(publicationUrl);
  const res = await fetch(
    `https://${hostname}/api/v1/posts?sort=new&offset=0&limit=1`,
    substackFetchInit({
      Accept: 'application/json, text/plain, */*',
      ...substackSessionCookieHeader(hostname, sid),
    })
  );

  if (res.status === 401 || res.status === 403) {
    throw new Error(SUBSTACK_SESSION_REJECTED_MESSAGE);
  }
  if (!res.ok) {
    throw new Error(`Could not validate session: ${res.status}`);
  }

  const batch = await res.json();
  if (!Array.isArray(batch)) {
    throw new Error('Unexpected response while validating session.');
  }

  return { ok: true };
}
