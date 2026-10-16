import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { deletePhoto, getPhoto, PhotoError, readPart, toView, updatePhoto, type Part } from '@/lib/core/photos';
import { checkWriteRequest, NO_STORE } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const deny = (status: 401 | 403) => NextResponse.json({ error: status === 401 ? 'unauthorized' : 'forbidden' }, { status, headers: NO_STORE });
const SIZES: Record<string, Part> = { thumb: 'thumb', full: 'full', file: 'file' };

// 사진 바이트: /api/photos/<id>?size=thumb|full|file(PDF 원본). 로그인한 두 사람만, 어떤 캐시에도 남기지 않는다.
export async function GET(req: Request, ctx: RouteContext<'/api/photos/[id]'>) {
  const a = await getActor(req);
  if (!a.ok) return deny(a.status);
  const { id } = await ctx.params;
  const part = SIZES[new URL(req.url).searchParams.get('size') ?? 'thumb'];
  if (!part) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: NO_STORE });
  try {
    const m = await getPhoto(id);
    const buf = m ? await readPart(m, part) : null;
    if (!m || !buf) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
    const pdf = part === 'file';
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        ...NO_STORE,
        'Content-Type': pdf ? 'application/pdf' : 'image/jpeg',
        'Content-Length': String(buf.length),
        // 파일 이름에 설명(개인정보)을 싣지 않는다
        'Content-Disposition': `inline; filename="${m.id}.${pdf ? 'pdf' : 'jpg'}"`,
      },
    });
  } catch (e) {
    console.error('photo read failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE });
  }
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    if (text.length > 4096) return null;
    const v = text ? JSON.parse(text) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch { return null; }
}

const fail = (e: unknown, what: string) => {
  if (e instanceof PhotoError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status, headers: NO_STORE });
  console.error(`photo ${what} failed:`, e instanceof Error ? e.message : 'unknown');
  return NextResponse.json({ error: 'server_error', message: '저장하지 못했어요.' }, { status: 500, headers: NO_STORE });
};

// 단계 · 설명 · 묶음 이름 · 순서(position) 고치기, 되살리기: { stepId?, caption?, album?, position?, restore? }
export async function PATCH(req: Request, ctx: RouteContext<'/api/photos/[id]'>) {
  const bad = checkWriteRequest(req);
  if (bad) return NextResponse.json({ error: bad }, { status: 403, headers: NO_STORE });
  const a = await getActor(req);
  if (!a.ok) return deny(a.status);
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE });
  try {
    const m = await updatePhoto(id, { stepId: body.stepId, album: body.album, caption: body.caption, restore: body.restore, position: body.position }, a.actor.name);
    return NextResponse.json({ photo: toView(m) }, { headers: NO_STORE });
  } catch (e) { return fail(e, 'update'); }
}

// 지우기 = 삭제 표시(30일 동안 되살릴 수 있다). 현황의 할 일 · 기록 삭제와 같은 규칙.
export async function DELETE(req: Request, ctx: RouteContext<'/api/photos/[id]'>) {
  const bad = checkWriteRequest(req);
  if (bad) return NextResponse.json({ error: bad }, { status: 403, headers: NO_STORE });
  const a = await getActor(req);
  if (!a.ok) return deny(a.status);
  const { id } = await ctx.params;
  try {
    const m = await deletePhoto(id, a.actor.name);
    return NextResponse.json({ photo: toView(m) }, { headers: NO_STORE });
  } catch (e) { return fail(e, 'delete'); }
}
