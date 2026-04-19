# OffStackVault

Turn Substack posts into clean, portable Markdown in seconds.

OffStackVault helps writers, researchers, and readers export newsletters they already have access to, so they can save, search, and reuse content in their own workflows.

## Why OffStackVault

- Export a **single article** as a `.md` file
- Export **entire publications** as a ZIP of Markdown files
- Keep readable formatting and metadata
- Works with paywalled content you are authorized to access (via your session cookie: `substack.sid` on `*.substack.com`, or `connect.sid` on custom domains)
- Optional browser capture for posts that only fully render after Substack's app hydrates
- Fast, simple UI with no signup and no database required

## How It Works

### Single Article

1. Paste a Substack article URL.
2. Click convert.
3. Download Markdown instantly.

### All Articles (Bulk Export)

1. Paste a Substack publication URL.
2. Add your session cookie (see below).
3. Download a ZIP containing all converted posts.

## Session cookies

Substack uses different cookie names depending on the site:

| Site | Cookie name | Where to find it |
|------|-------------|------------------|
| `*.substack.com` (e.g. `author.substack.com`) | `substack.sid` | Cookies for `https://substack.com` or your publication host |
| Custom domain (e.g. `lennysnewsletter.com`) | `connect.sid` | Cookies for that exact domain |

1. Sign in to the publication in your browser.
2. Open DevTools (`Ctrl+Shift+I`) → **Application** → **Cookies** → select the site you’re using.
3. Copy the **value** of `substack.sid` or `connect.sid` (whichever exists for that site).
4. Paste it into **Connect Substack** in OffStackVault.

## Run Locally

```bash
npm install
npx playwright install chromium
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Useful Commands

```bash
npm run build
npm run lint
npm test
```

## Deploy

Deploy on [Vercel](https://vercel.com) by importing this repository.

- No environment variables required
- Bulk export route uses `maxDuration = 300`
- Browser capture needs Playwright Chromium available on the host
- For large browser-capture ZIP jobs, self-hosted Node is the simplest target because serverless runtimes may time out

## For Developers

- Built with **Next.js 14** (App Router) + **React 18**
- Conversion powered by **cheerio** and **turndown**
- Optional browser capture powered by **Playwright**
- Bulk ZIP generation via **archiver**
- Unit tests with **Jest**

## Responsible Use

- OffStackVault is not affiliated with Substack.
- Export only content you are legally and ethically authorized to access.
