import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { addCardNote, CardNoteError, restoreCardNote } from '@/lib/core/cardnotes';
import { checkWriteRequest, NO_STORE } from '@/lib/http';

export const dynamic = 'force-dynamic';

// 500자(한글 3바이트) + JSON 이스케이프 · 되돌리기 칸 여유
const MAX_BODY_BYTES = 8 * 1024;

const deny = (status: 401 | 403) => NextResponse.json({ error: status === 401 ? 'unauthorized' : 'forbidden' }, { status, headers: NO_STORE });
const fail = (e: unknown, what: string) => {
  if (e instanceof CardNoteError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status, headers: NO_STORE });
  console.error(`cardnote ${what} failed:`, e instanceof Error ? e.message : 'unknown');
  return NextResponse.json({ error: 'server_error', message: '저장하지 못했어요.' }, { status: 500, headers: NO_STORE });
};

// 메모 더하기: { text } → { note }. 되돌리기(지운 메모를 그대로 다시): { restore: { id, text, at, by } } → { note }.
// 쓴 사람은 로그인한 사람(되돌리기는 원래 쓴 사람 그대로).
export async function POST(req: Request, ctx: RouteContext<'/api/cardnotes/[cardId]'>) {
  const bad = checkWriteRequest(req);
  if (bad) return NextResponse.json({ error: bad }, { status: 403, headers: NO_STORE });
  const a = await getActor(req);
  if (!a.ok) return deny(a.status);
  const { cardId } = await ctx.params;
  let body: Record<string, unknown> | null = null;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'too_large', message: '메모가 너무 길어요.' }, { status: 413, headers: NO_STORE });
    const v = JSON.parse(text);
    body = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch { body = null; }
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE });
  try {
    const note = body.restore !== undefined ? await restoreCardNote(cardId, body.restore) : await addCardNote(cardId, body.text, a.actor);
    return NextResponse.json({ note }, { headers: NO_STORE });
  } catch (e) { return fail(e, 'add'); }
}
