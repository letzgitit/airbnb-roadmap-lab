import type { Viewport } from 'next';
import { SiteShell } from '@/components/shell/SiteShell';
import { loadContent } from '@/lib/content';

// 사이트 틀(머리글 · 내비게이션 · 진행 현황 · 사진)이 감싸는 페이지들. 지인 답 화면(/q/)과 API 는 이 그룹 밖이다.
// 쿠키 · 헤더를 읽지 않는다 — 홈이 정적 생성 + ISR 로 남게. 로그인 여부는 틀 안에서 /api/progress 로 안다.
// 아이폰 노치 · 홈 막대까지 화면을 쓰고(viewport-fit=cover), 머리글 · 본문 · 아래 탭이 env(safe-area-inset-*) 만큼 비켜 선다.
// 폰 상태 표시줄 · 주소창 색 = 머리글 띠(band, DESIGN.md 2.2 (가)) — 기기 화면 모드에 따라 밝은 · 어두운 값. 홈 화면 앱(manifest theme_color)은 밝은 값.
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#007684' }, { media: '(prefers-color-scheme: dark)', color: '#00707d' }],
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  // 구글 로그인 키가 없으면 「로그인」 대신 「로그인 준비 중」(빌드 때 정해진다 — 키를 넣은 뒤 다시 배포하면 켜진다)
  const loginReady = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
  const steps = loadContent().steps.map((s) => ({ id: s.id, title: s.title }));
  return <SiteShell steps={steps} loginReady={loginReady}>{children}</SiteShell>;
}
