'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useProgress } from '@/components/progress/ProgressProvider';
import { AccountMenu } from './AccountMenu';
import { useGuardedLinkClick } from './useGuardedNav';
import { hasNewAnswer, navItemsFor } from './nav';
import { useSite } from './SiteShell';

// 모든 페이지 공통 머리글(높이 56 + 위 안전 영역): 왼쪽 사이트 이름(홈 링크) · PC 면 내비게이션(로그인했으면 넷, 아니면 공개 문 홈 · 꾸미기) · 오른쪽 「로그인」 + 「설정」.
// 띠 전체가 강조색 면(band, DESIGN.md 2.2 (가)) — 어두운 화면에서는 조금 어둡게(#00707d), 위 글자는 모두 on-accent. 글로우 · 그라데이션은 넣지 않는다.
// on-accent 클래스: 이 안의 키보드 포커스 고리를 흰색으로(globals.css). 폰 상태 표시줄 색(theme-color)은 app/(site)/layout.tsx.
export function SiteHeader() {
  const { status, doc } = useProgress();
  const { loginReady } = useSite();
  const path = usePathname() ?? '/';
  const guard = useGuardedLinkClick();
  const loggedIn = status === 'ready' && !!doc;
  const dot = hasNewAnswer(doc);
  const items = navItemsFor(status, loggedIn);

  return (
    <header className="on-accent sticky top-0 z-40 bg-band pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-content items-center gap-4 px-safe">
        <Link href="/" onClick={guard('/')} className="inline-flex min-h-11 shrink-0 items-center text-lg font-bold text-on-accent">외도민 준비</Link>

        {items.length > 0 && (
          <nav aria-label="사이트" className="hidden h-full min-w-0 flex-1 items-stretch md:flex">
            {items.map((n) => {
              const on = n.match(path);
              const showDot = n.href === '/house' && dot;
              return (
                <Link key={n.href} href={n.href} onClick={guard(n.href)} aria-current={on ? 'page' : undefined}
                  aria-label={showDot ? `${n.label}, 새 답` : undefined}
                  className={`relative inline-flex min-w-11 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-base text-on-accent transition-colors hover:bg-accent-hover ${on ? 'font-bold' : 'font-semibold'}`}>
                  {n.label}
                  {showDot && <span className="size-1.5 rounded-full bg-on-accent" aria-hidden />}
                  {on && <span className="absolute inset-x-1.5 bottom-0 h-[3px] rounded-full bg-on-accent" aria-hidden />}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {status === 'anon' && (loginReady ? (
            <button type="button" onClick={() => void signIn('google', { callbackUrl: window.location.href })}
              className="inline-flex min-h-11 items-center px-2 text-base font-bold text-on-accent hover:underline">로그인</button>
          ) : (
            <button type="button" disabled aria-disabled="true" className="inline-flex min-h-11 cursor-not-allowed items-center px-2 text-base font-semibold text-on-accent">로그인 준비 중</button>
          ))}
          <AccountMenu canSignOut={status === 'ready' || status === 'forbidden'} />
        </div>
      </div>
    </header>
  );
}
