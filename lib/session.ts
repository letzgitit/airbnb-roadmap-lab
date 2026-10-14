import 'server-only';
import { auth } from '@/auth';
import { isAllowed } from './allowed';
import type { Actor } from '@/lib/core/engine';

export type ActorResult = { ok: true; actor: Actor } | { ok: false; status: 401 | 403 };

function nameFrom(email: string, name?: string | null) {
  return (name && name.trim()) || email.split('@')[0];
}

// 세션 확인 + 허용 이메일 재확인. 로그인 안 했으면 401, 허용 목록 밖이면 403.
export async function getActor(req: Request): Promise<ActorResult> {
  // 개발 전용 가짜 로그인. NODE_ENV 가 production 이면 이 분기는 빌드에서 통째로 사라진다.
  if (process.env.NODE_ENV === 'development' && process.env.DEV_FAKE_LOGIN_EMAIL) {
    const url = new URL(req.url);
    const email = (
      req.headers.get('x-dev-fake-email') || url.searchParams.get('as') || process.env.DEV_FAKE_LOGIN_EMAIL
    ).trim().toLowerCase();
    if (!isAllowed(email)) return { ok: false, status: 403 };
    return { ok: true, actor: { email, name: nameFrom(email) } };
  }
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ok: false, status: 401 };
  if (!isAllowed(email)) return { ok: false, status: 403 };
  return { ok: true, actor: { email, name: nameFrom(email, session?.user?.name) } };
}
