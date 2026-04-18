# OffStackVault — Design Spec

**Date:** 2026-04-17  
**Status:** Approved

---

## Overview

OffStackVault (`offstackvault.com`) is a hosted web app on Vercel that lets anyone download Substack articles as Markdown files — either one at a time by URL, or in bulk (entire publication archive) using their `substack.sid` session cookie for authenticated access to paywalled content.

---

## Architecture

Single Next.js application deployed to Vercel. No Python. No subprocesses.

```
src/
├── lib/
│   └── substack.js          # Core: fetch, parse HTML, convert to Markdown
├── app/
│   ├── page.js              # UI — two-tab interface
│   ├── globals.css          # Global styles
│   ├── api/
│   │   ├── convert/
│   │   │   └── route.js     # POST /api/convert — single article
│   │   └── convert-all/
│   │       └── route.js     # POST /api/convert-all — bulk ZIP
```

**Dependencies to add:**
- `cheerio` — server-side HTML parsing
- `turndown` — HTML → Markdown conversion

**Dependencies already present:**
- `archiver` — ZIP creation (already in package.json)

**Python files** — optional legacy CLI tools (`offstackvault-single-article-cli.py`, `offstackvault-auth-bulk-cli.py`) — are not used by the hosted app.

---

## Core Library: `src/lib/substack.js`

Two exported functions:

### `fetchArticle(url)`
- Fetches the public article URL using `node-fetch`
- Parses HTML with `cheerio`
- Extracts: `<h1>` title, `<meta name="author">`, `<time datetime>`, `<article>` body
- Converts body HTML to Markdown with `turndown`
- Returns `{ title, author, date, markdown }`
- Throws if status !== 200 or no `<article>` found

### `fetchAllPosts(publicationUrl, sid)`
- Calls `https://{host}/api/v1/posts?sort=new&offset=0&limit=25` with cookie header `substack.sid={sid}` — paginating until empty batch
- For each post slug, fetches `https://{host}/api/v1/posts/{slug}` with same cookie
- Converts each post's `body_html` to Markdown, assembles frontmatter (title, subtitle, author, date)
- Returns array of `{ filename, markdown }` where filename is `YYYY-MM-DD-slug.md`

---

## API Routes

### `POST /api/convert`

**Request:** `{ url: string }`  
**Response (success):** `{ markdown: string, title: string }` — 200  
**Response (error):** `{ error: string }` — 400 or 500

Calls `fetchArticle(url)` from `substack.js`. Returns the Markdown string and title to the client. The client triggers the file download in-browser via a Blob URL.

### `POST /api/convert-all`

**Request:** `{ url: string, sid: string }`  
**Response (success):** `application/zip` stream, `Content-Disposition: attachment; filename=offstackvault-{host}.zip` — 200  
**Response (error):** `{ error: string }` — 400 or 500

Calls `fetchAllPosts(url, sid)`, writes each Markdown file into an in-memory `archiver` ZIP stream, pipes it directly to the response. No temp files on disk.

---

## UI: `src/app/page.js`

### Layout
Matches the approved mockup (Option C — Bold & Direct):
- Top accent bar: `#ff4d2e → #ff8c42` gradient, 4px
- Nav: **Off**`Stack`**Vault** logo ("Stack" in orange), "Free Tool" badge, "How it works" link (scrolls to feature pills)
- Hero: eyebrow + large headline *"Your articles, off the platform."* + description
- Main card with two tabs
- Feature pills: Free articles · Paywalled content · Bulk ZIP download · Clean Markdown output
- Footer: brand + "Not affiliated with Substack"

### Tab 1 — Single Article
- One URL input (type="url", required)
- "Download as Markdown" button
- On success: triggers `.md` file download via `URL.createObjectURL(blob)` — filename derived from article title
- Error shown inline below the button in red

### Tab 2 — All Articles
- Publication URL input (e.g. `https://news.aakashg.com`)
- `substack.sid` cookie input (type="password" to mask it) with hint: "Find this in Chrome DevTools → Application → Cookies → substack.com"
- "Download All as ZIP" button
- Progress state: button shows "Fetching…" while loading
- On success: triggers `.zip` download
- Error shown inline

### State
- `activeTab` — `'single' | 'all'`
- `loading` — boolean, disables button and shows spinner text
- `error` — string | null

---

## Repo Changes

1. Remove original remote (`git remote remove origin`) so it's no longer tied to the upstream repo
2. Update `package.json` name to `offstackvault`
3. Replace `README.md` content with OffStackVault description
4. Add `.superpowers/` to `.gitignore`

---

## Out of Scope

- User accounts / saved history
- Other output formats (PDF, HTML)
- Support for non-Substack newsletters
- Rate limiting or abuse protection (MVP)
