import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { checkWriteRequest, NO_STORE } from '@/lib/http';
import { parseRoom3dState, readRoom3dPrices, readRoom3dState, writeRoom3dState } from '@/lib/core/room3d-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 꾸미기 › 3D 시안에서 고른 상태(시안 · 켠 항목 · 문 · 항목별 모양 · 치수 보기)를 저장 · 불러오기. 로그인한 두 사람만.
// 3D 시안 iframe 은 출처가 없어(sandbox) 직접 못 부르므로, 사이트 쪽(components/decor/Room3D.tsx)이 대신 부른다.
// GET → { state, prices } (prices = 항목별 1개 값, private/room3d-prices.json). 로그인 안 했으면 401 — 화면은 기본안으로 보인다.
// PUT { concept, on, doors, variants?, dims? } → { ok, at }. 같은 사이트 요청만(반응 저장과 같은 검사).
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });

export async function GET(req: Request) {
  const a = await getActor(req);
  if (!a.ok) return fail(a.status, a.status === 401 ? 'unauthorized' : 'forbidden');
  try {
    const [saved, prices] = await Promise.all([readRoom3dState(), readRoom3dPrices()]);
    const state = saved ? { concept: saved.concept, on: saved.on, doors: saved.doors, variants: saved.variants, dims: saved.dims } : null;
    return NextResponse.json({ state, prices }, { headers: NO_STORE });
  } catch (e) {
    console.error('room3d state read failed:', e instanceof Error ? e.message : 'unknown');
    return fail(500, 'server_error');
  }
}

export async function PUT(req: Request) {
  const bad = checkWriteRequest(req);
  if (bad) return fail(403, bad);
  const a = await getActor(req);
  if (!a.ok) return fail(a.status, a.status === 401 ? 'unauthorized' : 'forbidden');
  let body: unknown = null;
  try {
    const text = await req.text();
    body = text.length <= 8192 ? JSON.parse(text) : null;
  } catch { body = null; }
  const state = parseRoom3dState(body);
  if (!state) return fail(400, 'invalid');
  try {
    const saved = await writeRoom3dState(state, a.actor.name);
    return NextResponse.json({ ok: true, at: saved.at }, { headers: NO_STORE });
  } catch (e) {
    console.error('room3d state write failed:', e instanceof Error ? e.message : 'unknown');
    return fail(500, 'server_error');
  }
}
