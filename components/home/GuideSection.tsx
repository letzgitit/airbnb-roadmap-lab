'use client';

import { useState, type ReactNode } from 'react';
import type { ScriptItem, Step, StepStatus, UpdateItem } from '@/lib/core/types';
import type { StepSection } from '@/lib/client/step-sections';
import { Meta } from '@/components/ui/Meta';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Segmented } from '@/components/ui/Segmented';
import { TimelineChart, TYPE_DOT, TYPE_LABEL, TYPE_ORDER, type StepCounts } from '@/components/TimelineChart';
import { HomeSearch } from './HomeSearch';
import { GuideLinks } from './GuideLinks';
import { DateTimeline } from './DateTimeline';

// 홈 「단계」 구역(누구나 본다): 제목 + 요약 한 줄 → 검색 → 주의사항 · 대화 예시 두 줄 → 단계 종류 범례 → 14단계 목록.
// 로그인하면 목록 위에 보기 고르기 「날짜순 · 단계순」(기본 날짜순, 기억하지 않음)이 붙는다.
//   날짜순 = 우리 현황의 단계 목표일 · 할 일 마감을 주로 묶은 목록(DateTimeline), 단계순 = 공개 안내의 14단계 + 기간 막대.
// 로그인 전에는 보기 고르기가 없다: 공개 안내의 일정은 「n일째」뿐이고 그 순서가 단계 순서와 같아 바꿔 볼 것이 없다.
export function GuideSection({ steps, updates, scripts, statuses, counts, currentId, onStep, onNotice, onScript }: {
  steps: Step[]; updates: UpdateItem[]; scripts: ScriptItem[];
  statuses: Record<number, StepStatus | undefined> | null; counts: Record<number, StepCounts> | null; currentId: number | null;
  onStep: (i: number, section?: StepSection | null) => void; onNotice: (idx: number | null) => void; onScript: (idx: number | null) => void;
}) {
  const warnCount = steps.reduce((n, s) => n + s.warnings.length, 0);
  const chartSteps = steps.map((s) => ({ id: s.id, label: `${s.id}. ${s.title}` }));
  const [view, setView] = useState<'date' | 'step'>('date');
  const byDate = !!statuses && view === 'date';

  // 요약: 로그인 전 = 일반 안내 한 줄, 로그인 후 = 「14단계 중 n개 끝」 「지금 n단계 이름」(점 없이 12px 간격)
  let summary: ReactNode = `등록부터 첫 손님까지 약 45일, ${steps.length}단계예요.`;
  if (statuses) {
    const doneN = steps.filter((s) => statuses[s.id] === 'done').length;
    const cur = steps.find((s) => s.id === currentId);
    summary = (
      <Meta>
        <span>{steps.length}단계 중 {doneN}개 끝</span>
        {cur && <span>지금 {cur.id}단계 {cur.title}</span>}
      </Meta>
    );
  }

  return (
    <section aria-labelledby="guide-h">
      <SectionHeader id="guide-h" title="단계" summary={summary} />
      <div className="flex flex-col gap-4">
        <HomeSearch steps={steps} updates={updates} scripts={scripts}
          onStep={(i, sec) => onStep(i, sec)} onNotice={(idx) => onNotice(idx)} onScript={(idx) => onScript(idx)} />
        <GuideLinks ruleCount={updates.length} warnCount={warnCount} scriptCount={scripts.length}
          onNotice={() => onNotice(null)} onScripts={() => onScript(null)} />
        {statuses && (
          <Segmented label="보기" value={view} onChange={setView}
            options={[{ value: 'date', label: '날짜순' }, { value: 'step', label: '단계순' }]} />
        )}
        {byDate && statuses
          ? <DateTimeline steps={steps} statuses={statuses} onStep={(i) => onStep(i, null)} />
          : <>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-normal text-ink-soft" aria-label="단계 종류 색">
                {TYPE_ORDER.map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${TYPE_DOT[t]}`} aria-hidden />{TYPE_LABEL[t]}</li>
                ))}
              </ul>
              <TimelineChart steps={chartSteps} statuses={statuses} counts={counts} currentId={currentId} onSelect={(i) => onStep(i, null)} />
            </>}
      </div>
    </section>
  );
}
