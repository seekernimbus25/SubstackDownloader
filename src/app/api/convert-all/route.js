import { NextResponse } from 'next/server';
import {
  fetchAllPosts,
  addBulkExportFrontmatter,
  BULK_SHORT_BODY_WARNING_THRESHOLD,
} from '@/lib/substack';
import archiver from 'archiver';
import { toDocx, toPdf } from '@/lib/converters';
import { assertSafeSubstackTargetUrl } from '@/lib/urlValidation';
import { humanizeMarkdownForExport } from '@/lib/markdownExport';

export const maxDuration = 300;

export async function POST(request) {
  const { url, sid, format = 'md', browserCapture = false } = await request.json();
  if (!url || !sid) {
    return NextResponse.json({ error: 'url and sid are required' }, { status: 400 });
  }

  let hostname;
  try {
    const parsed = assertSafeSubstackTargetUrl(url);
    hostname = parsed.hostname;
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  try {
    const { entries, report } = await fetchAllPosts(url, sid, { browserCapture });
    if (!entries.length) {
      return NextResponse.json(
        {
          error:
            report.posts_listed === 0
              ? 'No posts found — check the URL and your cookie'
              : 'No article files could be exported — every per-post fetch failed. See response details.',
          report,
        },
        { status: 404 }
      );
    }

    const manifestPayload = {
      manifest_version: 1,
      ...report,
      threshold_short_body_html_chars: BULK_SHORT_BODY_WARNING_THRESHOLD,
    };

    const chunks = [];
    await new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', resolve);
      archive.on('error', reject);

      (async () => {
        archive.append(JSON.stringify(manifestPayload, null, 2), {
          name: 'offstackvault-export-manifest.json',
        });

        const readme = [
          'OffStackVault bulk export summary',
          '========================',
          `Publication: ${report.publication}`,
          `Posts in feed: ${report.posts_listed}`,
          `Files written: ${report.files_written}`,
          `Per-post fetch failures: ${report.fetch_failures.length}`,
          `Suspected incomplete / short / word-count mismatch (see manifest): ${report.suspected_incomplete.length}`,
          `Word-count discrepancies only (Substack count vs body HTML): ${report.word_count_discrepancies.length}`,
          `Browser capture enabled: ${browserCapture}`,
          '',
          'Open offstackvault-export-manifest.json: suspected_incomplete, word_count_discrepancies, fetch_failures.',
          'Browser capture is slower and may take many minutes for large archives.',
          'Frontmatter: word_count_discrepancy / html_body_fallback (subscriber page used when longer than API).',
          '',
        ].join('\n');
        archive.append(readme, { name: 'EXPORT_README.txt' });

        for (const { filename, markdown, meta } of entries) {
          const rawMd =
            format === 'md' ? addBulkExportFrontmatter(markdown, meta) : markdown;
          const exportMd =
            format === 'docx' || format === 'pdf' ? humanizeMarkdownForExport(markdown) : rawMd;

          if (format === 'docx') {
            const buffer = await toDocx(filename.replace(/\.md$/, ''), exportMd);
            archive.append(buffer, { name: filename.replace(/\.md$/, '.docx') });
            continue;
          }

          if (format === 'pdf') {
            const buffer = await toPdf(filename.replace(/\.md$/, ''), exportMd);
            archive.append(buffer, { name: filename.replace(/\.md$/, '.pdf') });
            continue;
          }

          archive.append(exportMd, { name: filename });
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
