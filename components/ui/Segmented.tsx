'use client';

// 고르개(데일리 .seg — 2026-10-03 「채움 말고 굵은 글자 + 아래 선」): 칸 묶음 한 가지 모양. 필터면 첫 칸은 늘 「전체」. 2~5칸, 넘치면 가로로 밀린다. 6개 이상이면 <select>.
// 고른 칸 = ink 700 + 칸 아래 2px 검정 선, 아닌 칸 = ink-soft 600. 묶음 아래 1px 선. 개수는 이름 뒤 muted 400. dot = 새 소식 점.
import type { KeyboardEvent } from 'react';
import { arrowTarget } from '@/components/simple-home/swipe';

export interface SegmentedOption<T extends string> { value: T; label: string; count?: number; dot?: boolean }

export function Segmented<T extends string>({ label, value, onChange, options, arrowKeys = false }: {
  label: string; value: T; onChange: (v: T) => void; options: SegmentedOption<T>[];
  /** 키보드 ← → Home End 로 칸을 옮긴다(화면을 고르는 줄에만 — 홈 분야 탭 줄과 같은 키, 양 끝에서 멈춤) */
  arrowKeys?: boolean;
}) {
  const onKeyDown = arrowKeys ? (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const keys = options.map((o) => o.value);
    const to = arrowTarget(keys, value, e.key);
    if (!to) return;
    e.preventDefault();
    onChange(to);
    e.currentTarget.querySelectorAll('button')[keys.indexOf(to)]?.focus();
  } : undefined;
  return (
    <div role="group" aria-label={label} onKeyDown={onKeyDown}
      className="flex overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
            className={`flex min-h-11 flex-1 shrink-0 items-center justify-center gap-1 whitespace-nowrap px-3 text-cta transition-colors ${on ? 'font-bold text-ink shadow-[inset_0_-2px_0_var(--color-ink)]' : 'font-semibold text-ink-soft hover:text-ink'}`}>
            <span>{o.label}</span>
            {o.dot && <><span className="size-1.5 rounded-full bg-danger-ink" aria-hidden /><span className="sr-only">(새 소식)</span></>}
            {o.count != null && <span className="font-normal text-muted">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
