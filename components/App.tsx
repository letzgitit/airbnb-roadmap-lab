'use client';

import { useCallback, useMemo } from 'react';
import type { Content, StepStatus } from '@/lib/core/types';
import type { StepSection } from '@/lib/client/step-sections';
import { dueState, todayStr } from '@/lib/client/format';
import type { StepCounts } from './TimelineChart';
import { StepModal } from './StepModal';
import { DaySheet } from './home/DaySheet';
import { FIXED_DAY0, FIXED_MARKS, toTimelineSteps } from './home/timeline-config';
import { ScriptsModal } from './ScriptsModal';
import { NoticeModal } from './NoticeModal';
import { GuideSection } from './home/GuideSection';
import { useProgress } from './progress/ProgressProvider';
import { useSheetRouter, type SheetKind } from './use-sheet-router';

// 홈. 머리글 · 내비게이션 · 진행 현황(ProgressProvider) · 사진(PhotosProvider)은 사이트 틀(components/shell/SiteShell)이 맡는다.
// 구성: 「단계」(요약 · 검색 · 주의사항/대화 예시 · 범례 · 로그인 전 14단계 「n일째」 막대 / 로그인 후 실제 날짜 타임라인 + 고른 날의 할 일) → 꼬리글.
// 공개 안내 시트 셋(단계 · 주의사항 · 대화 예시)은 주소 해시(#step-3 · #notice · #scripts)와 함께 열고 닫는다.
export default function App({ content }: { content: Content }) {
  const { steps, scripts, updates } = content;
  const { status, doc, hasDirty, confirmDiscard } = useProgress();
  const loggedIn = status === 'ready' && !!doc;
  const stepIds = useMemo(() => steps.map((s) => s.id), [steps]);

  // 저장 안 한 편집이 있는 시트는 떠나기 전에 앱 안 확인 창을 거친다(단계 창 = 그 창 안의 폼)
  const isDirty = useCallback((kind: SheetKind) => (kind === 'step' || kind === 'day' ? hasDirty('modal') : false), [hasDirty]);
  const guard = useCallback(async (kind: SheetKind) => !isDirty(kind) || (await confirmDiscard()), [isDirty, confirmDiscard]);

  // 시트는 한 번에 하나만, 주소 해시와 함께 열고 닫는다(옛 #records 는 /house 로 옮긴다)
  const { sheet, shown, open: openSheet, close: closeSheet, goStep, swap: swapSheet } = useSheetRouter({ stepIds, loggedIn, status, isDirty, confirm: confirmDiscard });

  const statuses = useMemo(() => {
    if (!loggedIn || !doc) return null;
    const m: Record<number, StepStatus | undefined> = {};
    steps.forEach((s) => { m[s.id] = doc.steps[String(s.id)]?.status; });
    return m;
  }, [loggedIn, doc, steps]);
  // 단계별 할 일 개수. 「오늘 n」 · 「기한 지남 n」은 안 끝난 할 일만 센다(마감 기준은 할 일 줄의 날짜 표시와 같다).
  const today = todayStr();
  const counts = useMemo(() => {
    if (!loggedIn || !doc) return null;
    const m: Record<number, StepCounts> = {};
    Object.values(doc.tasks).forEach((t) => {
      if (t.deletedAt) return;
      const c = (m[t.stepId] ??= { done: 0, total: 0, today: 0, late: 0 });
      c.total += 1;
      if (t.done) { c.done += 1; return; }
      const due = dueState(t.due, today);
      if (due === 'today') c.today += 1;
      else if (due === 'late') c.late += 1;
    });
    return m;
  }, [loggedIn, doc, today]);
  // 지금 하는 단계: 진행 중인 첫 단계, 없으면 시작 안 한 첫 단계(단계 목록의 「지금」 줄, 새 할 일의 기본 단계)
  const currentId = useMemo(() => {
    if (!statuses) return null;
    const first = (want: StepStatus) => steps.find((s) => (statuses[s.id] ?? 'todo') === want)?.id;
    return first('doing') ?? first('todo') ?? null;
  }, [statuses, steps]);

  const openStep = useCallback((i: number, section: StepSection | null = null) => openSheet({ kind: 'step', index: i, section }), [openSheet]);
  const openNotice = useCallback((idx: number | null = null) => openSheet({ kind: 'notice', initialIndex: idx }), [openSheet]);
  const openDay = useCallback((date: string) => openSheet({ kind: 'day', date }), [openSheet]);
  const tlSteps = useMemo(() => toTimelineSteps(steps), [steps]);
  const openScript = useCallback((idx: number | null = null) => openSheet({ kind: 'scripts', initialIndex: idx }), [openSheet]);

  return (
    <>
      <h1 className="sr-only">외도민 타임 라인</h1>
      <div className="flex flex-col gap-6">
        <GuideSection steps={steps} updates={updates} scripts={scripts} statuses={statuses} counts={counts} currentId={currentId}
          onStep={openStep} onDay={openDay} onNotice={openNotice} onScript={openScript} />
      </div>
      <footer className="mt-8 flex flex-wrap gap-x-3 text-sm font-normal text-muted"><span>만든 곳</span><span>주money</span></footer>

      <StepModal steps={steps} index={sheet?.kind === 'step' ? sheet.index : 0} section={sheet?.kind === 'step' ? sheet.section : null}
        open={sheet?.kind === 'step'} shown={shown} loggedIn={loggedIn} onClose={closeSheet} beforeClose={() => guard('step')} onGo={goStep} />
      {loggedIn && (
        <DaySheet date={sheet?.kind === 'day' ? sheet.date : ''} open={sheet?.kind === 'day'} shown={shown} steps={tlSteps} currentId={currentId}
          fixedDay0={FIXED_DAY0} marks={FIXED_MARKS} onClose={closeSheet} beforeClose={() => guard('day')}
          onStep={(i) => swapSheet({ kind: 'step', index: i, section: null })} />
      )}
      <ScriptsModal scripts={scripts} open={sheet?.kind === 'scripts'} initialIndex={sheet?.kind === 'scripts' ? sheet.initialIndex : null} shown={shown} onClose={closeSheet} />
      <NoticeModal steps={steps} updates={updates} open={sheet?.kind === 'notice'} initialIndex={sheet?.kind === 'notice' ? sheet.initialIndex : null} shown={shown} onClose={closeSheet} />
    </>
  );
}
