# OffStackVault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing cloned app with OffStackVault — a Vercel-hosted Next.js tool that downloads Substack articles as Markdown files, supporting both public and paywalled content.

**Architecture:** Pure JavaScript Next.js app on Vercel. A shared `src/lib/substack.js` module handles all fetching, parsing (cheerio), and Markdown conversion (turndown). Two API routes (`/api/convert`, `/api/convert-all`) call this module. The frontend is a single-page two-tab UI matching the approved mockup.

**Tech Stack:** Next.js 14, React 18, cheerio (HTML parsing), turndown (HTML→Markdown), archiver (ZIP), Jest + next/jest (tests)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/substack.js` | `fetchArticle(url)` and `fetchAllPosts(url, sid)` |
| Create | `src/lib/substack.test.js` | Unit tests for the above |
| Create | `jest.config.js` | Jest config using next/jest transformer |
| Modify | `src/app/api/convert/route.js` | Single-article POST endpoint |
| Create | `src/app/api/convert-all/route.js` | Bulk-download POST endpoint |
| Modify | `src/app/layout.js` | Space Grotesk font + updated metadata |
| Modify | `src/app/globals.css` | Minimal reset, remove Next.js defaults |
| Modify | `src/app/page.module.css` | Full rewrite for OffStackVault design |
| Modify | `src/app/page.js` | Full UI rewrite — two-tab interface |
| Modify | `package.json` | Rename, add deps, add test script |
| Modify | `.gitignore` | Add `.superpowers/` |
| Modify | `README.md` | OffStackVault description |

---

## Task 1: Repo Setup

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`
- Shell: `git remote remove origin`

- [ ] **Step 1: Detach from the upstream remote**

```bash
git remote remove origin
```

Expected: no output. Verify with `git remote -v` (should print nothing).

- [ ] **Step 2: Add `.superpowers/` to `.gitignore`**

Append to the bottom of `.gitignore`:
```
# superpowers brainstorm files
.superpowers/
```

- [ ] **Step 3: Replace README.md**

Replace entire file content with:
```markdown
# OffStackVault

Download any Substack article as a clean Markdown file — public posts or paywalled content you subscribe to.

## Features

- Single article download by URL
- Bulk download of an entire publication as a ZIP
- Supports paywalled content via `substack.sid` session cookie

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

Deploy to Vercel. No environment variables required.
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore README.md
git commit -m "chore: detach upstream remote, update README for OffStackVault"
```

---

## Task 2: Install Dependencies & Configure Jest

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install cheerio turndown
```

Expected: `added N packages` with no errors.

- [ ] **Step 2: Install Jest**

```bash
npm install --save-dev jest jest-environment-node
```

Expected: `added N packages` with no errors.

- [ ] **Step 3: Create `jest.config.js`**

```javascript
const nextJest = require('next/jest')
const createJestConfig = nextJest({ dir: './' })
module.exports = createJestConfig({ testEnvironment: 'node' })
```

- [ ] **Step 4: Add test script and rename package in `package.json`**

Update `package.json` — change `"name"` and add `"test"` to scripts:

```json
{
  "name": "offstackvault",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "jest"
  },
  "dependencies": {
    "archiver": "^7.0.1",
    "cheerio": "^1.0.0",
    "multiparty": "^4.2.3",
    "next": "14.2.3",
    "next-connect": "^1.0.0",
    "react": "^18",
    "react-dom": "^18",
    "turndown": "^7.2.0"
  },
  "devDependencies": {
    "eslint": "^8",
    "eslint-config-next": "14.2.3",
    "jest": "^29.0.0",
    "jest-environment-node": "^29.0.0"
  }
}
```

- [ ] **Step 5: Verify Jest runs (no tests yet)**

```bash
npm test -- --passWithNoTests
```

Expected: `Test Suites: 0 skipped` or similar, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json jest.config.js
git commit -m "chore: add cheerio, turndown, jest; configure test runner"
```

---

## Task 3: `fetchArticle` — TDD

**Files:**
- Create: `src/lib/substack.test.js`
- Create: `src/lib/substack.js`

- [ ] **Step 1: Write failing tests for `fetchArticle`**

Create `src/lib/substack.test.js`:

```javascript
import { fetchArticle } from './substack.js';

describe('fetchArticle', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- src/lib/substack.test.js
```

Expected: `Cannot find module './substack.js'` — tests fail because the file doesn't exist yet.

- [ ] **Step 3: Implement `fetchArticle` in `src/lib/substack.js`**

```javascript
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

export async function fetchArticle(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch article: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim() || 'Untitled';
  const author = $('meta[name="author"]').attr('content') || 'Unknown';
  const date = $('time').first().attr('datetime') || '';

  const articleEl = $('article');
  if (!articleEl.length) throw new Error('No article content found');

  const body = td.turndown(articleEl.html());
  const frontmatter = `# ${title}\n\n**Author:** ${author}  \n**Date:** ${date}\n\n---\n\n`;

  return { title, author, date, markdown: frontmatter + body };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- src/lib/substack.test.js
```

Expected:
```
PASS src/lib/substack.test.js
  fetchArticle
    ✓ extracts title, author, date and returns markdown
    ✓ uses fallbacks when metadata is missing
    ✓ throws when fetch returns non-200
    ✓ throws when no article element is found
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/substack.js src/lib/substack.test.js
git commit -m "feat: add fetchArticle with tests"
```

---

## Task 4: `fetchAllPosts` — TDD

**Files:**
- Modify: `src/lib/substack.test.js` (append new describe block)
- Modify: `src/lib/substack.js` (append new export)

- [ ] **Step 1: Append failing tests for `fetchAllPosts` to `src/lib/substack.test.js`**

Add this block at the bottom of `src/lib/substack.test.js`:

```javascript
import { fetchAllPosts } from './substack.js';

describe('fetchAllPosts', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
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
```

- [ ] **Step 2: Run — verify new tests fail**

```bash
npm test -- src/lib/substack.test.js
```

Expected: `fetchAllPosts is not a function` — new describe block fails, existing tests still pass.

- [ ] **Step 3: Append `fetchAllPosts` to `src/lib/substack.js`**

Add this function at the bottom of the file (after `fetchArticle`):

```javascript
export async function fetchAllPosts(publicationUrl, sid) {
  const { hostname } = new URL(publicationUrl);
  const headers = { Cookie: `substack.sid=${sid}` };

  const posts = [];
  let offset = 0;
  const limit = 25;

  while (true) {
    const res = await fetch(
      `https://${hostname}/api/v1/posts?sort=new&offset=${offset}&limit=${limit}`,
      { headers }
    );
    if (!res.ok) throw new Error(`Failed to fetch posts: ${res.status}`);
    const batch = await res.json();
    if (!batch.length) break;
    posts.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  const results = [];
  for (const post of posts) {
    const { slug } = post;
    const res = await fetch(`https://${hostname}/api/v1/posts/${slug}`, { headers });
    if (!res.ok) continue;
    const full = await res.json();

    const title = full.title || 'Untitled';
    const subtitle = full.subtitle || '';
    const author = full.publishedBylines?.[0]?.name || 'Unknown';
    const date = (full.post_date || '').slice(0, 10);
    const bodyHtml = full.body_html || '';

    const lines = [`# ${title}`];
    if (subtitle) lines.push(`*${subtitle}*`);
    lines.push(`\n**Author:** ${author}  \n**Date:** ${date}\n\n---\n`);
    lines.push(bodyHtml ? td.turndown(bodyHtml) : '*(No content — article may be paywalled)*');

    const filename = `${date ? date + '-' : ''}${slug}.md`;
    results.push({ filename, markdown: lines.join('\n') });
  }

  return results;
}
```

- [ ] **Step 4: Run all tests — verify they pass**

```bash
npm test -- src/lib/substack.test.js
```

Expected:
```
PASS src/lib/substack.test.js
  fetchArticle
    ✓ extracts title, author, date and returns markdown
    ✓ uses fallbacks when metadata is missing
    ✓ throws when fetch returns non-200
    ✓ throws when no article element is found
  fetchAllPosts
    ✓ fetches post list and full content, returns filename and markdown
    ✓ paginates when batch equals limit
    ✓ throws when post list fetch fails
    ✓ skips posts where individual fetch fails
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/substack.js src/lib/substack.test.js
git commit -m "feat: add fetchAllPosts with pagination and tests"
```

---

## Task 5: `/api/convert` Route

**Files:**
- Modify: `src/app/api/convert/route.js`

- [ ] **Step 1: Replace the entire file**

```javascript
import { NextResponse } from 'next/server';
import { fetchArticle } from '@/lib/substack';

export async function POST(request) {
  const { url } = await request.json();
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  try {
    const { markdown, title } = await fetchArticle(url);
    return NextResponse.json({ markdown, title });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Run all tests to confirm nothing is broken**

```bash
npm test
```

Expected: all 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/convert/route.js
git commit -m "feat: rewrite /api/convert route to use substack lib"
```

---

## Task 6: `/api/convert-all` Route

**Files:**
- Create: `src/app/api/convert-all/route.js`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p src/app/api/convert-all
```

Then create `src/app/api/convert-all/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { fetchAllPosts } from '@/lib/substack';
import archiver from 'archiver';

export async function POST(request) {
  const { url, sid } = await request.json();
  if (!url || !sid) {
    return NextResponse.json({ error: 'url and sid are required' }, { status: 400 });
  }

  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    const posts = await fetchAllPosts(url, sid);
    if (!posts.length) {
      return NextResponse.json({ error: 'No posts found — check the URL and your cookie' }, { status: 404 });
    }

    const chunks = [];
    await new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', resolve);
      archive.on('error', reject);
      for (const { filename, markdown } of posts) {
        archive.append(markdown, { name: filename });
      }
      archive.finalize();
    });

    const zipBuffer = Buffer.concat(chunks);

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="offstackvault-${hostname}.zip"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: all 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/convert-all/route.js
git commit -m "feat: add /api/convert-all route — bulk ZIP download"
```

---

## Task 7: Layout, Fonts & Global CSS

**Files:**
- Modify: `src/app/layout.js`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update `src/app/layout.js`**

Replace the entire file:

```javascript
import { Space_Grotesk } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata = {
  title: 'OffStackVault — Substack to Markdown',
  description: 'Download any Substack article as a clean Markdown file. Free or paywalled.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={spaceGrotesk.className}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Replace `src/app/globals.css`**

Replace the entire file:

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
}

body {
  background: #f2f0eb;
  color: #1a1a1a;
  -webkit-font-smoothing: antialiased;
}

a {
  color: inherit;
  text-decoration: none;
}

button {
  font-family: inherit;
  cursor: pointer;
  border: none;
  background: none;
}

input {
  font-family: inherit;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.js src/app/globals.css
git commit -m "feat: update layout with Space Grotesk font and clean globals"
```

---

## Task 8: Page CSS Module

**Files:**
- Modify: `src/app/page.module.css`

- [ ] **Step 1: Replace the entire file**

```css
/* ---- Page Shell ---- */
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f2f0eb;
}

/* ---- Accent Bar ---- */
.accentBar {
  height: 4px;
  background: linear-gradient(90deg, #ff4d2e 0%, #ff8c42 100%);
  flex-shrink: 0;
}

/* ---- Nav ---- */
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  border-bottom: 1px solid #e4e2dc;
}

.logo {
  display: flex;
  align-items: baseline;
  gap: 0;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.logoOff  { color: #1a1a1a; }
.logoStack { color: #ff4d2e; }
.logoVault { color: #1a1a1a; }

.navRight {
  display: flex;
  align-items: center;
  gap: 18px;
}

.navLink {
  font-size: 0.78rem;
  color: #999;
  font-weight: 500;
  transition: color 0.15s;
}
.navLink:hover { color: #1a1a1a; }

.badge {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: #1a1a1a;
  color: #f2f0eb;
  padding: 4px 10px;
  border-radius: 4px;
}

/* ---- Hero ---- */
.hero {
  padding: 40px 28px 28px;
  max-width: 600px;
}

.eyebrow {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #ff4d2e;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.eyebrow::before {
  content: '';
  display: block;
  width: 18px;
  height: 2px;
  background: #ff4d2e;
  flex-shrink: 0;
}

.headline {
  font-size: clamp(2rem, 5vw, 2.6rem);
  font-weight: 700;
  color: #1a1a1a;
  letter-spacing: -0.04em;
  line-height: 1.08;
  margin-bottom: 14px;
}

.underlined {
  position: relative;
  display: inline-block;
}
.underlined::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 2px;
  right: 0;
  height: 4px;
  background: #ff4d2e;
  border-radius: 2px;
}

.desc {
  font-size: 0.88rem;
  color: #888;
  line-height: 1.65;
  font-weight: 400;
}
.desc strong { color: #555; font-weight: 600; }

/* ---- Card ---- */
.card {
  margin: 0 28px 24px;
  background: #fff;
  border-radius: 12px;
  border: 1.5px solid #e4e2dc;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  max-width: 560px;
}

/* ---- Tabs ---- */
.tabs {
  display: flex;
  border-bottom: 1.5px solid #e4e2dc;
}

.tab {
  flex: 1;
  padding: 13px 16px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #bbb;
  background: none;
  border: none;
  cursor: pointer;
  position: relative;
  transition: color 0.15s;
}
.tab:hover { color: #888; }

.tabActive {
  color: #1a1a1a;
}
.tabActive::after {
  content: '';
  position: absolute;
  bottom: -1.5px;
  left: 0;
  right: 0;
  height: 2.5px;
  background: #ff4d2e;
}

/* ---- Form ---- */
.form {
  padding: 20px 22px 22px;
  display: flex;
  flex-direction: column;
}

.fieldLabel {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #aaa;
  margin-bottom: 6px;
}

.input {
  width: 100%;
  height: 42px;
  background: #faf9f6;
  border: 1.5px solid #e0ded8;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 0.82rem;
  color: #1a1a1a;
  transition: border-color 0.15s;
  outline: none;
}
.input::placeholder { color: #ccc; }
.input:focus { border-color: #ff4d2e; }

.fieldGap { margin-top: 14px; }

.hint {
  font-size: 0.65rem;
  color: #bbb;
  margin-top: 5px;
  line-height: 1.5;
}
.hint code {
  font-family: 'DM Mono', 'Menlo', monospace;
  background: #f2f0eb;
  padding: 1px 4px;
  border-radius: 3px;
  color: #888;
}

.error {
  font-size: 0.75rem;
  color: #e03d2f;
  margin-top: 10px;
}

.btnPrimary {
  margin-top: 16px;
  height: 44px;
  background: #ff4d2e;
  color: #fff;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  transition: background 0.15s, opacity 0.15s;
}
.btnPrimary:hover { background: #e03d2f; }
.btnPrimary:disabled { opacity: 0.55; cursor: not-allowed; }

/* ---- Feature Pills ---- */
.pills {
  padding: 0 28px 32px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pill {
  display: flex;
  align-items: center;
  gap: 7px;
  background: #fff;
  border: 1.5px solid #e4e2dc;
  padding: 6px 13px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #888;
}

.pillDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ff4d2e;
  flex-shrink: 0;
}

/* ---- Footer ---- */
.footer {
  margin-top: auto;
  padding: 16px 28px;
  border-top: 1px solid #e4e2dc;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footerBrand {
  font-size: 0.72rem;
  font-weight: 700;
  color: #ccc;
}
.footerAccent { color: #ff4d2e; }

.footerNote {
  font-size: 0.65rem;
  color: #ccc;
}

/* ---- Mobile ---- */
@media (max-width: 600px) {
  .hero { padding: 28px 18px 20px; }
  .card { margin: 0 18px 20px; }
  .nav { padding: 12px 18px; }
  .pills { padding: 0 18px 24px; }
  .footer { padding: 14px 18px; }
  .navLink { display: none; }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.module.css
git commit -m "feat: add OffStackVault CSS module"
```

---

## Task 9: Page UI

**Files:**
- Modify: `src/app/page.js`

- [ ] **Step 1: Replace the entire file**

```jsx
'use client';
import { useState } from 'react';
import styles from './page.module.css';

export default function Home() {
  const [tab, setTab] = useState('single');
  const [url, setUrl] = useState('');
  const [pubUrl, setPubUrl] = useState('');
  const [sid, setSid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function switchTab(t) {
    setTab(t);
    setError(null);
  }

  async function handleSingle(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const blob = new Blob([data.markdown], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${data.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '')}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAll(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/convert-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pubUrl, sid }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'offstackvault-articles.zip';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.accentBar} />

      <nav className={styles.nav}>
        <div className={styles.logo}>
          <span className={styles.logoOff}>Off</span>
          <span className={styles.logoStack}>Stack</span>
          <span className={styles.logoVault}>Vault</span>
        </div>
        <div className={styles.navRight}>
          <a href="#features" className={styles.navLink}>How it works</a>
          <span className={styles.badge}>Free Tool</span>
        </div>
      </nav>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Substack Downloader</p>
        <h1 className={styles.headline}>
          Your articles,<br />
          <span className={styles.underlined}>off</span> the platform.
        </h1>
        <p className={styles.desc}>
          Download any Substack article as a clean <strong>Markdown file</strong> —
          public posts or paywalled content you subscribe to.
        </p>
      </section>

      <div className={styles.card}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'single' ? styles.tabActive : ''}`}
            onClick={() => switchTab('single')}
          >
            ↓ Single Article
          </button>
          <button
            className={`${styles.tab} ${tab === 'all' ? styles.tabActive : ''}`}
            onClick={() => switchTab('all')}
          >
            ⊞ All Articles
          </button>
        </div>

        {tab === 'single' ? (
          <form className={styles.form} onSubmit={handleSingle}>
            <label className={styles.fieldLabel}>Article URL</label>
            <input
              className={styles.input}
              type="url"
              placeholder="https://example.substack.com/p/article-slug"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btnPrimary} type="submit" disabled={loading}>
              {loading ? 'Downloading…' : '↓ Download as Markdown'}
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={handleAll}>
            <label className={styles.fieldLabel}>Publication URL</label>
            <input
              className={styles.input}
              type="url"
              placeholder="https://example.substack.com"
              value={pubUrl}
              onChange={(e) => setPubUrl(e.target.value)}
              required
            />
            <label className={`${styles.fieldLabel} ${styles.fieldGap}`}>
              substack.sid Cookie
            </label>
            <input
              className={styles.input}
              type="password"
              placeholder="s%3A..."
              value={sid}
              onChange={(e) => setSid(e.target.value)}
              required
            />
            <p className={styles.hint}>
              Chrome → DevTools → Application → Cookies → substack.com →{' '}
              <code>substack.sid</code>
            </p>
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btnPrimary} type="submit" disabled={loading}>
              {loading ? 'Fetching articles…' : '↓ Download All as ZIP'}
            </button>
          </form>
        )}
      </div>

      <div className={styles.pills} id="features">
        {['Free articles', 'Paywalled content', 'Bulk ZIP download', 'Clean Markdown output'].map(
          (f) => (
            <div key={f} className={styles.pill}>
              <span className={styles.pillDot} />
              {f}
            </div>
          )
        )}
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerBrand}>
          Off<span className={styles.footerAccent}>Stack</span>Vault
        </span>
        <span className={styles.footerNote}>Not affiliated with Substack</span>
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: all 8 tests pass.

- [ ] **Step 3: Start dev server and verify visually**

```bash
npm run dev
```

Open `http://localhost:3000`. Verify:
- Accent bar is visible at the top (orange gradient)
- Logo reads **Off**`Stack`**Vault** with orange "Stack"
- Hero headline renders with orange underline under "off"
- Tabs switch between Single Article and All Articles
- Single tab: URL input + Download button
- All Articles tab: Publication URL + sid input + hint text + Download All button
- Feature pills appear below the card
- Footer reads "Not affiliated with Substack"

- [ ] **Step 4: Commit**

```bash
git add src/app/page.js
git commit -m "feat: build OffStackVault UI — two-tab download interface"
```

---

## Task 10: Smoke Test & Final Cleanup

- [ ] **Step 1: Full test run**

```bash
npm test
```

Expected: 8 tests, all passing, 0 failures.

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: `Route (app)` table shows `/`, `/api/convert`, `/api/convert-all`. No build errors.

- [ ] **Step 3: Manually test single article download**

With dev server running (`npm run dev`):
1. Go to `http://localhost:3000`
2. Enter a public Substack article URL (e.g. any from `https://sirupsen.substack.com/p/napkin-math`)
3. Click "Download as Markdown"
4. Verify a `.md` file is downloaded and opens with readable content

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: OffStackVault MVP complete"
```
