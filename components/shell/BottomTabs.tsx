'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGuardedLinkClick } from './useGuardedNav';
import type { NavItem } from './nav';

// 폰(768px 미만) 화면 아래 고정 탭: 로그인했을 때만(SiteShell 이 정한다). 높이 56 + 홈 막대 안전 영역.
// 지금 있는 탭은 ink 700(강조색 아님), 나머지는 muted. 이름은 14px(보조 글자 최소 크기, DESIGN.md 3.1).
export function BottomTabs({ items }: { items: NavItem[] }) {
  const path = usePathname() ?? '/';
  const guard = useGuardedLinkClick();
  const cols = items.length === 3 ? 'grid-cols-3' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-4';

  return (
    <nav aria-label="사이트" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className={`mx-auto grid h-14 max-w-content ${cols} pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]`}>
        {items.map((n) => {
          const on = n.match(path);
          return (
            <Link key={n.href} href={n.href} onClick={guard(n.href)} aria-current={on ? 'page' : undefined}
              className={`flex min-h-11 flex-col items-center justify-center gap-0.5 transition-colors ${on ? 'font-bold text-ink' : 'font-semibold text-muted'}`}>
              <i className={`fas ${n.icon} text-[18px]`} aria-hidden />
              <span className="whitespace-nowrap text-sm leading-tight">{n.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
