'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useProgress } from '@/components/progress/ProgressProvider';
import { AccountMenu } from './AccountMenu';
import { useGuardedLinkClick } from './useGuardedNav';
import { navItemsFor } from './nav';
import { useSite } from './SiteShell';

// 모든 페이지 공통 머리글(높이 60 + 위 안전 영역): 왼쪽 사이트 이름(홈 링크, 22px 600) · PC 면 내비게이션(로그인했으면 홈 · 시안 · 자금, 아니면 공개 문 홈 · 시안) · 오른쪽 「로그인」 + 「설정」.
// 시안 B: 화면 바탕과 같은 면 + 검정 글자(색 띠 없음, 아래 선 없음 — 바로 밑 탭 줄이 선을 긋는다). 폰 상태 표시줄 색(theme-color)은 app/(site)/layout.tsx.
export function SiteHeader() {
  const { status, doc } = useProgress();
  const { loginReady } = useSite();
  const path = usePathname() ?? '/';
  const guard = useGuardedLinkClick();
  const loggedIn = status === 'ready' && !!doc;
  const items = navItemsFor(status, loggedIn);

  return (
    <header className="sticky top-0 z-40 bg-page pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-15 max-w-content items-center gap-4 px-safe">
        <Link href="/" onClick={guard('/')} className="inline-flex min-h-11 shrink-0 items-center text-2xl font-semibold tracking-[-0.02em] text-ink">외도민 준비</Link>

        {items.length > 0 && (
          <nav aria-label="사이트" className="hidden h-full min-w-0 flex-1 items-stretch md:flex">
            {items.map((n) => {
              const on = n.match(path);
              return (
                <Link key={n.href} href={n.href} onClick={guard(n.href)} aria-current={on ? 'page' : undefined}
                  className={`relative inline-flex min-w-11 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-base transition-colors hover:text-ink ${on ? 'font-semibold text-ink' : 'font-medium text-muted'}`}>
                  {n.label}
                  {on && <span className="absolute inset-x-2 bottom-2 h-0.5 bg-ink" aria-hidden />}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {status === 'anon' && (loginReady ? (
            <button type="button" onClick={() => void signIn('google', { callbackUrl: window.location.href })}
              className="inline-flex min-h-11 items-center px-2 text-base font-semibold text-ink underline underline-offset-4">로그인</button>
          ) : (
            <button type="button" disabled aria-disabled="true" className="inline-flex min-h-11 cursor-not-allowed items-center px-2 text-base font-medium text-muted">로그인 준비 중</button>
          ))}
          <AccountMenu canSignOut={status === 'ready' || status === 'forbidden'} />
        </div>
      </div>
    </header>
  );
}
