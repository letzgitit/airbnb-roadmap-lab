import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { BenchError, setPublic } from '@/lib/core/bench';
import { checkWriteRequest, NO_STORE } from '@/lib/http';

export const dynamic = 'force-dynamic';

// 수집 항목 하나를 공개 화면(로그인 안 한 방문자)에 보이기 / 감추기: { itemId, on: true | false } → { itemId, on }.
// 로그인한 두 사람만, 같은 사이트 요청만(반응 저장과 같은 검사). 올린 링크는 공개할 수 없다.
const fail = (status: number, error: string, message?: string) => NextResponse.json({ error, message }, { status, headers: NO_STORE });

export async function PUT(req: Request) {
  const bad = checkWriteRequest(req);
  if (bad) return fail(403, bad);
  const a = await getActor(req);
  if (!a.ok) return fail(a.status, a.status === 401 ? 'unauthorized' : 'forbidden');
  let body: Record<string, unknown> | null = null;
  try {
    const text = await req.text();
    const v = text.length <= 1024 ? JSON.parse(text) : null;
    body = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch { body = null; }
  if (!body) return fail(400, 'invalid_json');
  try {
    const on = await setPublic({ itemId: body.itemId, on: body.on }, a.actor);
    return NextResponse.json({ itemId: body.itemId, on }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof BenchError) return fail(e.status, e.code, e.message);
    console.error('bench public failed:', e instanceof Error ? e.message : 'unknown');
    return fail(500, 'server_error', '저장하지 못했어요.');
  }
}
