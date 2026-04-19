# OffStackVault

Turn Substack posts into clean, portable Markdown in seconds.

OffStackVault helps writers, researchers, and readers export newsletters they already have access to, so they can save, search, and reuse content in their own workflows.

## Why OffStackVault

- Export a **single article** as a `.md` file
- Export **entire publications** as a ZIP of Markdown files
- Keep readable formatting and metadata
- Works with paywalled content you are authorized to access (via your `substack.sid`)
- Optional browser capture for posts that only fully render after Substack's app hydrates
- Fast, simple UI with no signup and no database required

## How It Works

### Single Article

1. Paste a Substack article URL.
2. Click convert.
3. Download Markdown instantly.

### All Articles (Bulk Export)

1. Paste a Substack publication URL.
2. Add your `substack.sid` cookie.
3. Download a ZIP containing all converted posts.

## Get Your `substack.sid` Cookie

1. Sign in to [substack.com](https://substack.com).
2. Open browser DevTools (`Ctrl+Shift+I`) -> **Application**.
3. Go to **Cookies** -> `https://substack.com`.
4. Copy the value of `substack.sid`.
5. Paste it into the OffStackVault **All Articles** tab.

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
