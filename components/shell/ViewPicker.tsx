'use client';

import { usePathname } from 'next/navigation';
import { setViewMode, VIEW_HREF, type ViewMode } from '@/lib/client/view-mode';
import { useProgress } from '@/components/progress/ProgressProvider';
import { useGuardedNav } from './useGuardedNav';

const OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: 'simple', label: '간단히 보기' },
  { mode: 'detail', label: '자세히 보기' },
];

/** 예전 화면(/classic) 맨 아래: 로그인했을 때만 고르개(로그인 전 공개 안내에는 「간단히 보기」가 없다) */
export function SignedInViewPicker() {
  const { status, doc } = useProgress();
  if (status !== 'ready' || !doc) return null;
  return <ViewPicker className="mt-10" />;
}

/** 지금 화면이 어느 보기인가(주소로 정한다 — /classic = 자세히) */
export const viewOfPath = (path: string): ViewMode => (path === '/classic' ? 'detail' : 'simple');

/**
 * 홈 보기 고르개 「간단히 보기 | 자세히 보기」(데일리 고르개 꼴 — 고른 칸 = 굵은 글자 + 아래 2px 검정 선, 채움 없음).
 * 홈(간단히) 맨 아래 · 예전 화면(자세히) 맨 아래에 둔다. 고르면 이 기기에 기억하고 그 화면으로 옮긴다(저장 안 한 입력이 있으면 확인 창).
 */
export function ViewPicker({ className = '' }: { className?: string }) {
  const path = usePathname() ?? '/';
  const now = viewOfPath(path);
  const go = useGuardedNav();
  const pick = (m: ViewMode) => {
    if (m === now) return;
    void go(VIEW_HREF[m]).then((moved) => { if (moved) setViewMode(m); });
  };
  return (
    <div role="group" aria-label="홈 보기" className={`flex justify-center ${className}`}>
      <div className="flex border-b border-line">
        {OPTIONS.map((o) => {
          const on = o.mode === now;
          return (
            <button key={o.mode} type="button" aria-pressed={on} onClick={() => pick(o.mode)}
              className={`flex min-h-11 items-center px-4 text-cta transition-colors ${on ? 'font-bold text-ink shadow-[inset_0_-2px_0_var(--color-ink)]' : 'font-semibold text-muted hover:text-ink'}`}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
