'use client';

import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TaskItem } from '@/lib/core/types';
import { useProgress } from '@/components/progress/ProgressProvider';
import { TaskComposer, type StepRef } from '@/components/tasks/TaskComposer';
import { TaskRow } from '@/components/tasks/TaskRow';
import { longDate, treeRows, SOON_DAYS } from '@/components/tasks/task-view';
import { useEditingSet, useStickyDone } from '@/components/tasks/useTaskList';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { FoldRow } from '@/components/ui/FoldRow';
import { LineIcon } from '@/components/ui/LineIcon';
import { byDue, daysBetween, prepareAdd, progressSr, progressText, relDay, type CardDef, type CardSummary } from './home-model';

/** 블록 틀(데일리 .sec): 흰 면, 폰은 화면 끝까지 · 넓은 화면은 1px 선 테두리. 블록 사이는 바탕 회색 8px(부모의 gap-2) */
export const blockCls = 'bg-surface md:border md:border-line';

/**
 * 블록 머리(데일리 .sec-h): 52px 줄, 제목 19/800 + 글자 밑 짧은 형광 밑줄(다크는 22/700 · 밑줄 없음). 오른쪽에 메타(13) · 꼬리표.
 * 좁아서 한 줄에 안 들어가면 오른쪽 메타가 제목 밑 줄로 내려간다.
 */
export function BlockHead({ id, title, count, right }: { id?: string; title: ReactNode; count?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex min-h-13 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-5 py-2.5">
      <h2 id={id} className="flex min-w-0 items-baseline gap-2 text-head font-extrabold tracking-[-0.01875rem] text-ink dark:text-2xl dark:font-bold">
        <span className="head-mark min-w-0">{title}</span>
        {count != null && <small className="shrink-0 text-meta font-normal tracking-normal text-muted tabular-nums">{count}</small>}
      </h2>
      {right && <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap text-meta text-muted">{right}</div>}
    </div>
  );
}

/**
 * 일터 탭(행정 · 설비 · 운영)의 단계 블록 하나(기획 27의 3절 — 예전 「카드」).
 * 머리 = 제목(형광 밑줄) + 오른쪽 「11월 9일(월)까지」 · 꼬리표(D-12 · 기한 지남 n · 완료) · 「2/7」. 설명 글은 한 줄만.
 * 몸통 = 안 끝난 할 일 줄(마감 이른 순, 세부 항목은 부모 밑) → 「완료 n」(접음) → 맨 아래 단추 줄 「＋ 할 일」(메모 · 사진 단추는 다음 단계에 이 줄에 더한다).
 * 빈 블록에 「할 일 없음」 같은 글은 쓰지 않는다 — 단추 줄만 보인다.
 * 할 일 줄은 TaskRow 쉬운 모양(simple) — 쓰기는 기존 /api/progress/mutate 그대로(Todoist 동기화도 같은 길).
 */
export function StepBlock({ card, cards, title, tasks, summary, steps, today }: {
  card: CardDef; cards: CardDef[]; title: string; tasks: TaskItem[]; summary: CardSummary; steps: StepRef[]; today: string;
}) {
  const { doc } = useProgress();
  const uid = useId();
  const { isDone, onToggle } = useStickyDone();
  const { editing, reportEdit } = useEditingSet();
  const [composing, setComposing] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const closeComposer = useCallback(() => { setComposing(false); window.requestAnimationFrame(() => addRef.current?.focus()); }, []);
  const all = useMemo(() => doc?.tasks ?? {}, [doc]);

  const openRows = useMemo(() => treeRows(tasks.filter((t) => !isDone(t) || editing.has(t.id)).sort(byDue), all), [tasks, isDone, editing, all]);
  const doneRows = useMemo(() => treeRows(tasks.filter((t) => isDone(t) && !editing.has(t.id)).sort(byDue), all), [tasks, isDone, editing, all]);
  const prepare = useMemo(() => (card.match ? (text: string, kind: Parameters<typeof prepareAdd>[3]) => prepareAdd(cards, card, text, kind) : undefined), [card, cards]);

  const row = (r: (typeof openRows)[number]) => (
    <TaskRow key={r.item.id} t={r.item} steps={steps} listStepId={null} scope="page" simple depth={r.depth} parentTitle={r.parentTitle}
      onEditChange={reportEdit} onToggle={onToggle} onGone={() => undefined} />
  );
  const progress = progressText(summary);

  return (
    <section aria-labelledby={`${uid}-t`} className={blockCls}>
      <BlockHead id={`${uid}-t`} title={title} right={(
        <>
          {summary.deadline && <span className="tabular-nums">{longDate(summary.deadline)}까지</span>}
          <StateBadge summary={summary} today={today} date={summary.deadline} />
          {progress && <span className="font-semibold text-ink-soft tabular-nums" aria-hidden>{progress}</span>}
          {progress && <span className="sr-only">{progressSr(summary)}</span>}
        </>
      )} />
      {card.sub && <p className="-mt-1.5 truncate px-5 pb-2.5 text-sm text-sub">{card.sub}</p>}
      {openRows.length > 0 && <ul className="border-t border-line px-5">{openRows.map(row)}</ul>}
      {doneRows.length > 0 && (
        <div className="border-t border-line">
          <span className="block px-1"><FoldRow label="완료" count={doneRows.length} unit="" open={showDone} onToggle={() => setShowDone((v) => !v)} controls={`${uid}-done`} /></span>
          {showDone && <ul id={`${uid}-done`} className="border-t border-line px-5">{doneRows.map(row)}</ul>}
        </div>
      )}
      {/* 맨 아래 단추 줄: 「＋ 할 일」(누르면 그 자리에 폼). 다음 단계에 「＋ 메모 · ＋ 사진」이 같은 줄에 붙는다 */}
      <div className="border-t border-line">
        {composing ? (
          <div className="px-3 pb-1">
            <TaskComposer stepId={card.addStep} scope="page" simple prepare={prepare} dirtyKey={`form:add-task:card:${card.id}:${card.addStep}`} onClose={closeComposer} />
          </div>
        ) : (
          <div className="flex items-center px-2">
            <button ref={addRef} type="button" onClick={() => setComposing(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-cta font-bold text-ink transition-colors hover:bg-sunken">
              <LineIcon name="plus" className="size-4.5" stroke={2.2} />할 일
              <span className="sr-only">: {title}에 더하기</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/** 블록 꼬리표 하나: 다 했으면 「완료」, 기한 지난 일이 있으면 「기한 지남 n」(위험), 아니면 date 까지 남은 날(3일 안 주의 · 그 밖 회색) */
function StateBadge({ summary, today, date }: { summary: CardSummary; today: string; date: string | null }) {
  if (summary.finished) return <Badge tone="neutral">완료</Badge>;
  if (summary.late > 0) return <Badge tone="danger">기한 지남 {summary.late}</Badge>;
  if (!date) return null;
  const rel = relDay(date, today);
  const tone: BadgeTone = rel.tone === 'late' ? 'danger' : daysBetween(today, date) <= SOON_DAYS ? 'warn' : 'neutral';
  return <Badge tone={tone}>{rel.text}</Badge>;
}
