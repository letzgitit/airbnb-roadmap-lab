import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { BenchError, listBatches, listLinks, listReactions, setReaction, toBatchView, toLinkView, toReactionView, type ReactionView } from '@/lib/core/bench';
import { checkWriteRequest, NO_STORE } from '@/lib/http';

export const dynamic = 'force-dynamic';

const deny = (status: 401 | 403) => NextResponse.json({ error: status === 401 ? 'unauthorized' : 'forbidden' }, { status, headers: NO_STORE });

// 「꾸미기 참고」 묶음(최신 수집일이 위)과 두 사람의 반응. 로그인한 두 사람만(로그인 안 했으면 401, 허용 밖이면 403).
// 묶음은 CLI(scripts/bench.mjs)로만 넣는다. 화면에서는 반응을 남기고, 링크는 /api/bench/links 로 올린다(links 는 올린 링크, 최신이 위).
export async function GET(req: Request) {
  const a = await getActor(req);
  if (!a.ok) return deny(a.status);
  try {
    const [batches, reactions, links] = await Promise.all([listBatches(), listReactions(), listLinks()]);
    const byItem: Record<string, ReactionView[]> = {};
    for (const r of reactions) (byItem[r.itemId] ??= []).push(toReactionView(r, a.actor.email));
    for (const list of Object.values(byItem)) list.sort((x, y) => Number(y.mine) - Number(x.mine) || x.updatedAt.localeCompare(y.updatedAt));
    return NextResponse.json({ batches: batches.map(toBatchView), links: links.map((l) => toLinkView(l, a.actor.email)), reactions: byItem }, { headers: NO_STORE });
  } catch (e) {
    console.error('bench list failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE });
  }
}

// 내 반응 바꾸기: { itemId, vote: 'up' | 'down' | null, memo }. 둘 다 비우면 지운다. 같은 사이트 요청 · 로그인 확인.
export async function PUT(req: Request) {
  const bad = checkWriteRequest(req);
  if (bad) return NextResponse.json({ error: bad }, { status: 403, headers: NO_STORE });
  const a = await getActor(req);
  if (!a.ok) return deny(a.status);
  let body: Record<string, unknown> | null = null;
  try {
    const text = await req.text();
    const v = text.length <= 4096 ? JSON.parse(text) : null;
    body = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch { body = null; }
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE });
  try {
    const r = await setReaction({ itemId: body.itemId, vote: body.vote, memo: body.memo }, a.actor);
    return NextResponse.json({ reaction: r ? toReactionView(r, a.actor.email) : null }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof BenchError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status, headers: NO_STORE });
    console.error('bench reaction failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error', message: '저장하지 못했어요.' }, { status: 500, headers: NO_STORE });
  }
}
