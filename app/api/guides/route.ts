import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { readDoc } from '@/lib/core/engine';
import { guideIndex, listGuides } from '@/lib/core/guides';
import { NO_STORE } from '@/lib/http';

export const dynamic = 'force-dynamic';

// 어떤 할 일에 설명서가 있는지만(본문 없이): { ids: { [taskId]: { len, version } } }. 지운 할 일은 뺀다.
// 로그인한 두 사람만(현황 API 와 같은 확인). 본문은 /api/guides/<id>.
export async function GET(req: Request) {
  const a = await getActor(req);
  if (!a.ok) return NextResponse.json({ error: a.status === 401 ? 'unauthorized' : 'forbidden' }, { status: a.status, headers: NO_STORE });
  try {
    const [guides, doc] = await Promise.all([listGuides(), readDoc()]);
    return NextResponse.json({ ids: guideIndex(guides, doc) }, { headers: NO_STORE });
  } catch (e) {
    console.error('guides list failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE });
  }
}
