'use client';

import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import type { TaskItem } from '@/lib/core/types';
import { todayStr } from '@/lib/client/format';
import { useProgress } from '@/components/progress/ProgressProvider';
import { TrashCard } from '@/components/progress/TrashCard';
import { AddButton } from '@/components/ui/AddButton';
import { Card, cardRowCls } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { Meta } from '@/components/ui/Meta';
import { TaskComposer, type StepRef } from '@/components/tasks/TaskComposer';
import { TaskRow } from '@/components/tasks/TaskRow';
import { daysUntil, useEditingSet, useStickyDone } from '@/components/tasks/useTaskList';

// 홈 맨 위 「할 일」(로그인했을 때만): 모든 단계의 우리 할 일을 날짜로 묶은 한 목록.
//   첫 줄 「＋ 할 일 추가」(단계 고르기, 기본 = 지금 단계) → 기한 지남 · 오늘 · 7일 안 · 그 뒤 → 「날짜 없음 n개」 · 「끝낸 일 n개」(접힘)
//   기한 지남은 앞 LATE_SHOWN 개만 보이고 나머지는 「기한 지남 n개 더 보기」로 접는다(폰 첫 화면이 기한 지남으로 다 차지 않게).
// 오늘 = 기기 날짜. 빈 묶음은 숨긴다. 묶음 안은 마감 → 단계 → 만든 순.
// 줄은 단계 시트 「우리 할 일」과 같은 TaskRow(보조 줄에 단계 이름이 붙는다). 맨 아래 「삭제한 할 일」.
// 구역 전체를 접는다: 기본은 접힘(새로고침하면 다시 접힘, 기억하지 않음). 접혀도 제목 줄 「할 일」 + 요약 숫자 + 화살표는 보이고,
//   제목 줄 전체가 펼침 단추다. 추가 폼 · 고치는 폼이 열려 있거나 방금 체크한 줄이 제자리를 지키는 동안은 접지 않는다.
type Group = 'late' | 'today' | 'week' | 'later';
const GROUPS: { id: Group; label: string }[] = [
  { id: 'late', label: '기한 지남' },
  { id: 'today', label: '오늘' },
  { id: 'week', label: '7일 안' },
  { id: 'later', label: '그 뒤' },
];

function groupOf(due: string, today: string): Group {
  const d = daysUntil(due, today);
  return d < 0 ? 'late' : d === 0 ? 'today' : d <= 7 ? 'week' : 'later';
}

const LATE_SHOWN = 5;

const byDueStep = (a: TaskItem, b: TaskItem) =>
  (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.stepId - b.stepId || a.createdAt.localeCompare(b.createdAt);

export function TodoSection({ steps, defaultStepId }: { steps: StepRef[]; defaultStepId: number }) {
  const { doc } = useProgress();
  const { editing, reportEdit } = useEditingSet();
  const { isDone, onToggle, hasSticky } = useStickyDone();
  const [showNoDate, setShowNoDate] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [showAllLate, setShowAllLate] = useState(false);
  const [composing, setComposing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const uid = useId();
  // 줄이 사라진 뒤(지우기) 포커스가 몸통으로 빠지지 않게 구역 제목으로 돌려보낸다
  const headingRef = useRef<HTMLDivElement>(null);
  const focusHeading = useCallback(() => { window.requestAnimationFrame(() => headingRef.current?.focus()); }, []);
  const addRef = useRef<HTMLButtonElement>(null);
  const closeComposer = useCallback(() => {
    setComposing(false);
    window.requestAnimationFrame(() => addRef.current?.focus());
  }, []);

  if (!doc) return null;

  const today = todayStr();
  const all = Object.values(doc.tasks).filter((t) => !t.deletedAt || editing.has(t.id));
  const open = all.filter((t) => !isDone(t));
  const done = all.filter(isDone).sort((a, b) => (b.doneAt ?? b.createdAt).localeCompare(a.doneAt ?? a.createdAt));
  const dated: Record<Group, TaskItem[]> = { late: [], today: [], week: [], later: [] };
  const noDate: TaskItem[] = [];
  open.forEach((t) => { if (t.due) dated[groupOf(t.due, today)].push(t); else noDate.push(t); });
  GROUPS.forEach((g) => dated[g.id].sort(byDueStep));
  noDate.sort(byDueStep);

  // 접힌 묶음 안에서 고치는 폼이 열려 있으면 접지 않는다(쓰던 글이 사라지지 않게)
  const noDateOpen = showNoDate || noDate.some((t) => editing.has(t.id));
  const doneOpen = showDone || done.some((t) => editing.has(t.id));
  const lateRest = dated.late.slice(LATE_SHOWN);
  const lateOpen = showAllLate || lateRest.some((t) => editing.has(t.id));

  // 요약 한 줄: 오늘 n / 기한 지남 n(빨강) / 7일 안 n(점 없이 12px 간격) — 0 인 것은 빼고, 다 0 이면 「남은 할 일 n개」
  const parts: ReactNode[] = [];
  if (dated.today.length) parts.push(<span key="t">오늘 {dated.today.length}</span>);
  if (dated.late.length) parts.push(<span key="l" className="text-danger-ink">기한 지남 {dated.late.length}</span>);
  if (dated.week.length) parts.push(<span key="w">7일 안 {dated.week.length}</span>);
  const summary = parts.length
    ? <Meta>{parts}</Meta>
    : open.length ? `남은 할 일 ${open.length}개` : undefined;

  // 요약 줄이 「기한 지남 n」 하나뿐이면 바로 아래 묶음 이름 「기한 지남」은 같은 말이라 그리지 않는다
  const lateOnlyInSummary = parts.length === 1 && dated.late.length > 0;

  const row = (t: TaskItem, quietLate = false) => (
    <TaskRow key={t.id} t={t} steps={steps} listStepId={null} showStep scope="page" inset quietLate={quietLate}
      onEditChange={reportEdit} onToggle={onToggle} onGone={focusHeading} />
  );
  const empty = all.length === 0;
  const busy = composing || editing.size > 0 || hasSticky;
  const isOpen = expanded || busy;

  return (
    <section aria-labelledby={`${uid}-h`}>
      <div ref={headingRef} tabIndex={-1} className={`outline-none ${isOpen ? 'mb-3' : ''}`}>
        <h2 id={`${uid}-h`} className="scroll-mt-20">
          <button type="button" aria-expanded={isOpen} aria-controls={`${uid}-body`}
            onClick={() => { if (!busy) setExpanded((v) => !v); }}
            className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-control px-2 py-1 text-left transition-colors hover:bg-sunken">
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold text-ink">할 일</span>
              {summary && <span className="mt-0.5 block text-sm font-normal text-muted">{summary}</span>}
            </span>
            <i className={`fas fa-chevron-down text-xs text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        </h2>
      </div>
      {isOpen && <div id={`${uid}-body`}>
      <Card>
        <div className={cardRowCls}>
          {composing
            ? <div className="px-3"><TaskComposer stepId={defaultStepId} steps={steps} scope="page" onClose={closeComposer} /></div>
            : <AddButton buttonRef={addRef} label="할 일 추가" onClick={() => setComposing(true)} />}
        </div>
        {empty && <p className={`${cardRowCls} px-4 py-3 text-base text-muted`}>아직 할 일이 없어요.</p>}
        {!empty && open.length === 0 && editing.size === 0 && <p className={`${cardRowCls} px-4 py-3 text-base text-muted`}>남은 할 일이 없어요.</p>}

        {GROUPS.map((g) => {
          const items = dated[g.id];
          if (items.length === 0) return null;
          const isLate = g.id === 'late';
          const hideTitle = isLate && lateOnlyInSummary;
          return (
            <section key={g.id} {...(hideTitle ? { 'aria-label': g.label } : { 'aria-labelledby': `${uid}-${g.id}` })} className={cardRowCls}>
              {!hideTitle && <h3 id={`${uid}-${g.id}`} className={`px-4 pt-3 text-sm font-bold ${isLate ? 'text-danger-ink' : 'text-ink-soft'}`}>{g.label}</h3>}
              <ul>{(isLate ? items.slice(0, LATE_SHOWN) : items).map((t) => row(t, isLate))}</ul>
              {isLate && lateRest.length > 0 && (
                <>
                  <FoldRow label={lateOpen ? '기한 지남 접기' : `기한 지남 ${lateRest.length}개 더 보기`} open={lateOpen}
                    onToggle={() => setShowAllLate((v) => !v)} controls={`${uid}-late-rest`} />
                  {lateOpen && <ul id={`${uid}-late-rest`} className="border-t border-line">{lateRest.map((t) => row(t, true))}</ul>}
                </>
              )}
            </section>
          );
        })}

        {noDate.length > 0 && (
          <div className={cardRowCls}>
            <FoldRow label="날짜 없음" count={noDate.length} open={noDateOpen} onToggle={() => setShowNoDate((v) => !v)} controls={`${uid}-nodate`} />
            {noDateOpen && <ul id={`${uid}-nodate`} className="border-t border-line">{noDate.map((t) => row(t))}</ul>}
          </div>
        )}
        {done.length > 0 && (
          <div className={cardRowCls}>
            <FoldRow label="끝낸 일" count={done.length} open={doneOpen} onToggle={() => setShowDone((v) => !v)} controls={`${uid}-done`} />
            {doneOpen && <ul id={`${uid}-done`} className="border-t border-line">{done.map((t) => row(t))}</ul>}
          </div>
        )}
      </Card>
      <TrashCard kinds={['task']} />
      </div>}
    </section>
  );
}
