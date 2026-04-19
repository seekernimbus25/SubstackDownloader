import { NextResponse } from 'next/server';
import { bulkExportFilenameFromListPost, fetchPublicationPostList } from '@/lib/substack';
import { assertSafeSubstackTargetUrl } from '@/lib/urlValidation';

export async function POST(request) {
  const { url, sid } = await request.json();
  if (!url || !sid) {
    return NextResponse.json({ error: 'url and sid are required' }, { status: 400 });
  }

  try {
    assertSafeSubstackTargetUrl(url);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  try {
    const posts = await fetchPublicationPostList(url, sid);
    const items = posts.map((post) => ({
      slug: post.slug,
      title: post.title || '',
      post_date: post.post_date || '',
      filename: bulkExportFilenameFromListPost(post),
    }));
    return NextResponse.json({
      publication: new URL(url).hostname,
      count: items.length,
      posts: items,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to list posts' }, { status: 500 });
  }
}
