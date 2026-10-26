import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { NO_STORE } from '@/lib/http';
import { readRestyleList } from '@/lib/restyle';

// 꾸미기 › 사진 시안 목록(방 · 시안 · 사진 이름). 로그인한 두 사람만, 어떤 캐시에도 남기지 않는다. 사진 바이트는 /api/restyle/<사진 이름>.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const a = await getActor(req);
  if (!a.ok) return NextResponse.json({ error: a.status === 401 ? 'unauthorized' : 'forbidden' }, { status: a.status, headers: NO_STORE });
  try {
    const list = await readRestyleList();
    if (!list) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
    return NextResponse.json(list, { headers: { ...NO_STORE, 'X-Robots-Tag': 'noindex, nofollow' } });
  } catch (e) {
    console.error('restyle list failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE });
  }
}
