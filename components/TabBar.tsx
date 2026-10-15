'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';

export interface TabItem { id: string; label: string; count?: number; tone?: 'danger' }

export const tabDomId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const panelDomId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

// 시트 머리글 아래에 붙는 탭 막대(단계 · 주의사항 · 집 정보·기록 창이 같이 쓴다).
// 고른 탭은 진한 글자 + 진한 밑줄(「주의」 계열만 빨강), 넘치면 막대 안에서만 가로 스크롤, ←/→/Home/End 로 이동.
export function TabBar({ items, value, onChange, label, idPrefix }: {
  items: TabItem[]; value: string; onChange: (id: string) => void; label: string; idPrefix: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const list = listRef.current;
    const el = refs.current[value];
    if (!list || !el || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({ left: el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [value]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.id === value);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = items.length - 1;
    if (n < 0) return;
    e.preventDefault();
    onChange(items[n].id);
    refs.current[items[n].id]?.focus();
  };

  return (
    <div ref={listRef} role="tablist" aria-label={label} onKeyDown={onKey}
      className="relative flex overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((t) => {
        const on = value === t.id;
        const danger = t.tone === 'danger';
        const tone = danger
          ? (on ? 'font-bold text-red-700' : 'font-semibold text-red-600')
          : (on ? 'font-bold text-slate-900' : 'font-semibold text-slate-600 hover:text-slate-800');
        return (
          <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} type="button" role="tab" id={tabDomId(idPrefix, t.id)}
            aria-selected={on} aria-controls={on ? panelDomId(idPrefix, t.id) : undefined} tabIndex={on ? 0 : -1} onClick={() => onChange(t.id)}
            className={`relative flex min-h-11 flex-1 shrink-0 items-center justify-center whitespace-nowrap px-2.5 text-[15px] ${tone}`}>
            {danger && !on && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />}
            {t.label}
            {t.count != null && t.count > 0 && <span className="ml-1">{t.count}</span>}
            {on && <span className={`absolute inset-x-2.5 bottom-0 h-[3px] rounded-full ${danger ? 'bg-red-600' : 'bg-slate-900'}`} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
