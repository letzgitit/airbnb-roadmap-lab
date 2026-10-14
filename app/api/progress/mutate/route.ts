import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { mutate, OpError } from '@/lib/core/engine';
import { opSchema } from '@/lib/core/validate';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  const a = await getActor(req);
  if (!a.ok) return NextResponse.json({ error: a.status === 401 ? 'unauthorized' : 'forbidden' }, { status: a.status, headers: NO_STORE });

  // 다른 사이트에서 날아온 요청 차단
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.headers.get('host')) {
    return NextResponse.json({ error: 'bad_origin' }, { status: 403, headers: NO_STORE });
  }

  let json: unknown;
  try { json = await req.json(); } catch {
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
    return NextResponse.json({ doc, result, me: { email: a.actor.email, name: a.actor.name } }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json(e.body, { status: e.status, headers: NO_STORE });
    console.error(e);
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE });
  }
}
