import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { readDoc } from '@/lib/core/engine';
import { guideBodies, guideIndex, listGuides } from '@/lib/core/guides';
import { NO_STORE } from '@/lib/http';

export const dynamic = 'force-dynamic';

// 어떤 할 일에 설명서가 있는지만(본문 없이): { ids: { [taskId]: { len, version } } }. 지운 할 일은 뺀다.
// ?body=1 = 검색용 본문까지: { bodies: { [taskId]: { text, version } } }(마크다운 기호를 뺀 글 — 검색 창이 단추에 손이 닿을 때 한 번 받는다).
// 로그인한 두 사람만(현황 API 와 같은 확인). 본문 하나는 /api/guides/<id>. 오류 기록에 본문을 싣지 않는다.
export async function GET(req: Request) {
  const a = await getActor(req);
  if (!a.ok) return NextResponse.json({ error: a.status === 401 ? 'unauthorized' : 'forbidden' }, { status: a.status, headers: NO_STORE });
  const body = new URL(req.url).searchParams.get('body') === '1';
  try {
    const [guides, doc] = await Promise.all([listGuides(), readDoc()]);
    return NextResponse.json(body ? { bodies: guideBodies(guides, doc) } : { ids: guideIndex(guides, doc) }, { headers: NO_STORE });
  } catch (e) {
    console.error(body ? 'guides bodies failed:' : 'guides list failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE });
  }
}
