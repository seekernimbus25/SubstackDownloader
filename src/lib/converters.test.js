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

  it('produces a valid DOCX file', async () => {
    const buf = await toDocx('Test Title', SAMPLE_MD);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
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

  it('produces a valid PDF file', async () => {
    const buf = await toPdf('Test Title', SAMPLE_MD);
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });

  it('does not throw on empty markdown', async () => {
    await expect(toPdf('Empty', '')).resolves.toBeInstanceOf(Buffer);
  });

  it('does not throw on WinAnsi-unsafe punctuation (e.g. bullet operator U+2219)', async () => {
    const buf = await toPdf('t', 'Item \u2219 note\n');
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });
});
