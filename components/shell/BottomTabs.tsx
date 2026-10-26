'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useProgress } from '@/components/progress/ProgressProvider';
import { useGuardedLinkClick } from './useGuardedNav';
import { hasNewAnswer, type NavItem } from './nav';

// 폰(768px 미만) 화면 아래 고정 탭: 로그인했을 때만(SiteShell 이 정한다). 높이 56 + 홈 막대 안전 영역.
// 지금 있는 탭은 ink 700(강조색 아님), 나머지는 muted. 「우리 집」은 새 답이 있으면 강조색 점.
export function BottomTabs({ items }: { items: NavItem[] }) {
  const { doc } = useProgress();
  const path = usePathname() ?? '/';
  const guard = useGuardedLinkClick();
  const dot = hasNewAnswer(doc);

  return (
    <nav aria-label="사이트" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className={`mx-auto grid h-14 max-w-content ${items.length === 4 ? 'grid-cols-4' : 'grid-cols-2'} pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]`}>
        {items.map((n) => {
          const on = n.match(path);
          const showDot = n.href === '/house' && dot;
          return (
            <Link key={n.href} href={n.href} onClick={guard(n.href)} aria-current={on ? 'page' : undefined}
              aria-label={showDot ? `${n.label}, 새 답` : undefined}
              className={`flex min-h-11 flex-col items-center justify-center gap-0.5 transition-colors ${on ? 'font-bold text-ink' : 'font-semibold text-muted'}`}>
              <span className="relative">
                <i className={`fas ${n.icon} text-[18px]`} aria-hidden />
                {showDot && <span className="absolute -right-1.5 -top-0.5 size-2 rounded-full bg-accent-ink ring-2 ring-surface" aria-hidden />}
              </span>
              <span className="whitespace-nowrap text-xs">{n.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
