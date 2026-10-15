'use client';

import { useState } from 'react';
import { Sheet } from '../Sheet';
import { PropertyCard } from './PropertyCard';
import { LogCard } from './LogCard';
import { TrashCard } from './TrashCard';

type Tab = 'property' | 'log';
const TABS: { v: Tab; label: string }[] = [
  { v: 'property', label: '집 정보' },
  { v: 'log', label: '기록' },
];

// 「집 정보 · 기록」 창(로그인했을 때만). 집 정보와 기록은 탭으로 나누고, 삭제한 항목(복원)은 항상 맨 아래에 둔다.
// 저장 안 한 편집이 있으면 닫기 전에 beforeClose 가 앱 안 확인 창을 띄운다(✕ · 바깥 · Esc · 뒤로 가기 모두).
export function RecordsModal({ open, shown, onClose, beforeClose }: {
  open: boolean; shown: boolean; onClose: () => void; beforeClose: () => Promise<boolean>;
}) {
  const [tab, setTab] = useState<Tab>('property');
  const [wasOpen, setWasOpen] = useState(false);

  // 열릴 때마다 「집 정보」 탭부터
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTab('property');
  }

  return (
    <Sheet open={open} shown={shown} onClose={onClose} beforeClose={beforeClose} bodyClassName="bg-white px-5 pb-8 pt-5" title="집 정보 · 기록">
      <div className="status-seg grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1" role="group" aria-label="보기 전환">
        {TABS.map((t) => (
          <button key={t.v} type="button" onClick={() => setTab(t.v)} aria-pressed={tab === t.v}
            className={`min-h-11 rounded-xl text-[14px] ${tab === t.v ? 'bg-white font-bold text-slate-800 shadow-sm' : 'font-semibold text-slate-600 hover:bg-white/60'}`}>{t.label}</button>
        ))}
      </div>

      {/* 두 탭 모두 그려 두고 안 보이는 쪽만 숨긴다: 탭을 옮겨도 쓰던 글·편집 중 표시·저장 안 한 내용 추적이 사라지지 않게 */}
      <div className="mt-5" hidden={tab !== 'property'}><PropertyCard /></div>
      <div className="mt-5" hidden={tab !== 'log'}><LogCard /></div>

      <TrashCard />
    </Sheet>
  );
}
