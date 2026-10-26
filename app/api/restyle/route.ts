import { NextResponse } from 'next/server';
import { NO_STORE } from '@/lib/http';
import { readRestyleList } from '@/lib/restyle';

// 꾸미기 › 사진 시안 목록(방 · 시안 · 사진 이름). 로그인 안 한 방문자에게도 보인다(2026-10-26 사이트 주인 결정 — 지금 방 사진 포함).
// 어떤 캐시에도 남기지 않는다. 사진 바이트는 /api/restyle/<사진 이름>.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const list = await readRestyleList();
    if (!list) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
    return NextResponse.json(list, { headers: { ...NO_STORE, 'X-Robots-Tag': 'noindex, nofollow' } });
  } catch (e) {
    console.error('restyle list failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE });
  }
}
