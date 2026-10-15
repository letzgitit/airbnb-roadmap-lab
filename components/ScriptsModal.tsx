'use client';

import { useId, useMemo, useState } from 'react';
import type { ScriptItem } from '@/lib/core/types';
import { Sheet } from './Sheet';

function iconFor(who: string) {
  if (/중개/.test(who)) return 'fa-building';
  if (/임대|집주인/.test(who)) return 'fa-user-tie';
  if (/이웃|주민/.test(who)) return 'fa-users';
  if (/구청|주무관|공무원/.test(who)) return 'fa-landmark';
  if (/게스트|손님/.test(who)) return 'fa-plane-arrival';
  return 'fa-comment-dots';
}

// 멘트함: 한 줄(한 열) 아코디언. 상대(who)별로 묶고, 상황을 누르면 그 자리에서 멘트가 펼쳐진다(한 번에 하나).
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
    <Sheet open={open} shown={shown} onClose={onClose} bodyClassName="bg-slate-50/50 p-4 sm:p-5"
      title="상황별 필승 멘트 공략집" subtitle={`당신을 전문가로 만들어주는 ${groups.length}인의 이해관계자 대응법`}>
      {groups.map(([who, items], gi) => (
        <section key={who} className="mb-7 last:mb-0">
          <h3 className="mb-3 flex items-center gap-3 text-base font-black text-blue-800">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600"><i className={`fas ${iconFor(who)}`} aria-hidden /></span>
            {who}
          </h3>
          <ul className="space-y-2.5">
            {items.map((it, i) => {
              const key = `${gi}-${i}`;
              const on = expanded === key;
              return (
                <li key={key} className={`overflow-hidden rounded-[20px] border bg-white ${on ? 'border-blue-300' : 'border-slate-200'}`}>
                  <button type="button" aria-expanded={on} aria-controls={`${uid}-${key}`} onClick={() => setExpanded(on ? null : key)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                    <span className="min-w-0 flex-1 text-[14px] font-bold leading-snug text-slate-800">{it.situation}</span>
                    <i className={`fas ${on ? 'fa-chevron-up' : 'fa-chevron-down'} shrink-0 text-[12px] text-slate-500`} aria-hidden />
                  </button>
                  {on && (
                    <div id={`${uid}-${key}`} className="px-4 pb-4">
                      <div className="script-box mb-3 mt-1">
                        {it.lines.map((l, k) => <blockquote key={k} className={k ? 'mt-3' : ''}>&ldquo;{l}&rdquo;</blockquote>)}
                      </div>
                      {it.tips.map((t, k) => <p key={k} className="mt-2 text-[14px] leading-relaxed text-slate-700">{t}</p>)}
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
