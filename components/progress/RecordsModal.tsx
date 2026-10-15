'use client';

import { useId, useState } from 'react';
import { displayName, relTime } from '@/lib/client/format';
import { Sheet } from '../Sheet';
import { TabBar, panelDomId, tabDomId, type TabItem } from '../TabBar';
import { useProgress } from './ProgressProvider';
import { PropertyCard } from './PropertyCard';
import { LogCard } from './LogCard';
import { TrashCard } from './TrashCard';

type Tab = 'property' | 'log';
const TABS: TabItem[] = [
  { id: 'property', label: '집 정보' },
  { id: 'log', label: '기록' },
];

// 「집 정보 · 기록」 창(로그인했을 때만). 집 정보와 기록은 다른 창과 같은 탭 막대로 나누고, 삭제한 항목(복원)은 항상 맨 아래에 둔다.
// 저장 안 한 편집이 있으면 닫기 전에 beforeClose 가 앱 안 확인 창을 띄운다(✕ · 바깥 · Esc · 뒤로 가기 모두).
export function RecordsModal({ open, shown, onClose, beforeClose }: {
  open: boolean; shown: boolean; onClose: () => void; beforeClose: () => Promise<boolean>;
}) {
  const uid = useId();
  const { doc } = useProgress();
  const [tab, setTab] = useState<Tab>('property');
  const [wasOpen, setWasOpen] = useState(false);
  const la = doc?.lastAction;

  // 열릴 때마다 「집 정보」 탭부터
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTab('property');
  }

  return (
    <Sheet open={open} shown={shown} onClose={onClose} beforeClose={beforeClose} bodyClassName="bg-white px-5 pb-8 pt-3" title="집 정보 · 기록"
      tabs={<TabBar items={TABS} value={tab} onChange={(id) => setTab(id as Tab)} label="집 정보와 기록" idPrefix={uid} />}>
      {/* 두 탭 모두 그려 두고 안 보이는 쪽만 숨긴다: 탭을 옮겨도 쓰던 글·편집 중 표시·저장 안 한 내용 추적이 사라지지 않게 */}
      <div role="tabpanel" id={panelDomId(uid, 'property')} aria-labelledby={tabDomId(uid, 'property')} hidden={tab !== 'property'}>
        <PropertyCard />
      </div>
      <div role="tabpanel" id={panelDomId(uid, 'log')} aria-labelledby={tabDomId(uid, 'log')} hidden={tab !== 'log'}>
        <div className="mb-4 pt-1" aria-live="polite">
          {la ? (
            <>
              <div className="flex flex-wrap gap-x-3 text-[13px] font-semibold text-slate-500">
                <span>마지막 수정</span><span className="font-bold text-slate-700">{displayName(la.by)}</span><span>{relTime(la.at)}</span>
              </div>
              <p className="mt-1 text-[15px] text-slate-700">{la.text}</p>
            </>
          ) : <p className="text-[13px] font-semibold text-slate-500">아직 수정 내역이 없어요.</p>}
        </div>
        <LogCard />
      </div>

      <TrashCard />
    </Sheet>
  );
}
