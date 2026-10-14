import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { readDoc } from '@/lib/core/engine';
import { NO_STORE } from '@/lib/http';
import type { ProgressDoc } from '@/lib/core/types';

export const dynamic = 'force-dynamic';

// 서버가 읽을 때마다 세션과 허용 이메일을 확인한다. 로그인 안 했으면 401, 허용 밖이면 403.
export async function GET(req: Request) {
  const a = await getActor(req);
  if (!a.ok) return NextResponse.json({ error: a.status === 401 ? 'unauthorized' : 'forbidden' }, { status: a.status, headers: NO_STORE });

  let doc: ProgressDoc;
  try {
    doc = await readDoc();
  } catch (e) {
    console.error('progress read failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE });
  }
  const me = { email: a.actor.email, name: a.actor.name };
  const since = Number(new URL(req.url).searchParams.get('since'));
  // 문서 version 이 그대로면 본문을 다시 보내지 않고 「편집 중」 표시만 보낸다.
  if (Number.isFinite(since) && since > 0 && since === doc.version) {
    return NextResponse.json({ unchanged: true, version: doc.version, editing: doc.editing, me }, { headers: NO_STORE });
  }
  const body: { doc: ProgressDoc; me: typeof me } = { doc, me };
  return NextResponse.json(body, { headers: NO_STORE });
}
