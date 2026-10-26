import { NextResponse } from 'next/server';
import { getActor, memberName } from '@/lib/session';
import { checkWriteRequest, NO_STORE } from '@/lib/http';
import {
  createLayout, deleteLayout, isLayoutId, LayoutError, listLayouts, parseLayout, parseLayoutName, updateLayout,
} from '@/lib/core/room3d-layouts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 꾸미기 › 3D 시안: 이름 붙여 저장한 가구 배치 목록. 로그인한 두 사람만(고른 상태 저장과 같은 검사).
// 3D 시안 iframe 은 출처가 없어(sandbox) 직접 못 부르므로, 사이트 쪽(components/decor/Room3D.tsx)이 대신 부른다.
// GET → { items }
// POST { name, layout } → { ok, item, items }  — 새로 저장(이름 30자 · 20개까지, 같은 이름 안 됨)
// PUT { id, name?, layout? } → { ok, item, items } — 이름 바꾸기 · 덮어쓰기
// DELETE { id } → { ok, items }
// 모두 실패하면 { error }: unauthorized · forbidden · invalid · too_many · duplicate_name · not_found · server_error
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    if (text.length > 8192) return null;
    const v = JSON.parse(text) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch { return null; }
}

async function guard(req: Request, write: boolean) {
  if (write) { const bad = checkWriteRequest(req); if (bad) return { res: fail(403, bad) } as const; }
  const a = await getActor(req);
  if (!a.ok) return { res: fail(a.status, a.status === 401 ? 'unauthorized' : 'forbidden') } as const;
  // 저장한 사람: MEMBER_NAMES 에 적은 이름만 남긴다(이메일 앞부분은 남기지 않는다 — 없으면 화면은 시각만)
  return { name: memberName(a.actor.email) } as const;
}

async function run(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); } catch (e) {
    if (e instanceof LayoutError) return fail(e.status, e.code);
    console.error('room3d layouts failed:', e instanceof Error ? e.message : 'unknown');
    return fail(500, 'server_error');
  }
}

export async function GET(req: Request) {
  const g = await guard(req, false);
  if ('res' in g) return g.res;
  return run(async () => NextResponse.json({ items: await listLayouts() }, { headers: NO_STORE }));
}

export async function POST(req: Request) {
  const g = await guard(req, true);
  if ('res' in g) return g.res;
  const body = await readBody(req);
  const name = body && parseLayoutName(body.name), layout = body && parseLayout(body.layout);
  if (!name || !layout) return fail(400, 'invalid');
  return run(async () => {
    const item = await createLayout(name, layout, g.name);
    return NextResponse.json({ ok: true, item, items: await listLayouts() }, { headers: NO_STORE });
  });
}

export async function PUT(req: Request) {
  const g = await guard(req, true);
  if ('res' in g) return g.res;
  const body = await readBody(req);
  if (!body || !isLayoutId(body.id)) return fail(400, 'invalid');
  const name = body.name === undefined ? undefined : parseLayoutName(body.name);
  const layout = body.layout === undefined ? undefined : parseLayout(body.layout);
  if (name === null || layout === null || (!name && !layout)) return fail(400, 'invalid');
  const id = body.id;
  return run(async () => {
    const item = await updateLayout(id, { name, layout }, g.name);
    return NextResponse.json({ ok: true, item, items: await listLayouts() }, { headers: NO_STORE });
  });
}

export async function DELETE(req: Request) {
  const g = await guard(req, true);
  if ('res' in g) return g.res;
  const body = await readBody(req);
  if (!body || !isLayoutId(body.id)) return fail(400, 'invalid');
  const id = body.id;
  return run(async () => {
    await deleteLayout(id);
    return NextResponse.json({ ok: true, items: await listLayouts() }, { headers: NO_STORE });
  });
}
