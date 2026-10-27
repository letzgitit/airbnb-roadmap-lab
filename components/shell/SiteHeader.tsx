'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { todayStr } from '@/lib/client/format';
import { useProgress } from '@/components/progress/ProgressProvider';
import { firstGuest } from '@/components/home/summary-data';
import { FIXED_DAY0, toTimelineSteps } from '@/components/home/timeline-config';
import { LineIcon } from '@/components/ui/LineIcon';
import { AccountMenu } from './AccountMenu';
import { useGuardedLinkClick } from './useGuardedNav';
import { isHomePath, navItemsFor, type NavItem } from './nav';
import { useSite } from './SiteShell';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 브라우저의 오늘(서버 시각과 어긋나지 않게 그린 뒤에 정한다 — 그 전에는 null) */
function useToday(): string | null {
  const [today, setToday] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 서버 그리기와 맞추려고 그린 뒤 한 번만 정한다
  useEffect(() => { setToday(todayStr()); }, []);
  return today;
}

/**
 * 머리 띠(데일리 형광펜 .hd — 형광 면 통째 + 검정 글자, 다크에서도 같은 형광). 모든 페이지 공통, 위에 붙지 않고 함께 넘어간다.
 * 한 줄: 왼쪽 제호 「외도민 준비」(22/800 — 곧 홈 링크. 시안 · 자금에서는 앞에 「‹」) · 날짜 「10월 28일(수)」 · 「첫 손님까지 D-40」(13 — 로그인했을 때)
 *        / 오른쪽 문 「시안」 「자금」(선 아이콘 + 글자, 지금 화면이면 굵게 + 아래 2px 검정 선) · 로그인 · 설정(톱니).
 * 폰(768px 미만)은 띠가 제호 · 문 · 톱니 한 줄이고, 날짜 · 첫 손님 줄은 그 밑 흰 면 줄(데일리 좁은 화면의 날짜 줄과 같다). 문은 아이콘 위 · 글자 아래.
 * wide = 홈 PC 화면(본문 + 곁 칸 1080px)과 왼쪽 선을 맞춘다.
 */
export function SiteHeader({ wide = false }: { wide?: boolean }) {
  const { status, doc } = useProgress();
  const { loginReady, steps } = useSite();
  const path = usePathname() ?? '/';
  const guard = useGuardedLinkClick();
  const loggedIn = status === 'ready' && !!doc;
  const items = navItemsFor(status, loggedIn);
  const today = useToday();
  const tl = useMemo(() => toTimelineSteps(steps), [steps]);
  const guest = useMemo(() => (doc && today ? firstGuest(tl, doc, today, FIXED_DAY0) : null), [tl, doc, today]);
  const back = !isHomePath(path);
  const width = wide ? 'max-w-content lg:max-w-wide' : 'max-w-content';
  const dateText = today ? `${Number(today.slice(5, 7))}월 ${Number(today.slice(8))}일(${WEEK[new Date(`${today}T00:00:00`).getDay()]})` : null;
  const n = guest?.dday ?? null;
  const ddayText = n == null ? null : n > 0 ? `D-${n}` : n === 0 ? '오늘' : `D+${-n}`;
  const guestLine = ddayText && <span className="whitespace-nowrap">첫 손님까지 <b className="font-bold">{ddayText}</b></span>;

  return (
    <header className="pt-[env(safe-area-inset-top)]">
      {/* 띠 위에서는 포커스 고리도 검정(다크에서도 — 띠가 늘 형광이다) */}
      <div className="bg-marker text-on-marker [--color-accent-ink:var(--color-on-marker)]">
        <div className={`mx-auto flex min-h-14 ${width} items-center gap-x-4 pl-[max(20px,env(safe-area-inset-left))] pr-[max(8px,env(safe-area-inset-right))]`}>
          <Link href="/" onClick={guard('/')} aria-label={back ? '홈으로: 외도민 준비' : undefined}
            className="group -ml-1.5 inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-1.5 text-2xl font-extrabold leading-none tracking-[-0.03em]">
            {back && <span className="mr-1 font-normal" aria-hidden>‹</span>}
            <span className="decoration-2 underline-offset-4 group-hover:underline">외도민 준비</span>
          </Link>
          {(dateText || guestLine) && (
            <p className="hidden min-w-0 items-baseline gap-x-3 text-cta md:flex">
              {dateText && <span className="whitespace-nowrap">{dateText}</span>}
              {guestLine && <span className="text-meta">{guestLine}</span>}
            </p>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-0.5 md:gap-1">
            {items.length > 0 && (
              <nav aria-label="사이트" className="flex items-center">
                {items.map((it) => <Door key={it.href} item={it} on={it.match(path)} onClick={guard(it.href)} />)}
              </nav>
            )}
            {status === 'anon' && (loginReady ? (
              <button type="button" onClick={() => void signIn('google', { callbackUrl: window.location.href })}
                className="inline-flex min-h-11 items-center rounded-control px-2.5 text-cta font-bold underline underline-offset-4 hover:bg-black/10">로그인</button>
            ) : (
              <button type="button" disabled aria-disabled="true" className="inline-flex min-h-11 cursor-not-allowed items-center px-2.5 text-cta font-semibold">로그인 준비 중</button>
            ))}
            <AccountMenu canSignOut={status === 'ready' || status === 'forbidden'} showView={loggedIn} />
          </div>
        </div>
      </div>
      {/* 폰: 날짜 줄은 띠 밑 흰 면(데일리 좁은 화면 .hd-date). 띠는 제호 한 줄만 */}
      {dateText && (
        <div className="border-b border-line bg-surface text-ink-soft md:hidden">
          <p className="flex min-h-10 items-center justify-between gap-3 px-safe text-meta">
            <span className="whitespace-nowrap text-cta">{dateText}</span>
            {guestLine}
          </p>
        </div>
      )}
    </header>
  );
}

/** 머리 띠 오른쪽 문 하나: 선 아이콘 + 글자. 폰은 아이콘 위 · 글자 아래(13), PC 는 한 줄(15). 지금 화면이면 굵게 + 아래 2px 검정 선(형광 채움 없음) */
function Door({ item, on, onClick }: { item: NavItem; on: boolean; onClick: ReturnType<ReturnType<typeof useGuardedLinkClick>> }) {
  return (
    <Link href={item.href} onClick={onClick} aria-current={on ? 'page' : undefined}
      className={`relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-control px-2 text-meta leading-none transition-colors hover:bg-black/10 md:flex-row md:gap-1.5 md:px-2.5 md:text-cta ${on ? 'font-bold' : 'font-semibold'}`}>
      <LineIcon name={item.icon} className="size-5.5 md:size-5" stroke={on ? 2.2 : 1.7} />
      <span className="whitespace-nowrap">{item.label}</span>
      {on && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-on-marker" aria-hidden />}
    </Link>
  );
}
