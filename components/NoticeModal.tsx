'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { UpdateItem } from '@/lib/core/types';

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);

// 「최근 바뀐 규정」 창: 한 번에 한 항목만 펼치는 아코디언. 홈에선 이 창으로만 들어온다(입구 줄·검색).
export function NoticeModal({ updates, open, shown, initialIndex, onClose }: {
  updates: UpdateItem[]; open: boolean; shown: boolean; initialIndex?: number | null; onClose: () => void;
}) {
  const uid = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // 열릴 때마다 처음 상태로: 검색에서 왔으면 그 항목만 펼친 채, 아니면 전부 접힘
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setExpanded(initialIndex != null && initialIndex >= 0 && initialIndex < updates.length ? initialIndex : null);
  }

  // 열리면 닫기 버튼으로 포커스, Esc 로 닫기, 닫히면 연 요소로 포커스 복귀
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (back && document.contains(back)) back.focus();
    };
  }, [open]);

  // 검색으로 열린 항목이 화면 밖이면 목록 안에서만 스크롤한다(scrollIntoView 는 창 전체를 밀 수 있어 쓰지 않는다)
  useEffect(() => {
    if (!open || initialIndex == null) return;
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-notice="${initialIndex}"]`);
    if (list && el) list.scrollTop = Math.max(0, el.offsetTop - 12);
  }, [open, initialIndex]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
      <div className="modal-overlay absolute inset-0 bg-slate-900/70 backdrop-blur-md" onClick={onClose} />
      <div className={`absolute inset-x-0 bottom-0 top-16 bg-white rounded-t-[40px] flex flex-col modal-content transition-transform ${shown ? '' : 'translate-y-full'} md:relative md:top-auto md:max-w-2xl md:h-[80vh] md:rounded-[32px] md:mt-[10vh] shadow-2xl overflow-hidden`}>
        <div className="px-6 py-6 sm:px-8 border-b border-slate-100 flex justify-between items-start gap-4">
          <div className="min-w-0">
            <h2 id={`${uid}-title`} className="text-2xl font-black text-slate-900">최근 바뀐 규정</h2>
            <p className="text-sm text-slate-600 mt-2 font-medium">외도민 등록·운영에 영향을 주는 법·지침 변화예요. 눌러서 자세히 보세요.</p>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="닫기" className="w-11 h-11 shrink-0 flex items-center justify-center bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors"><i className="fas fa-times" aria-hidden /></button>
        </div>

        <div ref={listRef} className="relative flex-grow overflow-y-auto bg-slate-50/50 p-4 sm:p-6">
          <ul className="space-y-3">
            {updates.map((u, i) => {
              const on = expanded === i;
              const url = safeUrl(u.url);
              const src = u.source || (url ? u.url : '');
              return (
                <li key={i} data-notice={i} className={`rounded-[20px] border bg-white overflow-hidden ${on ? 'border-blue-300' : 'border-slate-200'}`}>
                  <button type="button" aria-expanded={on} aria-controls={`${uid}-body-${i}`} onClick={() => setExpanded(on ? null : i)}
                    className="w-full min-h-14 flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[12px] font-bold">{u.date}</span>
                    <span className="min-w-0 flex-1 text-[14px] font-bold text-slate-800 leading-snug break-keep">{u.title}</span>
                    <i className={`fas ${on ? 'fa-chevron-up' : 'fa-chevron-down'} text-slate-500 text-[12px] shrink-0`} aria-hidden />
                  </button>
                  {on && (
                    <div id={`${uid}-body-${i}`} className="px-4 pb-4 pt-1">
                      <p className="text-[14px] text-slate-700 leading-relaxed">{u.text}</p>
                      {src && (
                        <p className="mt-3 text-[13px] font-semibold text-slate-600">
                          출처{' '}
                          {url
                            ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline underline-offset-2 font-bold break-all">{src}<i className="fas fa-arrow-up-right-from-square ml-1 text-[12px]" aria-hidden /></a>
                            : src}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
