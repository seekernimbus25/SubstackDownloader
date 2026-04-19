import { fetchArticle, fetchAllPosts, parseWindowPreloadsJson } from './substack.js';
import {
  captureSubstackPostHtml,
  withSubstackBrowserContext,
} from './substackBrowserCapture.js';

jest.mock('./substackBrowserCapture.js', () => ({
  captureSubstackPostHtml: jest.fn(),
  withSubstackBrowserContext: jest.fn(),
}));

describe('fetchArticle', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    captureSubstackPostHtml.mockReset();
    withSubstackBrowserContext.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  it('extracts title, author, date and returns markdown', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <head><meta name="author" content="Jane Doe"></head>
          <body>
            <h1>My Test Article</h1>
            <time datetime="2024-01-15"></time>
            <article><p>Hello world</p></article>
          </body>
        </html>
      `,
    });

    const result = await fetchArticle('https://example.substack.com/p/test');

    expect(result.title).toBe('My Test Article');
    expect(result.author).toBe('Jane Doe');
    expect(result.date).toBe('2024-01-15');
    expect(result.markdown).toContain('# My Test Article');
    expect(result.markdown).toContain('Hello world');
  });

  it('uses fallbacks when metadata is missing', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html><body>
          <article><p>Content</p></article>
        </body></html>
      `,
    });

    const result = await fetchArticle('https://example.substack.com/p/test');
    expect(result.title).toBe('Untitled');
    expect(result.author).toBe('Unknown');
    expect(result.date).toBe('');
    expect(result.markdown).toContain('# Untitled');
    expect(result.markdown).toContain('**Author:** Unknown');
  });

  it('throws when fetch returns non-200', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(fetchArticle('https://example.substack.com/p/missing')).rejects.toThrow(
      'Failed to fetch article: 404'
    );
  });

  it('throws when no article element is found', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body><h1>Title</h1></body></html>',
    });
    await expect(fetchArticle('https://example.substack.com/p/bad')).rejects.toThrow(
      'No article content found'
    );
  });

  it('uses Substack JSON API when sid is provided and body_html exists', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Paid Post',
        subtitle: 'Sub',
        publishedBylines: [{ name: 'Author Name' }],
        post_date: '2025-08-06T00:00:00Z',
        body_html: '<p>Full <strong>body</strong> for subscribers.</p>',
      }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        '<html><body><article><p>Full <strong>body</strong> for subscribers.</p></article></body></html>',
    });

    const result = await fetchArticle('https://example.substack.com/p/my-slug', 'session-cookie');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.substack.com/api/v1/posts/my-slug',
      expect.objectContaining({
        headers: expect.objectContaining({ Cookie: 'substack.sid=session-cookie' }),
      })
    );
    expect(result.markdown).toContain('Full');
    expect(result.markdown).toContain('**body**');
    expect(result.title).toBe('Paid Post');
  });

  it('fetches subscriber post page to merge preloads when sid is present even if API already returns body', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'T',
        publishedBylines: [{ name: 'A' }],
        post_date: '2025-01-01T00:00:00Z',
        body_html: '<p>OK</p>',
      }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body><article><p>OK</p></article></body></html>',
    });

    await fetchArticle('https://news.example.com/p/foo-bar', 'sid');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://news.example.com/p/foo-bar',
      expect.objectContaining({
        headers: expect.objectContaining({ Cookie: 'substack.sid=sid' }),
      })
    );
  });

  it('uses JSON API for public posts without sid when body_html is returned', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Public Post',
        publishedBylines: [{ name: 'Bob' }],
        post_date: '2024-06-01T12:00:00Z',
        body_html: '<p>Complete article text from API.</p>',
      }),
    });

    const result = await fetchArticle('https://example.substack.com/p/public-slug', '');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [apiUrl, apiInit] = global.fetch.mock.calls[0];
    expect(apiUrl).toBe('https://example.substack.com/api/v1/posts/public-slug');
    expect(apiInit.headers.Cookie).toBeUndefined();
    expect(apiInit.headers['User-Agent']).toMatch(/Mozilla/);
    expect(result.markdown).toContain('Complete article text from API');
    expect(result.title).toBe('Public Post');
    expect(result.warnings).toBeUndefined();
  });

  it('returns warnings when API word_count is far larger than body HTML', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Long',
        publishedBylines: [{ name: 'A' }],
        post_date: '2024-01-01T00:00:00Z',
        word_count: 8000,
        body_html: '<p>Short teaser only.</p>',
      }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body><article><p>Short teaser only.</p></article></body></html>',
    });

    const result = await fetchArticle('https://example.substack.com/p/slug', 'sid');

    expect(result.warnings?.word_count_discrepancy).toBe(true);
    expect(result.warnings?.api_word_count).toBe(8000);
  });

  it('uses longer subscriber HTML when API body_html is truncated but page has full article', async () => {
    const longBody = `<p>${Array.from({ length: 6500 }, () => 'word').join(' ')}</p>`;
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Long',
        publishedBylines: [{ name: 'A' }],
        post_date: '2024-01-01T00:00:00Z',
        word_count: 8000,
        body_html: '<p>Short teaser only.</p>',
      }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><body><article>${longBody}</article></body></html>`,
    });

    const result = await fetchArticle('https://example.substack.com/p/slug', 'sid');

    expect(result.warnings).toBeUndefined();
    expect(result.html_body_fallback).toBe(true);
    expect(result.markdown).toContain('word word');
  });

  it('uses longer body from spaced window._preloads when article DOM is still a teaser', async () => {
    const longBody = `<p>${Array.from({ length: 6500 }, () => 'word').join(' ')}</p>`;
    const payload = JSON.stringify({ post: { body_html: longBody } });
    const escaped = payload.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const pageHtml = `<html><body><script>window._preloads        = JSON.parse("${escaped}")</script><article><p>Short teaser only.</p></article></body></html>`;

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Long',
        publishedBylines: [{ name: 'A' }],
        post_date: '2024-01-01T00:00:00Z',
        word_count: 8000,
        body_html: '<p>Short teaser only.</p>',
      }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => pageHtml,
    });

    const result = await fetchArticle('https://example.substack.com/p/slug', 'sid');

    expect(result.warnings).toBeUndefined();
    expect(result.html_body_fallback).toBe(true);
    expect(result.markdown).toContain('word word');
  });

  it('uses browser capture when explicitly requested', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'From API',
        subtitle: 'API subtitle',
        publishedBylines: [{ name: 'API Author' }],
        post_date: '2026-04-19T12:00:00Z',
        body_html: '<p>preview only</p>',
      }),
    });
    captureSubstackPostHtml.mockResolvedValueOnce({
      title: 'From Browser',
      subtitle: 'Wrong h2',
      author: 'Jane Doe',
      date: '2026-04-19T00:00:00Z',
      bodyHtml: '<p>Loaded after hydration.</p>',
    });

    const result = await fetchArticle('https://example.substack.com/p/captured', 'sid', {
      browserCapture: true,
    });

    expect(captureSubstackPostHtml).toHaveBeenCalledWith(
      'https://example.substack.com/p/captured',
      'sid',
      expect.objectContaining({ minExpectedWords: undefined })
    );
    expect(result.markdown).toContain('Loaded after hydration.');
    expect(result.markdown).toContain('From API');
    expect(result.markdown).toContain('*API subtitle*');
    expect(result.markdown).toContain('API Author');
    expect(result.browser_capture).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('fetchAllPosts', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    captureSubstackPostHtml.mockReset();
    withSubstackBrowserContext.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  it('fetches post list and full content, returns filename and markdown', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ slug: 'my-post' }],
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'My Post',
        subtitle: 'A subtitle',
        publishedBylines: [{ name: 'Jane Doe' }],
        post_date: '2024-01-15T10:00:00Z',
        body_html: '<p>Content here</p>',
      }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body><article><p>Content here</p></article></body></html>',
    });

    const { entries, report } = await fetchAllPosts('https://example.substack.com', 'my-sid');

    expect(entries).toHaveLength(1);
    expect(report.posts_listed).toBe(1);
    expect(report.fetch_failures).toHaveLength(0);
    expect(entries[0].filename).toBe('2024-01-15-my-post.md');
    expect(entries[0].markdown).toContain('# My Post');
    expect(entries[0].markdown).toContain('*A subtitle*');
    expect(entries[0].markdown).toContain('Jane Doe');
    expect(entries[0].markdown).toContain('Content here');
    expect(entries[0].meta.slug).toBe('my-post');
    expect(entries[0].meta.export_status).toBe('ok');
    expect(entries[0].meta.word_count_discrepancy).toBe(false);
    expect(report.word_count_discrepancies).toHaveLength(0);
  });

  it('flags word_count_discrepancy when API reports many more words than body HTML', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ slug: 'long-post', word_count: 8000 }],
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Long Post',
        subtitle: '',
        publishedBylines: [{ name: 'A' }],
        post_date: '2024-02-01T00:00:00Z',
        word_count: 8000,
        body_html: '<p>Only a short teaser remains here.</p>',
      }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><article><p>Only a short teaser remains here.</p></article></html>',
    });

    const { entries, report } = await fetchAllPosts('https://example.substack.com', 'sid');

    expect(entries).toHaveLength(1);
    expect(entries[0].meta.word_count_discrepancy).toBe(true);
    expect(entries[0].meta.api_word_count).toBe(8000);
    expect(entries[0].meta.exported_body_word_count).toBeLessThan(8000 * 0.72);
    expect(report.word_count_discrepancies).toHaveLength(1);
    expect(report.suspected_incomplete).toHaveLength(1);
    expect(report.suspected_incomplete[0].slug).toBe('long-post');
  });

  it('replaces API body with longer subscriber HTML in bulk when word_count implies truncation', async () => {
    const longBody = `<p>${Array.from({ length: 6500 }, () => 'word').join(' ')}</p>`;
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ slug: 'long-post', word_count: 8000 }],
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Long Post',
        subtitle: '',
        publishedBylines: [{ name: 'A' }],
        post_date: '2024-02-01T00:00:00Z',
        word_count: 8000,
        body_html: '<p>Short teaser only.</p>',
      }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><article>${longBody}</article></html>`,
    });

    const { entries, report } = await fetchAllPosts('https://example.substack.com', 'sid');

    expect(entries[0].meta.html_body_fallback).toBe(true);
    expect(entries[0].meta.word_count_discrepancy).toBe(false);
    expect(entries[0].markdown).toContain('word word');
    expect(report.word_count_discrepancies).toHaveLength(0);
  });

  it('paginates when batch equals limit', async () => {
    const batch1 = Array.from({ length: 25 }, (_, i) => ({ slug: `post-${i}` }));
    const batch2 = [{ slug: 'post-25' }];

    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => batch1 });
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => batch2 });
    for (let i = 0; i < 26; i++) {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: `Post ${i}`,
          subtitle: '',
          publishedBylines: [],
          post_date: '',
          body_html: '<p>body</p>',
        }),
      });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><body><article><p>body</p></article></body></html>',
      });
    }

    const { entries } = await fetchAllPosts('https://example.substack.com', 'sid');
    expect(entries).toHaveLength(26);
  });

  it('throws when post list fetch fails', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(fetchAllPosts('https://example.substack.com', 'bad-sid')).rejects.toThrow(
      'Failed to fetch posts: 403'
    );
  });

  it('records per-post fetch failures in the report instead of failing silently', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ slug: 'good' }, { slug: 'bad' }],
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Good Post',
        subtitle: '',
        publishedBylines: [],
        post_date: '2024-01-01T00:00:00Z',
        body_html: '<p>ok</p>',
      }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body><article><p>ok</p></article></body></html>',
    });
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { entries, report } = await fetchAllPosts('https://example.substack.com', 'sid');
    expect(entries).toHaveLength(1);
    expect(entries[0].filename).toContain('good');
    expect(report.fetch_failures).toEqual([{ slug: 'bad', http_status: 500 }]);
    expect(report.files_written).toBe(1);
    expect(report.posts_listed).toBe(2);
  });

  it('uses one browser context for bulk browser capture and captures each post page', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ slug: 'first' }, { slug: 'second' }],
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'First',
        subtitle: '',
        publishedBylines: [{ name: 'A' }],
        post_date: '2024-01-01T00:00:00Z',
        body_html: '<p>api teaser</p>',
      }),
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Second',
        subtitle: '',
        publishedBylines: [{ name: 'B' }],
        post_date: '2024-01-02T00:00:00Z',
        body_html: '<p>api teaser</p>',
      }),
    });

    const fakeContext = { id: 'ctx' };
    withSubstackBrowserContext.mockImplementation(async (_url, _sid, callback) =>
      callback(fakeContext)
    );
    captureSubstackPostHtml
      .mockResolvedValueOnce({
        title: 'First',
        subtitle: '',
        author: 'A',
        date: '2024-01-01T00:00:00Z',
        bodyHtml: '<p>first full body</p>',
      })
      .mockResolvedValueOnce({
        title: 'Second',
        subtitle: '',
        author: 'B',
        date: '2024-01-02T00:00:00Z',
        bodyHtml: '<p>second full body</p>',
      });

    const { entries, report } = await fetchAllPosts('https://example.substack.com', 'sid', {
      browserCapture: true,
    });

    expect(withSubstackBrowserContext).toHaveBeenCalledTimes(1);
    expect(captureSubstackPostHtml).toHaveBeenNthCalledWith(
      1,
      'https://example.substack.com/p/first',
      'sid',
      expect.objectContaining({ context: fakeContext })
    );
    expect(captureSubstackPostHtml).toHaveBeenNthCalledWith(
      2,
      'https://example.substack.com/p/second',
      'sid',
      expect.objectContaining({ context: fakeContext })
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].markdown).toContain('first full body');
    expect(entries[1].markdown).toContain('second full body');
    expect(report.browser_capture).toBe(true);
  });
});

describe('parseWindowPreloadsJson', () => {
  it('parses assignment when Substack uses multiple spaces before =', () => {
    const payload = JSON.stringify({ post: { body_html: '<p>From preloads</p>' } });
    const escaped = payload.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const html = `<script>window._preloads        = JSON.parse("${escaped}")</script>`;
    const data = parseWindowPreloadsJson(html);
    expect(data?.post?.body_html).toBe('<p>From preloads</p>');
  });

  it('still parses tight window._preloads = JSON.parse("...")', () => {
    const payload = JSON.stringify({ post: { body_html: '<p>x</p>' } });
    const escaped = payload.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const html = `<script>window._preloads = JSON.parse("${escaped}")</script>`;
    expect(parseWindowPreloadsJson(html)?.post?.body_html).toBe('<p>x</p>');
  });

  it('returns null when no JSON.parse assignment is present', () => {
    expect(parseWindowPreloadsJson('<html>window._preloads = {};</html>')).toBeNull();
  });
});
