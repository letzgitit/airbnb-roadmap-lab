import { NextResponse, type NextRequest } from 'next/server';

// 홈(/) 하나만 본다. 로그인 쿠키(Auth.js 세션, 조각 「.0」 포함)가 있으면 /home(새 홈 틀)으로 바꿔 그려
// 로그인한 사람에게 처음부터 새 홈 모양이 뜨게 한다. 쿠키가 없으면 그대로 / — 공개 안내 HTML(정적 생성 + ISR, 검색 노출 유지).
// 쿠키만 보고 가르므로 서명 확인 · 허용 목록 확인은 하지 않는다: 그건 지금처럼 /api/progress 가 한다(새 홈의 내용은 그 응답으로만 그린다).
// 로그인은 허용 목록 계정만 되므로(auth.ts signIn) 쿠키가 있으면 거의 늘 허용 계정이다. 아니면 새 홈 틀이 공개 안내로 바꿔 그린다.
const SESSION = /^(__Secure-)?authjs\.session-token(\.\d+)?$/;

export function proxy(req: NextRequest) {
  const signedIn = req.cookies.getAll().some((c) => SESSION.test(c.name))
    // 개발 전용 가짜 로그인(lib/session.ts)도 로그인으로 본다
    || (process.env.NODE_ENV === 'development' && !process.env.VERCEL && !!process.env.DEV_FAKE_LOGIN_EMAIL);
  if (!signedIn) return NextResponse.next();
  return NextResponse.rewrite(new URL(`/home${req.nextUrl.search}`, req.url));
}

export const config = { matcher: ['/'] };
