'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useProgress } from './ProgressProvider';
import { PropertyCard } from './PropertyCard';
import { LogCard } from './LogCard';
import { TrashCard } from './TrashCard';

type Tab = 'property' | 'log';
const TABS: { v: Tab; label: string }[] = [
  { v: 'property', label: '집 정보' },
  { v: 'log', label: '기록' },
];

// 「집 정보 · 기록」 창(로그인했을 때만). 집 정보와 기록은 탭으로 나누고, 삭제한 항목(복원)은 항상 맨 아래에 둔다.
export function RecordsModal({ open, shown, onClose }: { open: boolean; shown: boolean; onClose: () => void }) {
  const uid = useId();
  const { hasDirty, confirmDiscard } = useProgress();
  const [tab, setTab] = useState<Tab>('property');
  const [wasOpen, setWasOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 저장 안 한 내용(어느 폼이든)이 있으면 닫기·바깥 누르기·Esc 모두 앱 안 확인 창을 거친다
  const guardedClose = () => {
    if (!hasDirty()) { onClose(); return; }
    void confirmDiscard().then((ok) => { if (ok) onClose(); });
  };
  const closeRefFn = useRef(guardedClose);
  useEffect(() => { closeRefFn.current = guardedClose; });

  // 열릴 때마다 「집 정보」 탭부터
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTab('property');
  }

  // 열리면 닫기 버튼으로 포커스, Esc 로 닫기, 닫히면 연 요소로 포커스 복귀
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRefFn.current(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (back && document.contains(back)) back.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
      <div className="modal-overlay absolute inset-0 bg-slate-900/70 backdrop-blur-md" onClick={guardedClose} />
      <div className={`absolute inset-x-0 bottom-0 top-16 bg-white rounded-t-[40px] flex flex-col modal-content transition-transform ${shown ? '' : 'translate-y-full'} md:relative md:top-auto md:max-w-2xl md:h-[80vh] md:rounded-[32px] md:mt-[10vh] shadow-2xl overflow-hidden`}>
        <div className="px-6 py-6 sm:px-8 border-b border-slate-100 flex justify-between items-center gap-4">
          <h2 id={`${uid}-title`} className="text-2xl font-black text-slate-900">집 정보 · 기록</h2>
          <button ref={closeRef} onClick={guardedClose} aria-label="닫기" className="w-11 h-11 shrink-0 flex items-center justify-center bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors"><i className="fas fa-times" aria-hidden /></button>
        </div>

        <div className="flex-grow overflow-y-auto px-5 pt-5 pb-8 sm:px-8">
          <div className="status-seg grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-2xl" role="group" aria-label="보기 전환">
            {TABS.map((t) => (
              <button key={t.v} type="button" onClick={() => setTab(t.v)} aria-pressed={tab === t.v}
                className={`min-h-11 rounded-xl text-[14px] ${tab === t.v ? 'bg-white shadow-sm font-bold text-slate-800' : 'font-semibold text-slate-600 hover:bg-white/60'}`}>{t.label}</button>
            ))}
          </div>

          {/* 두 탭 모두 그려 두고 안 보이는 쪽만 숨긴다: 탭을 옮겨도 쓰던 글·편집 중 표시·저장 안 한 내용 추적이 사라지지 않게 */}
          <div className="mt-5" hidden={tab !== 'property'}><PropertyCard /></div>
          <div className="mt-5" hidden={tab !== 'log'}><LogCard /></div>

          <TrashCard />
        </div>
      </div>
    </div>
  );
}
