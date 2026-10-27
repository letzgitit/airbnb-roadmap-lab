'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { signOut } from 'next-auth/react';
import { setMode, useThemeMode, type ThemeMode } from '@/lib/client/theme';
import { IconButton } from '@/components/ui/IconButton';

// 머리글 오른쪽 끝 「설정」 메뉴: 화면 모드(시스템 / 라이트 / 다크) + 로그인했으면 「로그아웃」.
// 키보드: 단추에서 ↓ = 열기, 메뉴 안 ↑↓ · Home · End 로 옮기기, Esc = 닫고 단추로, Tab = 닫기(옛 ThemeToggle 과 같다).
const MODES: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'system', label: '시스템', icon: 'fa-circle-half-stroke' },
  { mode: 'light', label: '라이트', icon: 'fa-sun' },
  { mode: 'dark', label: '다크', icon: 'fa-moon' },
];

const itemCls = 'flex min-h-11 w-full items-center gap-3 whitespace-nowrap px-4 text-left text-base hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none';

export function AccountMenu({ canSignOut }: { canSignOut: boolean }) {
  const mode = useThemeMode();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const count = MODES.length + (canSignOut ? 1 : 0);

  // 열릴 때 지금 고른 모드로 포커스, 바깥 누름 · Esc 로 닫기(Esc 는 단추로 포커스를 돌려준다)
  useEffect(() => {
    if (!open) return;
    itemRefs.current[Math.max(0, MODES.findIndex((o) => o.mode === mode))]?.focus();
    const onDown = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 열릴 때 한 번만 포커스를 옮긴다
  }, [open]);

  const pick = (m: ThemeMode) => { setMode(m); setOpen(false); btnRef.current?.focus(); };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = itemRefs.current.slice(0, count).findIndex((el) => el === document.activeElement);
    let n = -1;
    if (e.key === 'ArrowDown') n = (i + 1) % count;
    else if (e.key === 'ArrowUp') n = (i - 1 + count) % count;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = count - 1;
    else if (e.key === 'Tab') { setOpen(false); return; }
    if (n < 0) return;
    e.preventDefault();
    itemRefs.current[n]?.focus();
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <IconButton buttonRef={btnRef} label="설정" icon="gear" variant="outline" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)} onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }} />
      {open && (
        <div id={menuId} role="menu" aria-label="설정" onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-50 mt-2 w-max min-w-44 overflow-hidden rounded-control border border-line bg-surface py-1 shadow-xl dark:shadow-black/50">
          <div role="group" aria-labelledby={`${menuId}-mode`}>
            <p id={`${menuId}-mode`} role="presentation" className="px-4 pb-1 pt-2 text-sm font-normal text-muted">화면 모드</p>
            {MODES.map((o, i) => {
              const on = o.mode === mode;
              return (
                <button key={o.mode} ref={(el) => { itemRefs.current[i] = el; }} type="button" role="menuitemradio" aria-checked={on} tabIndex={on ? 0 : -1}
                  onClick={() => pick(o.mode)} className={`${itemCls} ${on ? 'font-bold text-ink' : 'font-semibold text-ink-soft'}`}>
                  <i className={`fas ${o.icon} w-4 text-center text-sm text-muted`} aria-hidden />
                  <span className="flex-1">{o.label}</span>
                  {on && <i className="fas fa-check text-sm text-ink" aria-hidden />}
                </button>
              );
            })}
          </div>
          {canSignOut && (
            <>
              <div role="separator" className="my-1 border-t border-line" />
              <button ref={(el) => { itemRefs.current[MODES.length] = el; }} type="button" role="menuitem" tabIndex={-1}
                onClick={() => { setOpen(false); void signOut({ callbackUrl: '/' }); }} className={`${itemCls} font-semibold text-ink-soft`}>
                <i className="fas fa-arrow-right-from-bracket w-4 text-center text-sm text-muted" aria-hidden />
                <span className="flex-1">로그아웃</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
