'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { ProgressProvider, useProgress } from '@/components/progress/ProgressProvider';
import { PhotosProvider, type StepName } from '@/components/progress/PhotosPanel';
import { SiteHeader } from './SiteHeader';

// 사이트 틀: 모든 페이지(app/(site)/)를 감싼다. 진행 현황(ProgressProvider)과 사진(PhotosProvider)도 여기서 한 번만 감싼다.
// 구성: 머리 띠(형광 — 제호 · 날짜 · 시안 · 자금 · 설정) → (허용 안 된 계정이면 안내 줄) → 본문.
// 아래 탭 줄은 없다(2026-10-28 — 홈 = 제호, 시안 · 자금 = 머리 띠 오른쪽).
// 본문 폭: 보통 720(px-safe 여백). 로그인한 홈(새 홈)만 여백 없이 꽉 차게 두고 안쪽 폭은 새 홈이 정한다(폰 = 화면 끝까지 블록, PC = 본문 + 곁 칸 1080).
interface SiteCtx { loginReady: boolean; steps: StepName[] }
const Site = createContext<SiteCtx | null>(null);

/** 틀이 아는 사이트 값: 구글 로그인 키가 있나(loginReady), 단계 이름 목록(steps). */
export function useSite(): SiteCtx {
  const v = useContext(Site);
  if (!v) throw new Error('SiteShell 밖에서 사용됨');
  return v;
}

export function SiteShell({ steps, loginReady, children }: { steps: StepName[]; loginReady: boolean; children: ReactNode }) {
  const site = useMemo(() => ({ loginReady, steps }), [loginReady, steps]);
  return (
    <ProgressProvider>
      <PhotosProvider steps={steps}>
        <Site.Provider value={site}>
          <Frame>{children}</Frame>
        </Site.Provider>
      </PhotosProvider>
    </ProgressProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { status, doc } = useProgress();
  const path = usePathname() ?? '/';
  const loggedIn = status === 'ready' && !!doc;
  // 새 홈(로그인 뒤 / — proxy 가 /home 으로 그린다). 로그인 전 · 불러오는 중에는 공개 안내 · 반짝이는 칸이라 보통 틀
  const wide = (path === '/' || path === '/home') && loggedIn;
  return (
    <>
      <SiteHeader wide={wide} />
      {status === 'forbidden' && (
        <div className="border-b border-line bg-surface">
          <p className="mx-auto flex max-w-content flex-wrap items-center gap-x-3 px-safe text-sm text-ink-soft" role="status">
            <span className="py-3">허용되지 않은 계정이에요</span>
            <button type="button" onClick={() => void signOut({ callbackUrl: '/' })}
              className="inline-flex min-h-11 items-center font-bold text-ink underline underline-offset-4">로그아웃</button>
          </p>
        </div>
      )}
      <main id="main" className={wide ? 'w-full pb-[calc(env(safe-area-inset-bottom)+32px)]' : 'mx-auto w-full max-w-content px-safe pb-[calc(env(safe-area-inset-bottom)+48px)] pt-4'}>
        {children}
      </main>
    </>
  );
}
