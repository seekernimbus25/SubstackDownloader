import { NextResponse } from 'next/server';
import { validateSubstackSid } from '@/lib/substack';
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
    await validateSubstackSid(url, sid);
    return NextResponse.json({ connected: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
