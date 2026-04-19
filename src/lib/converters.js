import { BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument as PdfDocument, StandardFonts, rgb } from 'pdf-lib';

function parseInlineRuns(line) {
  return line
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return new TextRun({ text: part.slice(2, -2), bold: true });
      }
      return new TextRun({ text: part });
    });
}

function stripInlineMarkdown(line) {
  return line
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
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

    children.push(new Paragraph({ children: parseInlineRuns(line) }));
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
