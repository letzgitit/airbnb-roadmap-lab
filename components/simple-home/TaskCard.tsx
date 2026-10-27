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
import { SOON_DAYS } from '@/components/tasks/task-view';
import { byDue, dateParts, daysBetween, prepareAdd, progressSr, progressText, relDay, type CardDef, type CardSummary } from './home-model';

/**
 * 큰 덩어리 카드 하나: 머리(제목 · 「3개 중 1개 끝」 · 오른쪽에 큰 마감 날짜)를 누르면 펼쳐지고, 펼치면 할 일 목록.
 * 목록 = 첫 줄 「＋ 할 일 추가」 → 안 끝난 일(마감 이른 순, 세부 항목은 부모 밑) → 「끝낸 일 n개」(접음).
 * 할 일 줄은 홈 · 단계 창과 같은 TaskRow(쉬운 모양 simple) — 쓰기는 기존 /api/progress/mutate 그대로(Todoist 동기화도 같은 길).
 */
export function TaskCard({ card, cards, tasks, summary, steps, today, open, onToggleOpen, hero = false, anchorId }: {
  card: CardDef; cards: CardDef[]; tasks: TaskItem[]; summary: CardSummary; steps: StepRef[]; today: string;
  open: boolean; onToggleOpen: () => void;
  /** 달력에서 이 카드로 올 때 찾아 내려오는 id */
  anchorId?: string;
  /** 그 탭에서 가장 급한 카드 하나: 머리를 청록 면(hero) + 흰 글자로(DESIGN.md 2.2 · 8.1.2) */
  hero?: boolean;
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
    <Card as="section" aria-labelledby={`${uid}-t`} id={anchorId} className="scroll-mt-32">
      <h3>
      <button type="button" aria-expanded={open} aria-controls={`${uid}-list`} onClick={onToggleOpen}
        className={`flex w-full items-center gap-3 py-4 pl-4 pr-2 text-left transition-colors ${hero ? 'bg-hero text-on-hero hover:bg-accent-hover' : 'hover:bg-sunken/60'}`}>
        <span className="min-w-0 flex-1">
          {hero && <span className="mb-1 block text-sm font-bold text-hero-sub">가장 급한 일</span>}
          <span id={`${uid}-t`} className={`block text-lg font-bold ${hero ? 'text-on-hero' : 'text-ink'}`}>{card.title}</span>
          {card.sub && <span className={`mt-0.5 block text-sm font-normal ${hero ? 'text-hero-sub' : 'text-ink-soft'}`}>{card.sub}</span>}
          <span className={`mt-1 flex flex-wrap items-center gap-x-3 text-sm font-normal ${hero ? 'text-hero-sub' : 'text-muted'}`}>
            {/* 「일주일 안에 할 일 n개」는 탭 맨 위 같은 이름의 묶음이 말하므로 카드 머리에는 다시 쓰지 않는다 */}
            {/* 진행: 「3/9」 굵고 크게(화면 읽기 프로그램에는 「9개 중 3개 했어요」) */}
            <span className={`text-lg font-bold tabular-nums ${hero ? 'text-on-hero' : 'text-ink'}`} aria-hidden>{progressText(summary)}</span>
            <span className="sr-only">{progressSr(summary)}</span>
          </span>
        </span>
        <Deadline summary={summary} today={today} hero={hero} />
        <span className={`flex size-11 shrink-0 items-center justify-center ${hero ? 'text-on-hero' : 'text-muted'}`} aria-hidden>
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

/** 카드 오른쪽 큰 마감 날짜: 「11/9 (월)」 + 「D-13」(마감이 지났으면 날짜 빨강). 기한 지난 일이 있으면 「기한 지난 일 n개」. 다 끝냈으면 「끝」 */
function Deadline({ summary, today, hero }: { summary: CardSummary; today: string; hero: boolean }) {
  if (summary.finished) {
    return (
      <span className={`flex shrink-0 flex-col items-end ${hero ? 'text-on-hero' : 'text-muted'}`}>
        <i className="fas fa-check text-xl" aria-hidden />
        <span className="text-sm font-bold">다 했어요</span>
      </span>
    );
  }
  // 기한 지난 일이 있으면 날짜 밑 「D-13」 대신 「기한 지난 일 n개」(카드에서 이 한 곳만 빨강으로 말한다).
  // 청록 머리(hero) 위에서는 빨강 글자가 안 읽혀서 흰 글자 + 경고 아이콘.
  // 배지 모양: 청록 머리 위 = 흰 면 + 빨강 글자 + 경고 아이콘, 그 밖 = 빨강 면 + 흰 글자
  const lateLine = summary.late > 0
    ? <span className={`${badgeCls} ${hero ? 'bg-on-hero text-danger' : 'bg-danger text-on-accent'}`}><i className="fas fa-triangle-exclamation mr-1.5" aria-hidden />기한 지난 일 {summary.late}개</span>
    : null;
  if (!summary.deadline) {
    return (
      <span className="flex shrink-0 flex-col items-end text-right">
        <span className={`text-sm font-normal ${hero ? 'text-hero-sub' : 'text-muted'}`}>날짜 미정</span>
        {lateLine}
      </span>
    );
  }
  const { md, wd } = dateParts(summary.deadline);
  const rel = relDay(summary.deadline, today);
  const near = daysBetween(today, summary.deadline) <= SOON_DAYS;
  const dateTone = hero ? 'text-on-hero' : rel.tone === 'late' ? 'text-danger-ink' : 'text-ink';
  // D-n 배지: 청록 머리 위 = 흰 면 + 청록 글자, 그 밖 = 지남 빨강 면 · 3일 안 진한 면 · 그 밖 옅은 회색 면(할 일 줄 배지와 같은 규칙)
  const badge = hero ? 'bg-on-hero text-hero' : rel.tone === 'late' ? 'bg-danger text-on-accent' : near ? 'bg-ink text-surface' : 'bg-sunken text-ink-soft';
  return (
    <span className="flex shrink-0 flex-col items-end gap-1 text-right">
      <span className={`text-[1.875rem] font-bold leading-9 tabular-nums ${dateTone}`}>{md}<span className={`ml-1 text-base font-normal ${hero ? 'text-hero-sub' : 'text-ink-soft'}`}>({wd})</span></span>
      {lateLine ?? <span className={`${badgeCls} ${badge}`}>{rel.text}</span>}
    </span>
  );
}
const badgeCls = 'rounded-control px-2 py-0.5 text-sm font-bold tabular-nums whitespace-nowrap';
