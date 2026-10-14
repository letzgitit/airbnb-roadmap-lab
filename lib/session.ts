import 'server-only';
import { auth } from '@/auth';
import { isAllowed } from './allowed';
import { hasRedisEnv } from '@/lib/core/store';
import type { Actor } from '@/lib/core/engine';

export type ActorResult = { ok: true; actor: Actor } | { ok: false; status: 401 | 403 };

// 화면에 보일 이름(편집자·수정자 표시). env MEMBER_NAMES="a@x.com:나,b@y.com:아내" 로 바꿀 수 있고, 없으면 이메일 앞부분.
// 서버에서만 매핑한다(이메일↔이름 표를 브라우저 번들에 싣지 않는다).
function memberNames(): Map<string, string> {
  const m = new Map<string, string>();
  for (const pair of (process.env.MEMBER_NAMES ?? '').split(',')) {
    const i = pair.lastIndexOf(':');
    if (i <= 0) continue;
    const email = pair.slice(0, i).trim().toLowerCase();
    const name = pair.slice(i + 1).trim().slice(0, 20);
    if (email && name) m.set(email, name);
  }
  return m;
}

function nameFrom(email: string) {
  return memberNames().get(email) || email.split('@')[0];
}

// 개발 전용 가짜 로그인이 켜지는 조건. 하나라도 어긋나면 꺼진다.
// - NODE_ENV=development: `next build` 산출물(Vercel 프로덕션·프리뷰 포함)에선 production 으로 박혀 이 분기가 빌드에서 사라진다.
// - VERCEL 아님: 혹시 dev 모드로 Vercel 에 올라가도 열리지 않게.
// - Redis env 없음: 가짜 로그인으로 운영 데이터(Upstash)를 열지 않게. 로컬 파일 저장소에서만.
function devFakeLoginEnabled(): boolean {
  return process.env.NODE_ENV === 'development'
    && !process.env.VERCEL
    && !!process.env.DEV_FAKE_LOGIN_EMAIL
    && !hasRedisEnv();
}

// 세션 확인 + 허용 이메일 재확인. 로그인 안 했으면 401, 허용 목록 밖이면 403.
export async function getActor(req: Request): Promise<ActorResult> {
  if (process.env.NODE_ENV === 'development' && devFakeLoginEnabled()) {
    const url = new URL(req.url);
    const email = (
      req.headers.get('x-dev-fake-email') || url.searchParams.get('as') || process.env.DEV_FAKE_LOGIN_EMAIL || ''
    ).trim().toLowerCase();
    if (!isAllowed(email)) return { ok: false, status: 403 };
    return { ok: true, actor: { email, name: nameFrom(email) } };
  }
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return { ok: false, status: 401 };
  if (!isAllowed(email)) return { ok: false, status: 403 };
  return { ok: true, actor: { email, name: nameFrom(email) } };
}
