'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { UpdateItem } from '@/lib/core/types';
import { Sheet } from './Sheet';

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);

// 「최근 바뀐 규정」 창: 한 번에 한 항목만 펼치는 아코디언. 홈에선 이 창으로만 들어온다(입구 줄·검색).
export function NoticeModal({ updates, open, shown, initialIndex, onClose }: {
  updates: UpdateItem[]; open: boolean; shown: boolean; initialIndex?: number | null; onClose: () => void;
}) {
  const uid = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [wasOpen, setWasOpen] = useState(false);

  // 열릴 때마다 처음 상태로: 검색에서 왔으면 그 항목만 펼친 채, 아니면 전부 접힘
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setExpanded(initialIndex != null && initialIndex >= 0 && initialIndex < updates.length ? initialIndex : null);
  }

  // 검색으로 열린 항목이 화면 밖이면 목록 안에서만 스크롤한다(scrollIntoView 는 창 전체를 밀 수 있어 쓰지 않는다)
  useEffect(() => {
    if (!open || initialIndex == null) return;
    const body = bodyRef.current;
    const el = body?.querySelector<HTMLElement>(`[data-notice="${initialIndex}"]`);
    if (body && el) body.scrollTop = Math.max(0, el.offsetTop - 12);
  }, [open, initialIndex]);

  return (
    <Sheet open={open} shown={shown} onClose={onClose} bodyRef={bodyRef} bodyClassName="relative bg-slate-50/50 p-4 sm:p-5"
      title="최근 바뀐 규정" subtitle="외도민 등록·운영에 영향을 주는 법·지침 변화예요. 눌러서 자세히 보세요.">
      <ul className="space-y-3">
        {updates.map((u, i) => {
          const on = expanded === i;
          const url = safeUrl(u.url);
          const src = u.source || (url ? u.url : '');
          return (
            <li key={i} data-notice={i} className={`overflow-hidden rounded-[20px] border bg-white ${on ? 'border-blue-300' : 'border-slate-200'}`}>
              <button type="button" aria-expanded={on} aria-controls={`${uid}-body-${i}`} onClick={() => setExpanded(on ? null : i)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-bold text-slate-700">{u.date}</span>
                <span className="min-w-0 flex-1 break-keep text-[14px] font-bold leading-snug text-slate-800">{u.title}</span>
                <i className={`fas ${on ? 'fa-chevron-up' : 'fa-chevron-down'} shrink-0 text-[12px] text-slate-500`} aria-hidden />
              </button>
              {on && (
                <div id={`${uid}-body-${i}`} className="px-4 pb-4 pt-1">
                  <p className="text-[14px] leading-relaxed text-slate-700">{u.text}</p>
                  {src && (
                    <p className="mt-3 text-[13px] font-semibold text-slate-600">
                      출처{' '}
                      {url
                        ? <a href={url} target="_blank" rel="noopener noreferrer" className="break-all font-bold text-blue-700 underline underline-offset-2">{src}<i className="fas fa-arrow-up-right-from-square ml-1 text-[12px]" aria-hidden /></a>
                        : src}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
