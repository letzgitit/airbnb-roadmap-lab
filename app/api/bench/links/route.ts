import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { addLink, BenchError, deleteLink, restoreLink, toLinkView } from '@/lib/core/bench';
import { checkWriteRequest, NO_STORE } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';   // 서버가 남이 준 주소를 읽는다(node:dns · node:http 필요)
export const maxDuration = 15;

// 「꾸미기 참고」에 링크 올리기 / 지우기 / 지운 것 되돌리기. 로그인한 두 사람만, 같은 사이트 요청만(현황 API 와 같은 검사).
// 주소를 읽는 쪽의 안전 검사는 lib/core/link-preview.ts.
const fail = (status: number, error: string, message?: string) => NextResponse.json({ error, message }, { status, headers: NO_STORE });

async function guard(req: Request) {
  const bad = checkWriteRequest(req);
  if (bad) return { res: fail(403, bad) };
  const a = await getActor(req);
  if (!a.ok) return { res: fail(a.status, a.status === 401 ? 'unauthorized' : 'forbidden') };
  let body: Record<string, unknown> | null = null;
  try {
    const text = await req.text();
    const v = text.length <= 4096 ? JSON.parse(text) : null;
    body = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch { body = null; }
  if (!body) return { res: fail(400, 'invalid_json') };
  return { actor: a.actor, body };
}

function onError(e: unknown, what: string) {
  if (e instanceof BenchError) return fail(e.status, e.code, e.message);
  console.error(`bench link ${what} failed:`, e instanceof Error ? e.message : 'unknown');
  return fail(500, 'server_error', '저장하지 못했어요.');
}

// 올리기: { url, note?, space? } → { link, fetched }
export async function POST(req: Request) {
  const g = await guard(req);
  if (!g.actor) return g.res;
  try {
    const r = await addLink({ url: g.body.url, note: g.body.note, space: g.body.space }, g.actor);
    return NextResponse.json({ link: toLinkView(r.link, g.actor.email), fetched: r.fetched }, { headers: NO_STORE });
  } catch (e) { return onError(e, 'add'); }
}

// 지우기(내가 올린 것만): { id }
export async function DELETE(req: Request) {
  const g = await guard(req);
  if (!g.actor) return g.res;
  try {
    await deleteLink(g.body.id, g.actor);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) { return onError(e, 'delete'); }
}

// 지운 것 되돌리기: { id }
export async function PATCH(req: Request) {
  const g = await guard(req);
  if (!g.actor) return g.res;
  try {
    const l = await restoreLink(g.body.id, g.actor);
    return NextResponse.json({ link: toLinkView(l, g.actor.email) }, { headers: NO_STORE });
  } catch (e) { return onError(e, 'restore'); }
}
