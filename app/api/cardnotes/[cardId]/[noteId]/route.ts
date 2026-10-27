import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { CardNoteError, removeCardNote } from '@/lib/core/cardnotes';
import { checkWriteRequest, NO_STORE } from '@/lib/http';

export const dynamic = 'force-dynamic';

const deny = (status: 401 | 403) => NextResponse.json({ error: status === 401 ? 'unauthorized' : 'forbidden' }, { status, headers: NO_STORE });

// 메모 지우기 → { note }(지운 메모 — 화면의 8초 「되돌리기」가 POST /api/cardnotes/<블록 id> { restore: note } 로 다시 넣는다).
// 본문은 없어도 되지만 다른 사이트 요청을 거르려고 쓰기 요청과 같은 확인(JSON · 같은 출처)을 한다 — 화면은 빈 JSON 「{}」을 보낸다.
export async function DELETE(req: Request, ctx: RouteContext<'/api/cardnotes/[cardId]/[noteId]'>) {
  const bad = checkWriteRequest(req);
  if (bad) return NextResponse.json({ error: bad }, { status: 403, headers: NO_STORE });
  const a = await getActor(req);
  if (!a.ok) return deny(a.status);
  const { cardId, noteId } = await ctx.params;
  try {
    return NextResponse.json({ note: await removeCardNote(cardId, noteId) }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof CardNoteError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status, headers: NO_STORE });
    console.error('cardnote delete failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error', message: '지우지 못했어요.' }, { status: 500, headers: NO_STORE });
  }
}
