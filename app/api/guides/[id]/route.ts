import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { getGuide, GuideError, putGuide } from '@/lib/core/guides';
import { checkWriteRequest, NO_STORE } from '@/lib/http';

export const dynamic = 'force-dynamic';

const deny = (status: 401 | 403) => NextResponse.json({ error: status === 401 ? 'unauthorized' : 'forbidden' }, { status, headers: NO_STORE });
// 6000자(한글 3바이트) + JSON 이스케이프 여유
const MAX_BODY_BYTES = 40 * 1024;

const fail = (e: unknown, what: string) => {
  if (e instanceof GuideError) {
    return NextResponse.json({ error: e.code, message: e.message, ...(e.current !== null || e.status === 409 ? { current: e.current } : {}) }, { status: e.status, headers: NO_STORE });
  }
  console.error(`guide ${what} failed:`, e instanceof Error ? e.message : 'unknown');
  return NextResponse.json({ error: 'server_error', message: '저장하지 못했어요.' }, { status: 500, headers: NO_STORE });
};

// 설명서 본문: { guide: { md, version, updatedAt, updatedBy } | null }. 없으면 guide = null(새로 쓸 때 baseVersion 0).
export async function GET(req: Request, ctx: RouteContext<'/api/guides/[id]'>) {
  const a = await getActor(req);
  if (!a.ok) return deny(a.status);
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ guide: await getGuide(id) }, { headers: NO_STORE });
  } catch (e) { return fail(e, 'read'); }
}

// 저장: { md, baseVersion } — version 이 다르면 409(current = 지금 값), 빈 글이면 지움(guide = null), 6000자 넘으면 400.
export async function PUT(req: Request, ctx: RouteContext<'/api/guides/[id]'>) {
  const bad = checkWriteRequest(req);
  if (bad) return NextResponse.json({ error: bad }, { status: 403, headers: NO_STORE });
  const a = await getActor(req);
  if (!a.ok) return deny(a.status);
  const { id } = await ctx.params;
  let body: Record<string, unknown> | null = null;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'too_large', message: '설명서가 너무 길어요.' }, { status: 413, headers: NO_STORE });
    const v = JSON.parse(text);
    body = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch { body = null; }
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json({ guide: await putGuide(id, body.md, body.baseVersion, a.actor) }, { headers: NO_STORE });
  } catch (e) { return fail(e, 'write'); }
}
