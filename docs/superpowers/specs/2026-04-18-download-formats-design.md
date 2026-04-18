# Download Format Options — Design Spec

**Date:** 2026-04-18  
**Status:** Approved

## Overview

Add `.md`, `.docx`, and `.pdf` download format options to OffStackVault. Users select a format before submitting; both the Single Article and All Articles tabs support all three formats. All Articles always produces a ZIP, with each article as an individual file in the chosen format.

---

## UI

A segmented toggle (`MD · DOCX · PDF`) appears between the form inputs and the submit button in both tabs. Default is `MD` (preserves current behavior). Format state is shared across both tabs so switching tabs does not reset the selection.

Button labels reflect the chosen format:

| Tab | MD | DOCX | PDF |
|---|---|---|---|
| Single | ↓ Download as Markdown | ↓ Download as DOCX | ↓ Download as PDF |
| All | ↓ Download ZIP (Markdown) | ↓ Download ZIP (DOCX) | ↓ Download ZIP (PDF) |

One new CSS block added to `page.module.css` for the segmented control styling.

---

## Converter Library (`src/lib/converters.js`)

New module exporting two pure functions:

```js
toDocx(title, markdownText) → Buffer   // uses `docx` npm package
toPdf(title, markdownText)  → Buffer   // uses `pdfkit` npm package
```

Both parse the markdown string and render styled output:
- `toDocx`: headings, bold, body paragraphs as `docx` Paragraph objects
- `toPdf`: h1 large, h2 medium, body normal, bold/italic inline via pdfkit text API

No fetching, no side effects. `src/lib/substack.js` is unchanged.

---

## API Routes

### `/api/convert` (single article)

Request body gains optional `format` field (default: `"md"`).

| format | Response |
|---|---|
| `"md"` | JSON `{ markdown, title }` — current behavior |
| `"docx"` | Binary buffer, `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `"pdf"` | Binary buffer, `Content-Type: application/pdf` |

`Content-Disposition: attachment; filename="<slug>.<ext>"` on binary responses.

### `/api/convert-all` (all articles)

Request body gains optional `format` field (default: `"md"`).

Builds zip as before. Before appending each article:
- `"md"`: append markdown string, filename stays `.md`
- `"docx"`: call `toDocx` → append buffer, filename changed to `.docx`
- `"pdf"`: call `toPdf` → append buffer, filename changed to `.pdf`

Returns zip with `Content-Disposition: attachment; filename="offstackvault-<hostname>.zip"`.

---

## Client (`src/app/page.js`)

- `format` state (default `"md"`) added, shared across both tab forms
- Both `handleSingle` and `handleAll` pass `format` in the request body
- `handleSingle` branches on format:
  - `"md"`: existing JSON path (parse response, create blob from `data.markdown`)
  - `"docx"` / `"pdf"`: treat response as blob directly, use correct file extension
- `handleAll` already treats response as blob — only change is passing `format` and using the correct zip filename hint (zip filename from server header handles this automatically)

---

## Dependencies

Two new packages:

| Package | Purpose |
|---|---|
| `docx` | Generate `.docx` buffers from structured content |
| `pdfkit` | Generate `.pdf` buffers from text/style commands |

Both are pure Node.js, Vercel-compatible, no native binaries.

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/converters.js` | **New** — `toDocx` and `toPdf` functions |
| `src/app/api/convert/route.js` | Add `format` param, binary response paths |
| `src/app/api/convert-all/route.js` | Add `format` param, convert before archiving |
| `src/app/page.js` | Format state, toggle UI, updated handlers |
| `src/app/page.module.css` | Segmented toggle styles |

---

## Out of Scope

- Merged/concatenated single-document output for All Articles
- Custom fonts or advanced PDF styling
- Client-side PDF generation
