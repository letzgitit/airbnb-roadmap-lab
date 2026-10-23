import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { parseDoc, readDoc } from '@/lib/core/engine';
import { readJisanRaw } from '@/lib/core/store';
import { NO_STORE } from '@/lib/http';
import type { ProgressDoc } from '@/lib/core/types';
import type { PlanItem, PlanPayload } from '@/lib/plan';

export const dynamic = 'force-dynamic';

// 「11월~1월 한 장 일정」: 외도민 현황 + 지산 현황(같은 Upstash, 읽기만)을 합쳐 로그인한 사람에게만 내려준다.
// 로그인 안 했으면 401, 허용 밖이면 403 — 금액·일정은 이 응답으로만 나간다.
function itemsOf(doc: ProgressDoc, src: PlanItem['src']): PlanItem[] {
  return Object.values(doc.tasks)
    .filter((t) => !t.deletedAt && t.due)
    .map((t) => ({ src, id: t.id, text: t.text, due: t.due as string, done: t.done, stepId: t.stepId }));
}

export async function GET(req: Request) {
  const a = await getActor(req);
  if (!a.ok) return NextResponse.json({ error: a.status === 401 ? 'unauthorized' : 'forbidden' }, { status: a.status, headers: NO_STORE });

  let doc: ProgressDoc;
  try {
    doc = await readDoc();
  } catch (e) {
    console.error('plan read failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE });
  }

  let jisan: PlanPayload['jisan'] = 'ok';
  let jisanItems: PlanItem[] = [];
  try {
    const raw = await readJisanRaw();
    if (!raw) jisan = 'missing';
    else jisanItems = itemsOf(parseDoc(raw), 'jisan');
  } catch (e) {
    jisan = 'error';
    console.error('plan jisan read failed:', e instanceof Error ? e.message : 'unknown');
  }

  const body: PlanPayload = {
    me: { email: a.actor.email, name: a.actor.name },
    items: [...itemsOf(doc, 'oedomin'), ...jisanItems],
    money: Object.values(doc.money).filter((m) => !m.deletedAt),
    plan: doc.plan,
    jisan,
  };
  return NextResponse.json(body, { headers: NO_STORE });
}
