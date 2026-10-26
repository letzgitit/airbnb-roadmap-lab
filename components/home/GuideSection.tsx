'use client';

import type { ReactNode } from 'react';
import type { ScriptItem, Step, StepStatus, UpdateItem } from '@/lib/core/types';
import type { StepSection } from '@/lib/client/step-sections';
import { Meta } from '@/components/ui/Meta';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { TimelineChart, TYPE_DOT, TYPE_LABEL, TYPE_ORDER, type StepCounts } from '@/components/TimelineChart';
import { HomeSearch } from './HomeSearch';
import { GuideLinks } from './GuideLinks';
import { DateTimeline } from './DateTimeline';
import { FIXED_DAY0, FIXED_MARKS, toTimelineSteps } from './timeline-config';

// 홈 「단계」 구역(누구나 본다)
//   로그인 전: 제목 + 요약 한 줄 → 검색 → 주의사항 · 대화 예시 두 줄 → 단계 종류 범례 → 14단계 「n일째」 막대(TimelineChart).
//   로그인 후: 제목 + 요약(「지금 n단계 이름」) → 실제 날짜 타임라인(범례는 상자 맨 아래) + 고른 날 목록(DateTimeline) → 검색 → 주의사항 · 대화 예시.
//     폰 첫 화면에 단계 막대가 10줄 넘게 들어오게 타임라인을 요약 바로 밑으로 올렸다. 끝낸 단계 수는 타임라인의 「끝난 단계 n개」가 말한다.
// 로그인 전에는 공개 안내의 「n일째」 막대(TimelineChart) 그대로 — 실제 날짜는 로그인 뒤 현황에만 있다.
export function GuideSection({ steps, updates, scripts, statuses, counts, currentId, onStep, onDay, onNotice, onScript }: {
  steps: Step[]; updates: UpdateItem[]; scripts: ScriptItem[];
  statuses: Record<number, StepStatus | undefined> | null; counts: Record<number, StepCounts> | null; currentId: number | null;
  onStep: (i: number, section?: StepSection | null) => void; onDay: (date: string) => void; onNotice: (idx: number | null) => void; onScript: (idx: number | null) => void;
}) {
  const warnCount = steps.reduce((n, s) => n + s.warnings.length, 0);
  const chartSteps = steps.map((s) => ({ id: s.id, label: `${s.id}. ${s.title}` }));

  // 요약: 로그인 전 = 일반 안내 한 줄, 로그인 후 = 「지금 n단계 이름」
  let summary: ReactNode = `등록부터 첫 손님까지 약 45일, ${steps.length}단계예요.`;
  if (statuses) {
    const cur = steps.find((s) => s.id === currentId);
    summary = cur ? <Meta><span>지금 {cur.id}단계 {cur.title}</span></Meta> : undefined;
  }
  const guide = (
    <>
      <HomeSearch steps={steps} updates={updates} scripts={scripts}
        onStep={(i, sec) => onStep(i, sec)} onNotice={(idx) => onNotice(idx)} onScript={(idx) => onScript(idx)} />
      <GuideLinks ruleCount={updates.length} warnCount={warnCount} scriptCount={scripts.length}
        onNotice={() => onNotice(null)} onScripts={() => onScript(null)} />
    </>
  );
  const legend = (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-normal text-ink-soft" aria-label="단계 종류 색">
      {TYPE_ORDER.map((t) => (
        <li key={t} className="inline-flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${TYPE_DOT[t]}`} aria-hidden />{TYPE_LABEL[t]}</li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby="guide-h">
      <SectionHeader id="guide-h" title="단계" summary={summary} />
      <div className="flex flex-col gap-4">
        {statuses
          ? <>
              <DateTimeline steps={toTimelineSteps(steps)} currentId={currentId} onStep={(i) => onStep(i, null)} onDay={onDay} fixedDay0={FIXED_DAY0} marks={FIXED_MARKS} legend={legend} />
              {guide}
            </>
          : <>
              {guide}
              {legend}
              <TimelineChart steps={chartSteps} statuses={statuses} counts={counts} currentId={currentId} onSelect={(i) => onStep(i, null)} />
            </>}
      </div>
    </section>
  );
}
