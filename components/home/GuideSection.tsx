'use client';

import { useState, type ReactNode } from 'react';
import type { ScriptItem, Step, StepStatus, UpdateItem } from '@/lib/core/types';
import type { StepSection } from '@/lib/client/step-sections';
import { Meta } from '@/components/ui/Meta';
import { useProgress } from '@/components/progress/ProgressProvider';
import { HomeSearch } from './HomeSearch';
import { GuideLinks } from './GuideLinks';
import { DateTimeline, type View } from './DateTimeline';
import { FIXED_DAY0, FIXED_MARKS, toTimelineSteps } from './timeline-config';

// 홈 「준비 일정」 구역(누구나 본다. 예전 이름 「단계」 — 안의 「단계」 탭과 겹쳐 바꿨다). 제목은 안의 카드 제목보다 큰 20px.
//   로그인 전 요약 문장(「오늘 시작하면 … 첫 손님을 받아요」)은 요약 탭의 「첫 손님까지」 카드와 같은 말이라 요약 탭에서는 숨긴다. 로그인한 사람과 안 한 사람이 같은 모양을 본다:
//   제목 + 요약 한 줄 → DateTimeline(요약 · 단계 · 달력 탭 + 단계 종류 거르기 칩) → 검색 → 주의사항 · 대화 예시 두 줄.
//   다른 것은 내용뿐이다 — 로그인 전에는 현황(할 일 · 목표일 · 고정 일정 · 단계 상태)이 없어 공개 일정 날수를 오늘부터 센 기간만 보이고,
//   날짜를 눌러 여는 그날 창(편집)이 없다. 요약도 로그인 전 = 일반 안내, 로그인 후 = 「지금 n단계 이름」.
//   현황을 확인하는 동안(처음 불러올 때)은 같은 자리에 반짝이는 칸 — 날짜는 브라우저의 오늘로 계산해야 해서 서버에서 그리지 않는다.
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** 「오늘 10월 27일 (화)」(이 브라우저의 날짜) */
const todayLine = () => { const d = new Date(); return `오늘 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };

export function GuideSection({ steps, updates, scripts, statuses, currentId, onStep, onDay, onNotice, onScript }: {
  steps: Step[]; updates: UpdateItem[]; scripts: ScriptItem[];
  statuses: Record<number, StepStatus | undefined> | null; currentId: number | null;
  onStep: (i: number, section?: StepSection | null) => void; onDay: (date: string) => void; onNotice: (idx: number | null) => void; onScript: (idx: number | null) => void;
}) {
  const { status } = useProgress();
  const warnCount = steps.reduce((n, s) => n + s.warnings.length, 0);
  const guest = !statuses;
  const [view, setView] = useState<View | null>(null);

  // 제목 옆 한 줄: 요약 탭 = 로그인 후 「오늘 10월 27일 (화)」 · 로그인 전 「외국인관광 도시민박업 준비 순서」(첫 손님 날 · 단계는 카드가 말한다),
  //   단계 · 달력 탭 = 로그인 전 일반 안내, 로그인 후 「지금 n단계 이름」
  let summary: ReactNode = `오늘 시작하면 ${steps.length}단계를 거쳐 약 45일 뒤에 첫 손님을 받아요.`;
  if (statuses) {
    const cur = steps.find((s) => s.id === currentId);
    summary = cur ? <Meta><span>지금 {cur.id}단계 {cur.title}</span></Meta> : undefined;
  }
  if (view === 'summary') summary = guest ? '외국인관광 도시민박업 준비 순서' : todayLine();

  return (
    <section aria-labelledby="guide-h">
      {/* 제목(20px) 옆에 한 줄(13px muted)을 같은 줄 글자 바닥에 맞춰 둔다. 좁으면 아래로 내려간다 */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h2 id="guide-h" className="scroll-mt-20 text-xl font-bold text-ink">준비 일정</h2>
        <p className="text-sm font-normal text-muted">{status === 'loading' ? '\u00a0' : summary}</p>
      </div>
      <div className="flex flex-col gap-4">
        {status === 'loading'
          ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <div className="skeleton h-13 rounded-control" />
              <div className="skeleton h-96 rounded-panel" />
              {/* 화면 읽기 · 검색용: 단계 이름 */}
              <ol className="sr-only">{steps.map((s) => <li key={s.id}>{s.id}. {s.title}</li>)}</ol>
            </div>
          )
          : (
            <DateTimeline key={guest ? 'guest' : 'member'} steps={toTimelineSteps(steps)} currentId={currentId} onStep={(i) => onStep(i, null)}
              onDay={guest ? undefined : onDay} fixedDay0={FIXED_DAY0} marks={FIXED_MARKS} guest={guest}
              updates={updates} onNotice={onNotice} onViewChange={setView} />
          )}
        <HomeSearch steps={steps} updates={updates} scripts={scripts}
          onStep={(i, sec) => onStep(i, sec)} onNotice={(idx) => onNotice(idx)} onScript={(idx) => onScript(idx)} />
        <GuideLinks ruleCount={updates.length} warnCount={warnCount} scriptCount={scripts.length}
          onNotice={() => onNotice(null)} onScripts={() => onScript(null)} />
      </div>
    </section>
  );
}
