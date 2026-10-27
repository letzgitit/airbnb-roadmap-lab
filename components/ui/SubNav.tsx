'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGuardedLinkClick } from '@/components/shell/useGuardedNav';

// 페이지 안 하위 화면(우리 집 · 시안) 탭: 주소가 있는 링크. 데일리 보조 탭(.subtab) 결 — 흰 면 줄, 글자 16, 고른 것 = ink 700 + 2px 검정 밑줄, 나머지 ink-soft 600, 아래 1px 선.
// exact = 그 주소일 때만 고른 것(예: /house 는 /house/log 에서 고른 것이 아니다). dot = 새 소식 점.
export interface SubNavItem { href: string; label: string; dot?: boolean; exact?: boolean }

export function SubNav({ label, items }: { label: string; items: SubNavItem[] }) {
  const path = usePathname() ?? '';
  const guard = useGuardedLinkClick();
  return (
    <nav aria-label={label} className="mb-5 border-b border-line">
      <div className="flex gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it) => {
          const on = it.exact ? path === it.href : path === it.href || path.startsWith(`${it.href}/`);
          return (
            <Link key={it.href} href={it.href} onClick={guard(it.href)} aria-current={on ? 'page' : undefined}
              aria-label={it.dot ? `${it.label}, 새 소식` : undefined}
              className={`relative flex min-h-11.5 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap text-base transition-colors ${on ? 'font-bold text-ink' : 'font-semibold text-ink-soft hover:text-ink'}`}>
              {it.label}
              {it.dot && <span className="size-1.5 rounded-full bg-danger-ink" aria-hidden />}
              {on && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" aria-hidden />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
