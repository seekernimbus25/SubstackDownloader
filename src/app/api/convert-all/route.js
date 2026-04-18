import { NextResponse } from 'next/server';
import { fetchAllPosts } from '@/lib/substack';
import archiver from 'archiver';

export const maxDuration = 60;

export async function POST(request) {
  const { url, sid } = await request.json();
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
      return NextResponse.json({ error: 'No posts found — check the URL and your cookie' }, { status: 404 });
    }

    const chunks = [];
    await new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', resolve);
      archive.on('error', reject);
      for (const { filename, markdown } of posts) {
        archive.append(markdown, { name: filename });
      }
      archive.finalize();
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
