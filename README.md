# OffStackVault

Download any Substack article as a clean Markdown file — public posts or paywalled content you subscribe to.

## What it does

**Single article** — Paste any Substack article URL and download it as a `.md` file instantly.

**All articles** — Enter a publication URL and your `substack.sid` session cookie to bulk-download an entire archive as a ZIP of Markdown files. Works for paid newsletters you're subscribed to.

## Stack

- **Next.js 14** (App Router) — frontend + API routes
- **cheerio** — server-side HTML parsing
- **turndown** — HTML → Markdown conversion
- **archiver** — in-memory ZIP generation
- Deployed on **Vercel**

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How to get your `substack.sid` cookie

1. Open Chrome and log in to [substack.com](https://substack.com)
2. Open DevTools (`Ctrl+Shift+I`) → **Application** tab → **Cookies** → `https://substack.com`
3. Copy the value of the cookie named `substack.sid`
4. Paste it into the **All Articles** tab on the site

## Deploy to Vercel

Push to GitHub and connect the repo in [vercel.com](https://vercel.com). No environment variables needed.

> Bulk downloads require a Vercel **Pro** plan due to the 60-second function timeout.

## Notes

- Not affiliated with Substack
- Only download content you have legitimate access to
