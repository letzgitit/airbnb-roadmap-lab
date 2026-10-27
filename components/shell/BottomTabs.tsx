'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LineIcon } from '@/components/ui/LineIcon';
import { useGuardedLinkClick } from './useGuardedNav';
import type { NavItem } from './nav';

// 폰(768px 미만) 화면 아래 고정 메뉴: 로그인했을 때만(SiteShell 이 정한다). 높이 60 + 홈 막대 안전 영역.
// 시안 B: 바탕색 면 + 위 1px 선, 선 아이콘 24 + 14px 이름. 지금 있는 칸은 ink 600 · 아이콘 선 굵게, 나머지는 muted 500.
export function BottomTabs({ items }: { items: NavItem[] }) {
  const path = usePathname() ?? '/';
  const guard = useGuardedLinkClick();
  const cols = items.length === 3 ? 'grid-cols-3' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-4';

  return (
    <nav aria-label="사이트" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-page pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className={`mx-auto grid h-15 max-w-content ${cols} pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]`}>
        {items.map((n) => {
          const on = n.match(path);
          return (
            <Link key={n.href} href={n.href} onClick={guard(n.href)} aria-current={on ? 'page' : undefined}
              className={`flex min-h-11 flex-col items-center justify-center gap-0.5 transition-colors ${on ? 'font-semibold text-ink' : 'font-medium text-muted'}`}>
              <LineIcon name={n.icon} stroke={on ? 2.3 : 1.6} />
              <span className="whitespace-nowrap text-sm">{n.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
