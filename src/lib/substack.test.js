import { fetchArticle, fetchAllPosts } from './substack.js';

describe('fetchArticle', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  it('extracts title, author, date and returns markdown', async () => {
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
    await expect(fetchArticle('https://example.substack.com/p/missing'))
      .rejects.toThrow('Failed to fetch article: 404');
  });

  it('throws when no article element is found', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body><h1>Title</h1></body></html>',
    });
    await expect(fetchArticle('https://example.substack.com/p/bad'))
      .rejects.toThrow('No article content found');
  });
});

describe('fetchAllPosts', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  it('fetches post list and full content, returns filename and markdown', async () => {
    // First call: post list (1 item, less than limit=25, so pagination stops)
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ slug: 'my-post' }],
    });
    // Second call: full post content
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

    const results = await fetchAllPosts('https://example.substack.com', 'my-sid');

    expect(results).toHaveLength(1);
    expect(results[0].filename).toBe('2024-01-15-my-post.md');
    expect(results[0].markdown).toContain('# My Post');
    expect(results[0].markdown).toContain('*A subtitle*');
    expect(results[0].markdown).toContain('Jane Doe');
    expect(results[0].markdown).toContain('Content here');
  });

  it('paginates when batch equals limit', async () => {
    const batch1 = Array.from({ length: 25 }, (_, i) => ({ slug: `post-${i}` }));
    const batch2 = [{ slug: 'post-25' }];

    // Page 1 (25 items = full batch, so fetch page 2)
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => batch1 });
    // Page 2 (1 item = stop)
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => batch2 });
    // 26 individual post fetches
    for (let i = 0; i < 26; i++) {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: `Post ${i}`, subtitle: '', publishedBylines: [],
          post_date: '', body_html: '<p>body</p>',
        }),
      });
    }

    const results = await fetchAllPosts('https://example.substack.com', 'sid');
    expect(results).toHaveLength(26);
  });

  it('throws when post list fetch fails', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(fetchAllPosts('https://example.substack.com', 'bad-sid'))
      .rejects.toThrow('Failed to fetch posts: 403');
  });

  it('skips posts where individual fetch fails', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ slug: 'good' }, { slug: 'bad' }],
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Good Post', subtitle: '', publishedBylines: [],
        post_date: '2024-01-01T00:00:00Z', body_html: '<p>ok</p>',
      }),
    });
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const results = await fetchAllPosts('https://example.substack.com', 'sid');
    expect(results).toHaveLength(1);
    expect(results[0].filename).toContain('good');
  });
});
