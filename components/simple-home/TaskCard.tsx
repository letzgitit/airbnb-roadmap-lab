'use client';

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { TaskItem } from '@/lib/core/types';
import { useProgress } from '@/components/progress/ProgressProvider';
import { TaskComposer, type StepRef } from '@/components/tasks/TaskComposer';
import { TaskRow } from '@/components/tasks/TaskRow';
import { longDate, treeRows, SOON_DAYS } from '@/components/tasks/task-view';
import { useEditingSet, useStickyDone } from '@/components/tasks/useTaskList';
import { AddButton } from '@/components/ui/AddButton';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { btnBrand, btnOutline } from '@/components/ui/buttonCls';
import { cardCls, cardRowCls, softCardCls } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { LineIcon } from '@/components/ui/LineIcon';
import { byDue, daysBetween, prepareAdd, progressSr, progressText, relDay, type CardDef, type CardSummary } from './home-model';

/**
 * 큰 덩어리 카드 하나(시안 B).
 * - 보통 카드: 흰 면 + 1px 테두리 + 20 모서리. 머리(제목 20/600 · 마감 「11월 9일(월)까지」 · 오른쪽 남은 날 배지 + 「1/4」)를 누르면 펼쳐진다.
 * - 가장 급한 카드(hero, 탭마다 하나): 옅은 회색 카드 — 「가장 급한 일」 · 제목 26/700 · 마감 + 배지 · 큰 「1/4」 · 검정 진행 막대 ·
 *   포인트 빨강 「남은 일 보기」(한 화면에 빨강은 이 단추 하나). 펼치면 그 카드 안에 목록, 맨 밑 테두리 단추 「접기」.
 * 목록 = 첫 줄 「＋ 할 일 추가」 → 안 끝난 일(마감 이른 순, 세부 항목은 부모 밑) → 「끝낸 일 n개」(접음).
 * 할 일 줄은 홈 · 단계 창과 같은 TaskRow(쉬운 모양 simple) — 쓰기는 기존 /api/progress/mutate 그대로(Todoist 동기화도 같은 길).
 */
export function TaskCard({ card, cards, tasks, summary, steps, today, open, onToggleOpen, hero = false, anchorId }: {
  card: CardDef; cards: CardDef[]; tasks: TaskItem[]; summary: CardSummary; steps: StepRef[]; today: string;
  open: boolean; onToggleOpen: () => void;
  /** 달력에서 이 카드로 올 때 찾아 내려오는 id */
  anchorId?: string;
  /** 그 탭에서 가장 급한 카드 하나: 옅은 회색 큰 카드 + 빨강 「남은 일 보기」(DESIGN.md 8.1.2) */
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
  // 목록: 카드 안 가로 여백(20) 안쪽에 줄을 둔다. 옅은 카드 위에서는 줄 사이 선을 한 단계 진하게(line-strong)
  const list = open && (
    <ul id={`${uid}-list`} className={`border-t ${hero ? 'mt-5 border-line-strong [&>li]:border-line-strong' : 'mx-5 border-line'}`}>
      <li className={composing ? `${cardRowCls} py-1` : cardRowCls}>
        {composing
          ? <TaskComposer stepId={card.addStep} scope="page" simple prepare={prepare} dirtyKey={`form:add-task:card:${card.id}:${card.addStep}`} onClose={closeComposer} />
          : <span className="-mx-2.5 block"><AddButton buttonRef={addRef} label="할 일 추가" onClick={() => setComposing(true)} /></span>}
      </li>
      {openRows.length === 0 && (
        <li className={`${cardRowCls} py-3.5 text-base text-muted`}>{doneRows.length > 0 ? '남은 할 일이 없어요.' : '아직 할 일이 없어요.'}</li>
      )}
      {openRows.map(row)}
      {doneRows.length > 0 && (
        <li className={cardRowCls}>
          <span className="-mx-4 block"><FoldRow label="끝낸 일" count={doneRows.length} open={showDone} onToggle={() => setShowDone((v) => !v)} controls={`${uid}-done`} /></span>
          {showDone && <ul id={`${uid}-done`} className="border-t border-line">{doneRows.map(row)}</ul>}
        </li>
      )}
    </ul>
  );

  if (hero) {
    const pct = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;
    return (
      <section aria-labelledby={`${uid}-t`} id={anchorId} className={`${softCardCls} scroll-mt-36 px-5 pb-5 pt-5.5`}>
        <p className="text-sm font-semibold text-muted">가장 급한 일</p>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 id={`${uid}-t`} className="mt-1.5 text-title font-bold tracking-[-0.015em] text-ink">{card.title}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-ink-soft">
              {/* 가장 급한 카드는 카드 마감이 아니라 안 끝난 할 일 중 가장 이른 마감(위 「일주일 안에 할 일」과 같은 날)을 보인다 */}
              <span>{summary.nextDue ? `${longDate(summary.nextDue)}까지` : '날짜 미정'}</span>
              <StateBadge summary={summary} today={today} date={summary.nextDue} />
            </p>
          </div>
          {summary.total > 0 && (
            <p className="shrink-0 text-base font-medium text-muted tabular-nums" aria-hidden>
              <b className="text-display font-bold tracking-[-0.02em] text-ink">{summary.done}</b>/{summary.total}
            </p>
          )}
        </div>
        <span className="sr-only">{progressSr(summary)}</span>
        {summary.total > 0 && (
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-track" aria-hidden><div className="h-full bg-ink" style={{ width: `${pct}%` }} /></div>
        )}
        {list}
        {/* 펼치기 단추: 접힌 동안 = 빨강 「남은 일 보기」(한 화면 빨강 한 곳), 펼친 동안 = 테두리 「접기」 */}
        <button type="button" aria-expanded={open} aria-controls={`${uid}-list`} onClick={onToggleOpen}
          className={open ? `${btnOutline} mt-4 w-full` : `${btnBrand} mt-4.5`}>
          {open ? '접기' : summary.finished ? '할 일 보기' : '남은 일 보기'}
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby={`${uid}-t`} id={anchorId} className={`${cardCls} scroll-mt-36`}>
      <h3>
        <button type="button" aria-expanded={open} aria-controls={`${uid}-list`} onClick={onToggleOpen}
          className="flex w-full items-center gap-3 py-4.5 pl-5 pr-3 text-left transition-colors hover:bg-sunken">
          <span className="min-w-0 flex-1">
            <span id={`${uid}-t`} className="block text-xl font-semibold tracking-[-0.01em] text-ink">{card.title}</span>
            {card.sub && <span className="mt-0.5 block text-sm font-normal text-muted">{card.sub}</span>}
            <span className="mt-1.5 block text-base text-ink-soft">{summary.deadline ? `${longDate(summary.deadline)}까지` : '날짜 미정'}</span>
          </span>
          {/* 오른쪽: 상태 배지와 진행 숫자를 한 줄로 */}
          <span className="flex shrink-0 items-center gap-2">
            <StateBadge summary={summary} today={today} date={summary.deadline} />
            <span className={`text-base tabular-nums ${summary.total ? 'font-semibold text-ink' : 'font-normal text-muted'}`} aria-hidden>{progressText(summary)}</span>
            <span className="sr-only">{progressSr(summary)}</span>
          </span>
          <LineIcon name="chevron" className={`size-5 text-faint transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
        </button>
      </h3>
      {list}
      {open && <div className="h-2" aria-hidden />}
    </section>
  );
}

/** 카드 상태 배지 하나: 다 했으면 「다 했어요」, 기한 지난 일이 있으면 「기한 지난 일 n개」(경고), 아니면 date 까지 남은 날(3일 안 주의 · 그 밖 회색) */
function StateBadge({ summary, today, date }: { summary: CardSummary; today: string; date: string | null }) {
  if (summary.finished) return <Badge tone="neutral"><LineIcon name="check" className="size-4" stroke={2.4} />다 했어요</Badge>;
  if (summary.late > 0) return <Badge tone="danger">기한 지난 일 {summary.late}개</Badge>;
  if (!date) return null;
  const rel = relDay(date, today);
  const tone: BadgeTone = rel.tone === 'late' ? 'danger' : daysBetween(today, date) <= SOON_DAYS ? 'warn' : 'neutral';
  return <Badge tone={tone}>{rel.text}</Badge>;
}
