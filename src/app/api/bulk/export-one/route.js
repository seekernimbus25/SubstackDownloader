import { NextResponse } from 'next/server';
import { addBulkExportFrontmatter, exportBulkPostEntry } from '@/lib/substack';
import { assertSafeSubstackTargetUrl } from '@/lib/urlValidation';

/** Per-article work can be slow when browser capture is on. */
export const maxDuration = 800;

export async function POST(request) {
  const { url, sid, slug, browserCapture = false, listPost = null } = await request.json();
  if (!url || !sid || !slug) {
    return NextResponse.json({ error: 'url, sid, and slug are required' }, { status: 400 });
  }

  try {
    assertSafeSubstackTargetUrl(url);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  try {
    const { filename, markdown, meta } = await exportBulkPostEntry(url, sid, slug, {
      browserCapture: Boolean(browserCapture),
      playwrightContext: null,
      listPost: listPost && typeof listPost === 'object' ? listPost : null,
    });
    const markdownWithFrontmatter = addBulkExportFrontmatter(markdown, meta);
    return NextResponse.json({
      filename,
      markdown: markdownWithFrontmatter,
      meta,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Export failed', slug },
      { status: 500 }
    );
  }
}
