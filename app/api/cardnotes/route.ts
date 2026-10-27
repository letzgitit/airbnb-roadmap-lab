import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { listCardNotes } from '@/lib/core/cardnotes';
import { NO_STORE } from '@/lib/http';

export const dynamic = 'force-dynamic';

// 블록 메모 전부(작다 — 블록 수십 개 × 짧은 글): { notes: { [블록 id]: [{ id, text, at, by }] } }. 메모가 없는 블록은 빠진다.
// 로그인한 두 사람만(현황 API 와 같은 확인).
export async function GET(req: Request) {
  const a = await getActor(req);
  if (!a.ok) return NextResponse.json({ error: a.status === 401 ? 'unauthorized' : 'forbidden' }, { status: a.status, headers: NO_STORE });
  try {
    return NextResponse.json({ notes: await listCardNotes() }, { headers: NO_STORE });
  } catch (e) {
    console.error('cardnotes list failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE });
  }
}
