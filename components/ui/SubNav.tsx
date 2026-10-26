'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGuardedLinkClick } from '@/components/shell/useGuardedNav';

// 페이지 안 하위 화면(우리 집 · 꾸미기) 탭: 주소가 있는 링크. 모양은 시트의 TabBar 와 같다(고른 것 = ink 700 + 3px 밑줄).
// exact = 그 주소일 때만 고른 것(예: /house 는 /house/log 에서 고른 것이 아니다). dot = 새 소식 강조색 점.
export interface SubNavItem { href: string; label: string; dot?: boolean; exact?: boolean }

export function SubNav({ label, items }: { label: string; items: SubNavItem[] }) {
  const path = usePathname() ?? '';
  const guard = useGuardedLinkClick();
  return (
    <nav aria-label={label} className="mb-4 border-b border-line">
      <div className="flex overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it) => {
          const on = it.exact ? path === it.href : path === it.href || path.startsWith(`${it.href}/`);
          return (
            <Link key={it.href} href={it.href} onClick={guard(it.href)} aria-current={on ? 'page' : undefined}
              aria-label={it.dot ? `${it.label}, 새 소식` : undefined}
              className={`relative flex min-h-11 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-base transition-colors ${on ? 'font-bold text-ink' : 'font-semibold text-muted hover:text-ink'}`}>
              {it.label}
              {it.dot && <span className="size-1.5 rounded-full bg-accent-ink" aria-hidden />}
              {on && <span className="absolute inset-x-1.5 bottom-0 h-[3px] rounded-full bg-ink" aria-hidden />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
