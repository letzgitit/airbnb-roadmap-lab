'use client';

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { TaskItem } from '@/lib/core/types';
import { useProgress } from '@/components/progress/ProgressProvider';
import { TaskComposer, type StepRef } from '@/components/tasks/TaskComposer';
import { TaskRow } from '@/components/tasks/TaskRow';
import { treeRows } from '@/components/tasks/task-view';
import { useEditingSet, useStickyDone } from '@/components/tasks/useTaskList';
import { AddButton } from '@/components/ui/AddButton';
import { Card, cardRowCls } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { byDue, dateParts, prepareAdd, progressText, relDay, type CardDef, type CardSummary } from './home-model';

/**
 * 큰 덩어리 카드 하나: 머리(제목 · 「3개 중 1개 끝」 · 오른쪽에 큰 마감 날짜)를 누르면 펼쳐지고, 펼치면 할 일 목록.
 * 목록 = 첫 줄 「＋ 할 일 추가」 → 안 끝난 일(마감 이른 순, 세부 항목은 부모 밑) → 「끝낸 일 n개」(접음).
 * 할 일 줄은 홈 · 단계 창과 같은 TaskRow(쉬운 모양 simple) — 쓰기는 기존 /api/progress/mutate 그대로(Todoist 동기화도 같은 길).
 */
export function TaskCard({ card, cards, tasks, summary, steps, today, open, onToggleOpen }: {
  card: CardDef; cards: CardDef[]; tasks: TaskItem[]; summary: CardSummary; steps: StepRef[]; today: string;
  open: boolean; onToggleOpen: () => void;
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
    <TaskRow key={r.item.id} t={r.item} steps={steps} listStepId={null} scope="page" inset simple depth={r.depth} parentTitle={r.parentTitle}
      onEditChange={reportEdit} onToggle={onToggle} onGone={() => undefined} />
  );

  return (
    <Card as="section" aria-labelledby={`${uid}-t`}>
      <h3>
      <button type="button" aria-expanded={open} aria-controls={`${uid}-list`} onClick={onToggleOpen}
        className="flex w-full items-center gap-3 py-4 pl-4 pr-2 text-left transition-colors hover:bg-sunken/60">
        <span className="min-w-0 flex-1">
          <span id={`${uid}-t`} className="block text-lg font-bold text-ink">{card.title}</span>
          {card.sub && <span className="mt-0.5 block text-sm font-normal text-ink-soft">{card.sub}</span>}
          <span className="mt-1 flex flex-wrap items-center gap-x-3 text-sm font-normal text-muted">
            <span>{progressText(summary)}</span>
            {summary.late > 0 && <span className="font-bold text-danger-ink">기한 지남 {summary.late}</span>}
            {summary.soon > 0 && <span className="font-bold text-accent-ink">다음 7일 {summary.soon}</span>}
          </span>
        </span>
        <Deadline summary={summary} today={today} />
        <span className="flex size-11 shrink-0 items-center justify-center text-muted" aria-hidden>
          <i className={`fas fa-chevron-down text-sm transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      </h3>
      {open && (
        <ul id={`${uid}-list`} className="border-t border-line">
          <li className={composing ? `${cardRowCls} px-3` : cardRowCls}>
            {composing
              ? <TaskComposer stepId={card.addStep} scope="page" simple prepare={prepare} dirtyKey={`form:add-task:card:${card.id}:${card.addStep}`} onClose={closeComposer} />
              : <AddButton buttonRef={addRef} label="할 일 추가" onClick={() => setComposing(true)} />}
          </li>
          {openRows.length === 0 && (
            <li className={`${cardRowCls} px-4 py-3 text-base text-muted`}>{doneRows.length > 0 ? '남은 할 일이 없어요.' : '아직 할 일이 없어요.'}</li>
          )}
          {openRows.map(row)}
          {doneRows.length > 0 && (
            <li className={cardRowCls}>
              <FoldRow label="끝낸 일" count={doneRows.length} open={showDone} onToggle={() => setShowDone((v) => !v)} controls={`${uid}-done`} />
              {showDone && <ul id={`${uid}-done`} className="border-t border-line">{doneRows.map(row)}</ul>}
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

/** 카드 오른쪽 큰 마감 날짜: 「이날까지」 + 「11/9 (월)」 + 「D-13」(지남 = 빨강, 다음 7일 안 = 강조색). 다 끝냈으면 「끝」 */
function Deadline({ summary, today }: { summary: CardSummary; today: string }) {
  if (summary.finished) {
    return (
      <span className="flex shrink-0 flex-col items-end text-muted">
        <i className="fas fa-check text-xl" aria-hidden />
        <span className="text-sm font-bold">끝</span>
      </span>
    );
  }
  if (!summary.deadline) return <span className="shrink-0 text-sm font-normal text-muted">날짜 미정</span>;
  const { md, wd } = dateParts(summary.deadline);
  const rel = relDay(summary.deadline, today);
  const tone = rel.tone === 'late' ? 'text-danger-ink' : rel.tone === 'soon' ? 'text-accent-ink' : 'text-ink';
  return (
    <span className="flex shrink-0 flex-col items-end text-right">
      <span className="text-sm font-normal text-muted">이날까지</span>
      <span className={`text-2xl font-bold tabular-nums ${tone}`}>{md}<span className="ml-1 text-base font-normal text-ink-soft">({wd})</span></span>
      <span className={`text-sm font-bold ${rel.tone === 'later' ? 'text-ink-soft' : tone}`}>{rel.text}</span>
    </span>
  );
}
