'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { signOut } from 'next-auth/react';
import { ProgressProvider, useProgress } from '@/components/progress/ProgressProvider';
import { PhotosProvider, type StepName } from '@/components/progress/PhotosPanel';
import { SiteHeader } from './SiteHeader';
import { BottomTabs } from './BottomTabs';
import { navItemsFor } from './nav';

// 사이트 틀: 모든 페이지(app/(site)/)를 감싼다. 진행 현황(ProgressProvider)과 사진(PhotosProvider)도 여기서 한 번만 감싼다.
// 구성: 머리글 → (허용 안 된 계정이면 안내 줄) → 본문(720px) → 폰 아래 탭(로그인했으면 넷, 아니면 공개 문 홈 · 꾸미기).
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
  const loggedIn = status === 'ready' && !!doc;
  const items = navItemsFor(status, loggedIn);
  return (
    <>
      <SiteHeader />
      {status === 'forbidden' && (
        <div className="border-b border-line bg-sunken">
          <p className="mx-auto flex max-w-content flex-wrap items-center gap-x-3 px-safe text-sm text-ink-soft" role="status">
            <span className="py-3">허용되지 않은 계정이에요</span>
            <button type="button" onClick={() => void signOut({ callbackUrl: '/' })}
              className="inline-flex min-h-11 items-center font-bold text-accent-ink hover:underline">로그아웃</button>
          </p>
        </div>
      )}
      {/* 폰에서 아래 메뉴가 보이면 메뉴(60px) + 홈 막대 안전 영역 + 24px 만큼 본문 아래를 비운다 */}
      <main id="main" className={`mx-auto w-full max-w-content px-safe pt-4 ${items.length > 0 ? 'pb-[calc(60px+env(safe-area-inset-bottom)+24px)] md:pb-12' : 'pb-12'}`}>
        {children}
      </main>
      {items.length > 0 && <BottomTabs items={items} />}
    </>
  );
}
