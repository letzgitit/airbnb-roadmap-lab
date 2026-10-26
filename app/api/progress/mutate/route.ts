import { after, NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { mutate, OpError } from '@/lib/core/engine';
import { opSchema } from '@/lib/core/validate';
import { checkWriteRequest, NO_STORE } from '@/lib/http';
import { pushToTodoist } from '@/lib/core/todoist-push';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(req: Request) {
  // 다른 사이트에서 날아온 요청 차단(세션 확인보다 먼저: 쿠키가 실려 와도 여기서 끝난다)
  const bad = checkWriteRequest(req);
  if (bad) return NextResponse.json({ error: bad }, { status: 403, headers: NO_STORE });

  const a = await getActor(req);
  if (!a.ok) return NextResponse.json({ error: a.status === 401 ? 'unauthorized' : 'forbidden' }, { status: a.status, headers: NO_STORE });

  let json: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'too_large', message: '요청이 너무 큽니다.' }, { status: 413, headers: NO_STORE });
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE });
  }
  const parsed = opSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid', message: parsed.error.issues[0]?.message ?? '입력이 올바르지 않습니다.', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const { doc, result } = await mutate(parsed.data, a.actor);
    // 할 일이 바뀌었으면 응답을 보낸 뒤 Todoist 에도 반영(토큰 없으면 건너뜀, 실패해도 이 응답과 상관없다)
    if (parsed.data.op.startsWith('task.')) {
      const op = parsed.data;
      after(async () => { await pushToTodoist([{ op, result }]).catch(() => undefined); });
    }
    return NextResponse.json({ doc, result, me: { email: a.actor.email, name: a.actor.name } }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json(e.body, { status: e.status, headers: NO_STORE });
    // 오류 객체 전체를 찍지 않는다(저장소 오류엔 요청 본문 = 현황 문서가 실릴 수 있음). 메시지만.
    console.error('progress mutate failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE });
  }
}
