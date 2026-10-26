'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ScriptItem } from '@/lib/core/types';
import { Sheet } from './Sheet';

// 대화 예시: 한 열 아코디언. 상대(who)별로 묶고, 상황을 누르면 그 자리에서 말할 문장이 펼쳐진다(한 번에 하나).
// initialIndex = scripts 안의 순번: 검색에서 오면 그 항목을 펼친 채 열고, 시트 안에서만 그 자리로 스크롤한다.
export function ScriptsModal({ scripts, open, shown, initialIndex, onClose }: {
  scripts: ScriptItem[]; open: boolean; shown: boolean; initialIndex?: number | null; onClose: () => void;
}) {
  const uid = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const m = new Map<string, { it: ScriptItem; idx: number }[]>();
    scripts.forEach((it, idx) => m.set(it.who, [...(m.get(it.who) ?? []), { it, idx }]));
    return [...m.entries()];
  }, [scripts]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [wasOpen, setWasOpen] = useState(false);

  // 열릴 때마다 처음 상태로: 전부 접힌 채, 검색에서 왔으면 그 항목만 펼친 채
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setExpanded(initialIndex != null && initialIndex >= 0 && initialIndex < scripts.length ? initialIndex : null);
  }

  // 검색으로 열린 항목이 화면 밖이면 목록 안에서만 스크롤한다(scrollIntoView 는 창 전체를 밀 수 있어 쓰지 않는다)
  useEffect(() => {
    if (!open || initialIndex == null) return;
    const body = bodyRef.current;
    const el = body?.querySelector<HTMLElement>(`[data-script="${initialIndex}"]`);
    if (body && el) body.scrollTop = Math.max(0, el.offsetTop - 12);
  }, [open, initialIndex]);

  return (
    <Sheet open={open} shown={shown} onClose={onClose} bodyRef={bodyRef} bodyClassName="relative bg-surface px-4 pb-8 pt-2" title="대화 예시">
      {groups.map(([who, items]) => (
        <section key={who} className="pt-6 first:pt-4">
          <h3 className="text-lg font-bold text-ink">{who}</h3>
          <ul className="mt-1">
            {items.map(({ it, idx }) => {
              const on = expanded === idx;
              return (
                <li key={idx} data-script={idx} className="border-b border-line last:border-b-0">
                  <button type="button" aria-expanded={on} aria-controls={`${uid}-${idx}`} onClick={() => setExpanded(on ? null : idx)}
                    className="flex min-h-11 w-full items-center gap-3 py-3 text-left">
                    <span className="min-w-0 flex-1 text-base font-semibold text-ink">{it.situation}</span>
                    <i className={`fas fa-chevron-down shrink-0 text-xs text-muted transition-transform ${on ? 'rotate-180' : ''}`} aria-hidden />
                  </button>
                  {on && (
                    <div id={`${uid}-${idx}`} className="pb-4">
                      {it.lines.map((l, k) => (
                        <blockquote key={k} className={`border-l-2 border-line-strong pl-3 text-lg font-semibold leading-relaxed text-ink ${k ? 'mt-3' : ''}`}>&ldquo;{l}&rdquo;</blockquote>
                      ))}
                      {it.tips.map((t, k) => <p key={k} className="mt-3 text-base font-normal leading-relaxed text-ink-soft">{t}</p>)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}
