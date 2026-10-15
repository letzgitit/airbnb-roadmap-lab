'use client';

import { useId, useMemo, useState } from 'react';
import type { ScriptItem } from '@/lib/core/types';
import { Sheet } from './Sheet';

// 멘트함: 한 열 아코디언. 상대(who)별로 묶고, 상황을 누르면 그 자리에서 멘트가 펼쳐진다(한 번에 하나).
export function ScriptsModal({ scripts, open, shown, onClose }: { scripts: ScriptItem[]; open: boolean; shown: boolean; onClose: () => void }) {
  const uid = useId();
  const groups = useMemo(() => {
    const m = new Map<string, ScriptItem[]>();
    scripts.forEach((s) => m.set(s.who, [...(m.get(s.who) ?? []), s]));
    return [...m.entries()];
  }, [scripts]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(false);

  // 열릴 때마다 전부 접힌 채로
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setExpanded(null);
  }

  return (
    <Sheet open={open} shown={shown} onClose={onClose} bodyClassName="bg-white px-5 pb-8 pt-2" title="멘트함">
      {groups.map(([who, items], gi) => (
        <section key={who} className="pt-5 first:pt-3">
          <h3 className="text-[17px] font-bold text-slate-800">{who}</h3>
          <ul className="mt-1">
            {items.map((it, i) => {
              const key = `${gi}-${i}`;
              const on = expanded === key;
              return (
                <li key={key} className="border-b border-slate-200 last:border-b-0">
                  <button type="button" aria-expanded={on} aria-controls={`${uid}-${key}`} onClick={() => setExpanded(on ? null : key)}
                    className="flex min-h-14 w-full items-center gap-3 py-3 text-left">
                    <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-slate-800">{it.situation}</span>
                    <i className={`fas ${on ? 'fa-chevron-up' : 'fa-chevron-down'} shrink-0 text-[12px] text-slate-500`} aria-hidden />
                  </button>
                  {on && (
                    <div id={`${uid}-${key}`} className="pb-4">
                      {it.lines.map((l, k) => <blockquote key={k} className={`pl-4 text-[17px] font-bold leading-relaxed text-slate-800 ${k ? 'mt-3' : ''}`}>&ldquo;{l}&rdquo;</blockquote>)}
                      {it.tips.map((t, k) => <p key={k} className="mt-3 text-[15px] leading-relaxed text-slate-600">{t}</p>)}
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
