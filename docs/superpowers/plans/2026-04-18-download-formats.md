# Download Format Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `.md`, `.docx`, and `.pdf` download format options to both the Single Article and All Articles tabs, with format selected via a segmented toggle before submitting.

**Architecture:** A new `src/lib/converters.js` module exports `toDocx` and `toPdf` (pure functions: markdown string in, Buffer out). Both API routes gain an optional `format` param (default `"md"`) that calls the appropriate converter before responding. The client adds a shared `format` state and a segmented toggle UI above the submit button in both forms.

**Tech Stack:** Next.js 14 (App Router), `docx` npm package (DOCX generation), `pdfkit` npm package (PDF generation), `archiver` (already installed, for ZIP), React useState

---

## File Map

| File | Change |
|---|---|
| `src/lib/converters.js` | **New** — `toDocx(title, markdownText)` and `toPdf(title, markdownText)` |
| `src/lib/converters.test.js` | **New** — unit tests for both converter functions |
| `src/app/api/convert/route.js` | **Modify** — add `format` param, return binary for docx/pdf |
| `src/app/api/convert-all/route.js` | **Modify** — add `format` param, convert before archiving |
| `src/app/page.js` | **Modify** — format state, toggle UI, updated download handlers |
| `src/app/page.module.css` | **Modify** — segmented toggle styles |

---

## Task 1: Install Dependencies

**Files:** `package.json` (modified by npm)

- [ ] **Step 1: Install docx and pdfkit**

```bash
npm install docx pdfkit
```

Expected output: `added N packages` with no errors.

- [ ] **Step 2: Verify installation**

```bash
node -e "require('docx'); require('pdfkit'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add docx and pdfkit dependencies"
```

---

## Task 2: Converter Library (TDD)

**Files:**
- Create: `src/lib/converters.test.js`
- Create: `src/lib/converters.js`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/converters.test.js`:

```js
import { toDocx, toPdf } from './converters.js';

const SAMPLE_MD = `# Test Title

**Author:** Jane Doe  
**Date:** 2024-01-15

---

## Section One

### Sub-heading

Some body text with **bold** and *italic* content.

`;

describe('toDocx', () => {
  it('returns a Buffer', async () => {
    const buf = await toDocx('Test Title', SAMPLE_MD);
    expect(buf).toBeInstanceOf(Buffer);
  });

  it('produces a valid DOCX (ZIP) file — magic bytes PK', async () => {
    const buf = await toDocx('Test Title', SAMPLE_MD);
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
  });

  it('does not throw on empty markdown', async () => {
    await expect(toDocx('Empty', '')).resolves.toBeInstanceOf(Buffer);
  });
});

describe('toPdf', () => {
  it('returns a Buffer', async () => {
    const buf = await toPdf('Test Title', SAMPLE_MD);
    expect(buf).toBeInstanceOf(Buffer);
  });

  it('produces a valid PDF — magic bytes %PDF', async () => {
    const buf = await toPdf('Test Title', SAMPLE_MD);
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });

  it('does not throw on empty markdown', async () => {
    await expect(toPdf('Empty', '')).resolves.toBeInstanceOf(Buffer);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=converters
```

Expected: FAIL — `Cannot find module './converters.js'`

- [ ] **Step 3: Write the converter implementation**

Create `src/lib/converters.js`:

```js
import { Document, Paragraph, TextRun, HeadingLevel, Packer, BorderStyle } from 'docx';
import PDFDocument from 'pdfkit';

/**
 * Split a line into TextRun segments, making **text** bold.
 * Returns an array of docx TextRun objects.
 */
function parseInlineBold(line) {
  const parts = line.split(/(\*\*[^*]+\*\*)/);
  return parts
    .filter((p) => p.length > 0)
    .map((part) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return new TextRun({ text: part.slice(2, -2), bold: true });
      }
      return new TextRun({ text: part });
    });
}

/**
 * Convert a markdown string to a .docx Buffer.
 * Handles: # h1, ## h2, ### h3, ---, blank lines, inline **bold**.
 */
export async function toDocx(_title, markdownText) {
  const lines = markdownText.split('\n');
  const children = [];

  for (const line of lines) {
    if (line.startsWith('# ')) {
      children.push(new Paragraph({ text: line.slice(2).trim(), heading: HeadingLevel.HEADING_1 }));
    } else if (line.startsWith('## ')) {
      children.push(new Paragraph({ text: line.slice(3).trim(), heading: HeadingLevel.HEADING_2 }));
    } else if (line.startsWith('### ')) {
      children.push(new Paragraph({ text: line.slice(4).trim(), heading: HeadingLevel.HEADING_3 }));
    } else if (line.trim() === '---') {
      children.push(
        new Paragraph({
          border: {
            bottom: { color: 'AAAAAA', space: 1, style: BorderStyle.SINGLE, size: 6 },
          },
          children: [],
        })
      );
    } else {
      children.push(new Paragraph({ children: parseInlineBold(line) }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

/**
 * Convert a markdown string to a .pdf Buffer.
 * Handles: # h1, ## h2, ### h3, ---, blank lines, body text (strips inline markers).
 */
export function toPdf(_title, markdownText) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 72, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const lines = markdownText.split('\n');

    for (const line of lines) {
      if (line.startsWith('# ')) {
        doc.fontSize(22).font('Helvetica-Bold').text(line.slice(2).trim(), { paragraphGap: 8 });
      } else if (line.startsWith('## ')) {
        doc.fontSize(16).font('Helvetica-Bold').text(line.slice(3).trim(), { paragraphGap: 6 });
      } else if (line.startsWith('### ')) {
        doc.fontSize(13).font('Helvetica-Bold').text(line.slice(4).trim(), { paragraphGap: 4 });
      } else if (line.trim() === '---') {
        const y = doc.y + 6;
        doc
          .moveTo(72, y)
          .lineTo(doc.page.width - 72, y)
          .stroke('#AAAAAA');
        doc.moveDown(0.5);
      } else if (line.trim() === '') {
        doc.moveDown(0.3);
      } else {
        const text = line
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1');
        doc.fontSize(11).font('Helvetica').text(text, { paragraphGap: 4 });
      }
    }

    doc.end();
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=converters
```

Expected: PASS — 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/converters.js src/lib/converters.test.js
git commit -m "feat: add toDocx and toPdf converter functions"
```

---

## Task 3: Update Single Article API Route

**Files:**
- Modify: `src/app/api/convert/route.js`

- [ ] **Step 1: Replace the route file**

Overwrite `src/app/api/convert/route.js` with:

```js
import { NextResponse } from 'next/server';
import { fetchArticle } from '@/lib/substack';
import { toDocx, toPdf } from '@/lib/converters';

export async function POST(request) {
  const { url, format = 'md' } = await request.json();
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }
  if (!parsed.hostname.endsWith('.substack.com') && parsed.hostname !== 'substack.com') {
    return NextResponse.json({ error: 'URL must be a Substack domain' }, { status: 400 });
  }

  try {
    const { markdown, title } = await fetchArticle(url);

    const slug = (title || 'article')
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase()
      .replace(/^-|-$/g, '');

    if (format === 'docx') {
      const buffer = await toDocx(title, markdown);
      return new NextResponse(buffer, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${slug}.docx"`,
        },
      });
    }

    if (format === 'pdf') {
      const buffer = await toPdf(title, markdown);
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${slug}.pdf"`,
        },
      });
    }

    // default: md
    return NextResponse.json({ markdown, title });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Run existing tests to confirm nothing broke**

```bash
npm test -- --testPathPattern=substack
```

Expected: PASS — all existing substack tests pass

- [ ] **Step 3: Commit**

```bash
git add src/app/api/convert/route.js
git commit -m "feat: add format param to single article API route"
```

---

## Task 4: Update All Articles API Route

**Files:**
- Modify: `src/app/api/convert-all/route.js`

- [ ] **Step 1: Replace the route file**

Overwrite `src/app/api/convert-all/route.js` with:

```js
import { NextResponse } from 'next/server';
import { fetchAllPosts } from '@/lib/substack';
import { toDocx, toPdf } from '@/lib/converters';
import archiver from 'archiver';

export const maxDuration = 60;

export async function POST(request) {
  const { url, sid, format = 'md' } = await request.json();
  if (!url || !sid) {
    return NextResponse.json({ error: 'url and sid are required' }, { status: 400 });
  }

  let hostname;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    if (!hostname.endsWith('.substack.com') && hostname !== 'substack.com') {
      return NextResponse.json({ error: 'URL must be a Substack domain' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    const posts = await fetchAllPosts(url, sid);
    if (!posts.length) {
      return NextResponse.json(
        { error: 'No posts found — check the URL and your cookie' },
        { status: 404 }
      );
    }

    const chunks = [];
    await new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', resolve);
      archive.on('error', reject);

      (async () => {
        for (const { filename, markdown } of posts) {
          if (format === 'docx') {
            const buffer = await toDocx('', markdown);
            archive.append(buffer, { name: filename.replace(/\.md$/, '.docx') });
          } else if (format === 'pdf') {
            const buffer = await toPdf('', markdown);
            archive.append(buffer, { name: filename.replace(/\.md$/, '.pdf') });
          } else {
            archive.append(markdown, { name: filename });
          }
        }
        archive.finalize();
      })().catch(reject);
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

Expected: PASS — all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/app/api/convert-all/route.js
git commit -m "feat: add format param to convert-all API route"
```

---

## Task 5: Client UI — Format Toggle and Updated Handlers

**Files:**
- Modify: `src/app/page.js`
- Modify: `src/app/page.module.css`

- [ ] **Step 1: Add segmented toggle styles to page.module.css**

Add the following at the end of `src/app/page.module.css` (before the closing `@media` block, or after it — doesn't matter):

```css
/* ---- Format Toggle ---- */
.formatToggle {
  display: flex;
  gap: 0;
  margin-bottom: 14px;
  border: 1.5px solid #e0ded8;
  border-radius: 8px;
  overflow: hidden;
  background: #faf9f6;
}

.formatBtn {
  flex: 1;
  height: 34px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #aaa;
  background: none;
  border: none;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.formatBtn + .formatBtn {
  border-left: 1.5px solid #e0ded8;
}

.formatBtnActive {
  background: #1a1a1a;
  color: #fff;
}
```

- [ ] **Step 2: Replace page.js with updated version**

Overwrite `src/app/page.js` with:

```js
'use client';
import { useState } from 'react';
import styles from './page.module.css';

const FORMAT_LABELS = { md: 'Markdown', docx: 'DOCX', pdf: 'PDF' };

export default function Home() {
  const [tab, setTab] = useState('single');
  const [url, setUrl] = useState('');
  const [pubUrl, setPubUrl] = useState('');
  const [sid, setSid] = useState('');
  const [format, setFormat] = useState('md');
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
        body: JSON.stringify({ url, format }),
      });

      let blob;
      let filename;

      if (format === 'md') {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        blob = new Blob([data.markdown], { type: 'text/markdown' });
        const slug = (data.title || 'article')
          .replace(/[^a-z0-9]+/gi, '-')
          .toLowerCase()
          .replace(/^-|-$/g, '');
        filename = `${slug}.md`;
      } else {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error);
        }
        blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="([^"]+)"/);
        filename = match ? match[1] : `article.${format}`;
      }

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
        body: JSON.stringify({ url: pubUrl, sid, format }),
      });
      if (!res.ok) {
        let message = `Server error: ${res.status}`;
        try {
          const data = await res.json();
          if (data.error) message = data.error;
        } catch {}
        throw new Error(message);
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'offstackvault-articles.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const formatToggle = (
    <div className={styles.formatToggle}>
      {['md', 'docx', 'pdf'].map((f) => (
        <button
          key={f}
          type="button"
          className={`${styles.formatBtn} ${format === f ? styles.formatBtnActive : ''}`}
          onClick={() => setFormat(f)}
        >
          {f.toUpperCase()}
        </button>
      ))}
    </div>
  );

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
          Download any Substack article as <strong>Markdown, DOCX, or PDF</strong> —
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
            <label className={styles.fieldLabel} htmlFor="single-url">Article URL</label>
            <input
              id="single-url"
              className={styles.input}
              type="url"
              placeholder="https://example.substack.com/p/article-slug"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            {formatToggle}
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btnPrimary} type="submit" disabled={loading}>
              {loading ? 'Downloading…' : `↓ Download as ${FORMAT_LABELS[format]}`}
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={handleAll}>
            <label className={styles.fieldLabel} htmlFor="pub-url">Publication URL</label>
            <input
              id="pub-url"
              className={styles.input}
              type="url"
              placeholder="https://example.substack.com"
              value={pubUrl}
              onChange={(e) => setPubUrl(e.target.value)}
              required
            />
            <label className={`${styles.fieldLabel} ${styles.fieldGap}`} htmlFor="sid-input">
              substack.sid Cookie
            </label>
            <input
              id="sid-input"
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
            {formatToggle}
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btnPrimary} type="submit" disabled={loading}>
              {loading ? 'Fetching articles…' : `↓ Download ZIP (${FORMAT_LABELS[format]})`}
            </button>
          </form>
        )}
      </div>

      <div className={styles.pills} id="features">
        {['Free articles', 'Paywalled content', 'Bulk ZIP download', 'MD · DOCX · PDF output'].map(
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

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: PASS — all tests pass

- [ ] **Step 4: Smoke test in dev**

```bash
npm run dev
```

Open `http://localhost:3000`. Verify:
- Format toggle shows MD / DOCX / PDF, defaults to MD
- Button label changes when toggle changes
- Toggle is shared — switching Single ↔ All tab keeps the same format selected
- Existing MD download still works

- [ ] **Step 5: Commit**

```bash
git add src/app/page.js src/app/page.module.css
git commit -m "feat: add format toggle UI and update download handlers"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** UI toggle ✓, format param on both routes ✓, converters module ✓, zip with per-format files ✓, client handler branching ✓
- [x] **Placeholders:** None — all steps contain complete code
- [x] **Type consistency:** `toDocx`/`toPdf` signatures match across converters.js, route files, and test file; `format` state flows from page.js → fetch body → route handler → converter call
