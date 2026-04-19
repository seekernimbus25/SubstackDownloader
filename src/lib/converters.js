import { BorderStyle, Document, ExternalHyperlink, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument as PdfDocument, StandardFonts, rgb } from 'pdf-lib';

async function fetchImageBuffer(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function detectImageFormat(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP')
    return 'webp';
  return null;
}

function getPngDimensions(buf) {
  if (buf.length < 24) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function getJpegDimensions(buf) {
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3 && i + 9 <= buf.length) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    const segLen = buf.readUInt16BE(i + 2);
    i += 2 + segLen;
  }
  return null;
}

function getImageDimensions(buf, format) {
  if (format === 'png') return getPngDimensions(buf);
  if (format === 'jpg') return getJpegDimensions(buf);
  return null;
}

// Matches a line that is solely an image: ![alt](url)
function parseImageMarkdown(line) {
  const m = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
  return m ? { alt: (m[1] || '').trim() || 'Image', url: m[2] } : null;
}

// Parses inline markdown for DOCX: **bold** and [text](url)
function parseInlineRunsDocx(line) {
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const runs = [];
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: line.slice(lastIndex, match.index) }));
    }
    const m = match[0];
    if (m.startsWith('**')) {
      runs.push(new TextRun({ text: m.slice(2, -2), bold: true }));
    } else {
      const lm = m.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (lm) {
        runs.push(
          new ExternalHyperlink({
            link: lm[2],
            children: [new TextRun({ text: lm[1], style: 'Hyperlink' })],
          })
        );
      }
    }
    lastIndex = match.index + m.length;
  }
  if (lastIndex < line.length) {
    runs.push(new TextRun({ text: line.slice(lastIndex) }));
  }
  return runs.length ? runs : [new TextRun({ text: line })];
}

// For PDF: strip markdown syntax, keep link display text (drop URL)
function stripInlineMarkdown(line) {
  return line
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/**
 * Standard PDF fonts (Helvetica) use WinAnsi; many Unicode chars (e.g. ∙ U+2219) cannot be encoded.
 * Map common typography to Latin-1 / ASCII; replace anything else with a safe fallback.
 */
function encodeForStandardPdfFonts(input) {
  const explicit = {
    '\u2219': '\u00B7', // bullet operator -> middle dot
    '\u22C5': '\u00B7', // dot operator
    '\u2022': '\u00B7', // bullet
    '\u2023': '-',
    '\u2043': '-',
    '\u2010': '-',
    '\u2011': '-',
    '\u2012': '-',
    '\u2013': '-',
    '\u2014': '--',
    '\u2212': '-',
    '\u2018': "'",
    '\u2019': "'",
    '\u201C': '"',
    '\u201D': '"',
    '\u2026': '...',
    '\u00A0': ' ',
    '\u00AB': '"',
    '\u00BB': '"',
    '\u2032': "'",
    '\u2033': '"',
    '\u25AA': '\u00B7', // small black square
    '\u25CF': '\u00B7',
    '\u25CB': 'o',
    '\u25E6': 'o',
    '\u204C': '-',
    '\u204D': '-',
  };

  let s = input.normalize('NFKC');
  let out = '';
  for (const ch of s) {
    if (explicit[ch] !== undefined) {
      out += explicit[ch];
      continue;
    }
    const cp = ch.codePointAt(0);
    if (cp <= 0x7e && cp >= 0x20) {
      out += ch;
      continue;
    }
    if (cp >= 0xa0 && cp <= 0xff) {
      out += ch;
      continue;
    }
    out += '?';
  }
  return out;
}

const DOCX_MAX_IMG_WIDTH = 480;

export async function toDocx(_title, markdownText) {
  const children = [];

  for (const line of markdownText.split('\n')) {
    if (line.startsWith('# ')) {
      children.push(
        new Paragraph({ text: line.slice(2).trim(), heading: HeadingLevel.HEADING_1 })
      );
      continue;
    }

    if (line.startsWith('## ')) {
      children.push(
        new Paragraph({ text: line.slice(3).trim(), heading: HeadingLevel.HEADING_2 })
      );
      continue;
    }

    if (line.startsWith('### ')) {
      children.push(
        new Paragraph({ text: line.slice(4).trim(), heading: HeadingLevel.HEADING_3 })
      );
      continue;
    }

    if (line.trim() === '---') {
      children.push(
        new Paragraph({
          border: {
            bottom: { color: 'AAAAAA', space: 1, style: BorderStyle.SINGLE, size: 6 },
          },
        })
      );
      continue;
    }

    if (line.trim() === '') {
      children.push(new Paragraph({ text: '' }));
      continue;
    }

    const imgMd = parseImageMarkdown(line);
    if (imgMd) {
      const buf = await fetchImageBuffer(imgMd.url);
      let embedded = false;
      if (buf) {
        const fmt = detectImageFormat(buf);
        if (fmt && fmt !== 'webp') {
          const rawDims = getImageDimensions(buf, fmt);
          const dims = rawDims || { width: DOCX_MAX_IMG_WIDTH, height: Math.round(DOCX_MAX_IMG_WIDTH * 0.6) };
          const scale = dims.width > DOCX_MAX_IMG_WIDTH ? DOCX_MAX_IMG_WIDTH / dims.width : 1;
          try {
            children.push(
              new Paragraph({
                children: [
                  new ImageRun({
                    data: buf,
                    transformation: {
                      width: Math.round(dims.width * scale),
                      height: Math.round(dims.height * scale),
                    },
                    type: fmt,
                  }),
                ],
              })
            );
            if (imgMd.alt !== 'Image') {
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: imgMd.alt, italics: true, size: 18, color: '666666' }),
                  ],
                })
              );
            }
            embedded = true;
          } catch {
            // fall through to text fallback
          }
        }
      }
      if (!embedded) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `[Image: ${imgMd.alt}]`, italics: true })],
          })
        );
      }
      continue;
    }

    children.push(new Paragraph({ children: parseInlineRunsDocx(line) }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function toPdf(_title, markdownText) {
  const pdf = await PdfDocument.create();
  const pageSize = { width: 595.28, height: 841.89 }; // A4
  const margin = 56;
  const maxWidth = pageSize.width - margin * 2;
  const textColor = rgb(0.12, 0.12, 0.12);
  const ruleColor = rgb(0.67, 0.67, 0.67);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([pageSize.width, pageSize.height]);
  let y = pageSize.height - margin;

  const ensureSpace = (heightNeeded) => {
    if (y - heightNeeded > margin) return;
    page = pdf.addPage([pageSize.width, pageSize.height]);
    y = pageSize.height - margin;
  };

  const wrapText = (text, font, size) => {
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let current = words[0];
    for (const word of words.slice(1)) {
      const next = `${current} ${word}`;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
    return lines;
  };

  const drawWrapped = (text, { font, size, gapAfter = 4 }) => {
    const safe = encodeForStandardPdfFonts(text);
    const lines = wrapText(safe, font, size);
    for (const line of lines) {
      ensureSpace(size + 4);
      page.drawText(line, { x: margin, y: y - size, size, font, color: textColor });
      y -= size + 4;
    }
    y -= gapAfter;
  };

  for (const rawLine of markdownText.split('\n')) {
    // Handle image lines before stripping
    const imgMd = parseImageMarkdown(rawLine);
    if (imgMd) {
      const buf = await fetchImageBuffer(imgMd.url);
      let embedded = false;
      if (buf) {
        const fmt = detectImageFormat(buf);
        try {
          let pdfImage = null;
          if (fmt === 'png') pdfImage = await pdf.embedPng(buf);
          else if (fmt === 'jpg') pdfImage = await pdf.embedJpg(buf);

          if (pdfImage) {
            const { width: imgW, height: imgH } = pdfImage.size();
            const scale = Math.min(maxWidth / imgW, 1);
            const drawW = imgW * scale;
            const drawH = imgH * scale;
            ensureSpace(drawH + 12);
            page.drawImage(pdfImage, { x: margin, y: y - drawH, width: drawW, height: drawH });
            y -= drawH + 4;
            if (imgMd.alt !== 'Image') {
              drawWrapped(imgMd.alt, { font: regular, size: 9, gapAfter: 8 });
            } else {
              y -= 8;
            }
            embedded = true;
          }
        } catch {
          // fall through to text fallback
        }
      }
      if (!embedded) {
        drawWrapped(`[Image: ${imgMd.alt}]`, { font: regular, size: 11, gapAfter: 4 });
      }
      continue;
    }

    const line = stripInlineMarkdown(rawLine).trimEnd();

    if (line.startsWith('# ')) {
      drawWrapped(line.slice(2).trim(), { font: bold, size: 22, gapAfter: 8 });
      continue;
    }

    if (line.startsWith('## ')) {
      drawWrapped(line.slice(3).trim(), { font: bold, size: 16, gapAfter: 6 });
      continue;
    }

    if (line.startsWith('### ')) {
      drawWrapped(line.slice(4).trim(), { font: bold, size: 13, gapAfter: 5 });
      continue;
    }

    if (line.trim() === '---') {
      ensureSpace(12);
      const yRule = y - 3;
      page.drawLine({
        start: { x: margin, y: yRule },
        end: { x: pageSize.width - margin, y: yRule },
        color: ruleColor,
        thickness: 1,
      });
      y -= 10;
      continue;
    }

    if (line.trim() === '') {
      y -= 7;
      continue;
    }

    drawWrapped(line, { font: regular, size: 11, gapAfter: 4 });
  }

  return Buffer.from(await pdf.save());
}
