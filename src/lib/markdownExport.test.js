import { humanizeMarkdownForExport } from './markdownExport.js';

describe('humanizeMarkdownForExport', () => {
  it('turns markdown links into text plus URL', () => {
    const out = humanizeMarkdownForExport('[Aakash](https://substack.com/@aakash)');
    expect(out).toContain('Aakash');
    expect(out).toContain('https://substack.com/@aakash');
    expect(out).not.toContain('[');
  });

  it('turns markdown images into figure label and URL line', () => {
    const out = humanizeMarkdownForExport('![](https://cdn.example.com/x.png)');
    expect(out).toContain('Figure: Image');
    expect(out).toContain('https://cdn.example.com/x.png');
    expect(out).not.toContain('![');
  });
});
