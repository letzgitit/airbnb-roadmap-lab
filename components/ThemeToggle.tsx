'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { setMode, useThemeMode, type ThemeMode } from '@/lib/client/theme';

// 머리줄 오른쪽 끝의 아이콘 단추 하나. 누르면 「시스템 / 라이트 / 다크」 작은 메뉴가 열린다.
const OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'system', label: '시스템', icon: 'fa-circle-half-stroke' },
  { mode: 'light', label: '라이트', icon: 'fa-sun' },
  { mode: 'dark', label: '다크', icon: 'fa-moon' },
];

export function ThemeToggle() {
  const mode = useThemeMode();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const cur = OPTIONS.find((o) => o.mode === mode) ?? OPTIONS[0];

  // 열릴 때 현재 항목으로 포커스, 바깥 누름 · Esc 로 닫기(Esc 는 단추로 포커스를 돌려준다)
  useEffect(() => {
    if (!open) return;
    itemRefs.current[OPTIONS.findIndex((o) => o.mode === mode)]?.focus();
    const onDown = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 열릴 때 한 번만 포커스를 옮긴다
  }, [open]);

  const pick = (m: ThemeMode) => { setMode(m); setOpen(false); btnRef.current?.focus(); };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = itemRefs.current.findIndex((el) => el === document.activeElement);
    let n = -1;
    if (e.key === 'ArrowDown') n = (i + 1) % OPTIONS.length;
    else if (e.key === 'ArrowUp') n = (i - 1 + OPTIONS.length) % OPTIONS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = OPTIONS.length - 1;
    else if (e.key === 'Tab') { setOpen(false); return; }
    if (n < 0) return;
    e.preventDefault();
    itemRefs.current[n]?.focus();
  };

  const onBtnKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); }
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button ref={btnRef} type="button" aria-label="화면 모드" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)} onKeyDown={onBtnKey}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50">
        <i className={`fas ${cur.icon} text-[15px]`} aria-hidden />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="화면 모드" onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-[60] mt-2 w-max min-w-[7.5rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:shadow-black/50">
          {OPTIONS.map((o, i) => {
            const on = o.mode === mode;
            return (
              <button key={o.mode} ref={(el) => { itemRefs.current[i] = el; }} type="button" role="menuitemradio" aria-checked={on} tabIndex={on ? 0 : -1}
                onClick={() => pick(o.mode)}
                className={`flex min-h-11 w-full items-center gap-4 whitespace-nowrap px-4 text-left text-[14px] hover:bg-slate-50 focus-visible:bg-slate-100 focus-visible:outline-none ${on ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                <span className="flex-1">{o.label}</span>
                {on && <i className="fas fa-check text-[13px] text-slate-900" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
