import { NextResponse } from 'next/server';
import { fetchArticle } from '@/lib/substack';

export async function POST(request) {
  const { url } = await request.json();
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }
  if (!parsed.hostname.endsWith('.substack.com') && parsed.hostname !== 'substack.com') {
    return NextResponse.json({ error: 'URL must be a Substack domain' }, { status: 400 });
  }

  try {
    const { markdown, title } = await fetchArticle(url);
    return NextResponse.json({ markdown, title });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
