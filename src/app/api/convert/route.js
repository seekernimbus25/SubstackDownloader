import { NextResponse } from 'next/server';
import { fetchArticle } from '@/lib/substack';
import { toDocx, toPdf } from '@/lib/converters';
import { assertSafeSubstackTargetUrl } from '@/lib/urlValidation';
import { humanizeMarkdownForExport } from '@/lib/markdownExport';

export async function POST(request) {
  const { url, sid, format = 'md', browserCapture = false } = await request.json();
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }
  if (browserCapture && !sid) {
    return NextResponse.json(
      {
        error:
          'browserCapture requires a valid session cookie (substack.sid on *.substack.com, connect.sid on custom domains)',
      },
      { status: 400 }
    );
  }

  try {
    assertSafeSubstackTargetUrl(url);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  try {
    const result = await fetchArticle(url, sid || '', { browserCapture });
    const { markdown, title, warnings, html_body_fallback, browser_capture } = result;
    const exportMarkdown = humanizeMarkdownForExport(markdown);
    const slug = (title || 'article')
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase()
      .replace(/^-|-$/g, '');

    if (format === 'docx') {
      const buffer = await toDocx(title, exportMarkdown);
      return new NextResponse(buffer, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${slug}.docx"`,
        },
      });
    }

    if (format === 'pdf') {
      const buffer = await toPdf(title, exportMarkdown);
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${slug}.pdf"`,
        },
      });
    }

    return NextResponse.json({
      markdown,
      title,
      warnings: warnings ?? null,
      html_body_fallback: Boolean(html_body_fallback),
      browser_capture: Boolean(browser_capture),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
