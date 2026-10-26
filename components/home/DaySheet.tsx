'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { TASK_KINDS, type TaskItem, type TaskKind } from '@/lib/core/types';
import { shortDate, todayStr } from '@/lib/client/format';
import { Sheet } from '@/components/Sheet';
import { useProgress } from '@/components/progress/ProgressProvider';
import { TrashCard } from '@/components/progress/TrashCard';
import { AddButton } from '@/components/ui/AddButton';
import { dateCls, textBtn } from '@/components/ui/buttonCls';
import { Card, cardRowCls } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { LoginGate } from '@/components/ui/LoginGate';
import { Segmented } from '@/components/ui/Segmented';
import { TYPE_COLOR } from '@/components/TimelineChart';
import { TaskComposer, type StepRef, type TaskWithNote } from '@/components/tasks/TaskComposer';
import { TaskRow } from '@/components/tasks/TaskRow';
import { useEditingSet, useStickyDone } from '@/components/tasks/useTaskList';
import { ShiftDates } from './ShiftDates';
import { diffDays, pinsOf, stepRanges, toDate, type Pin, type TimelineStep } from './step-dates';

// 고른 날의 할 일 창(#day-2026-10-27). 홈 타임라인에서 날짜(7일 줄 · 날짜 축)를 누르면 단계 창과 같은 시트로 뜬다.
//   머리: 「10/27 (화)」 + 「오늘」/「D-3」/「2일 전」 + 그날 고정 일정 · 오른쪽 「일정 옮기기」
//   담당 걸러 보기(전체 · 남편 · 아내, 「같이」는 둘 다) + 종류 걸러 보기(0개인 종류는 꺼 둠)
//   ＋ 할 일 추가(마감일 = 그날) / 「기한 지남」(어느 날을 열어도 늘 맨 위) / 단계 머리 + 그날 마감 할 일(단계 번호 순, 그날 기간이
//   겹치는 단계는 할 일이 없어도 머리만. 머리를 누르면 그 단계 창으로 바뀐다) / 「날짜 없음 n개」(접음) / 「삭제한 할 일」
// 할 일 줄은 단계 창 「우리 할 일」과 같은 TaskRow. 고치는 폼의 「쓰던 글」 범위는 시트(modal)라 닫을 때 확인 창이 뜬다.
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const colorOf = (type: string) => (TYPE_COLOR as Record<string, string>)[type] ?? 'var(--prep-bar)';
const byDue = (a: TaskItem, b: TaskItem) =>
  (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.stepId - b.stepId || a.createdAt.localeCompare(b.createdAt);
type OwnerFilter = '' | '남편' | '아내';

export function DaySheet({ date, open, shown, steps, currentId, fixedDay0, marks = [], onClose, beforeClose, onStep }: {
  date: string; open: boolean; shown: boolean;
  steps: TimelineStep[]; currentId: number | null; fixedDay0?: string; marks?: Pin[];
  onClose: () => void; beforeClose: () => Promise<boolean>;
  /** 단계 창으로 바꾸기(steps 배열의 순번) */
  onStep: (index: number) => void;
}) {
  const sel = date;
  const today = todayStr();
  const selDate = toDate(sel);
  const gap = diffDays(today, sel);
  const rel = gap === 0 ? '오늘' : gap > 0 ? `D-${gap}` : `${-gap}일 전`;
  const { doc } = useProgress();
  const dayPins = pinsOf(doc, marks).filter((p) => p.date === sel);
  return (
    <Sheet open={open} shown={shown} onClose={onClose} beforeClose={beforeClose}
      eyebrow={<span className={`text-sm ${gap === 0 ? 'font-bold text-accent-ink' : 'font-normal text-muted'}`}>{rel}</span>}
      title={`${shortDate(sel)} (${DOW[selDate.getDay()]})`}
      subtitle={dayPins.length ? <span className="text-sm font-normal text-ink-soft">{dayPins.map((p) => <span key={p.label} className="mr-3"><i className="fas fa-thumbtack mr-1.5" aria-hidden />{p.label}</span>)}</span> : undefined}>
      <LoginGate>
        {/* 날짜가 바뀌면 걸러 보기 · 펼침 · 입력 폼을 처음 상태로 */}
        <DayBody key={sel} sel={sel} steps={steps} currentId={currentId} fixedDay0={fixedDay0} onStep={onStep} />
      </LoginGate>
    </Sheet>
  );
}

function DayBody({ sel, steps, currentId, fixedDay0, onStep }: {
  sel: string; steps: TimelineStep[]; currentId: number | null; fixedDay0?: string; onStep: (index: number) => void;
}) {
  const { doc } = useProgress();
  const uid = useId();
  const { editing, reportEdit } = useEditingSet();
  const { isDone, onToggle } = useStickyDone();
  const [kindF, setKindF] = useState<TaskKind | ''>('');
  const [ownerF, setOwnerF] = useState<OwnerFilter>('');
  const [composing, setComposing] = useState(false);
  const [shifting, setShifting] = useState(false);
  const [showNoDate, setShowNoDate] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);
  const focusTop = useCallback(() => { window.requestAnimationFrame(() => headingRef.current?.focus()); }, []);
  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; }, [doc]);
  const getDoc = useCallback(() => docRef.current, []);
  if (!doc) return null;

  const today = todayStr();
  const tasks = Object.values(doc.tasks).filter((t) => !t.deletedAt || editing.has(t.id)) as TaskWithNote[];
  const ranges = stepRanges(steps, doc, today, fixedDay0);
  const open = tasks.filter((t) => !isDone(t));
  const pass = (t: TaskWithNote) => (!kindF || t.kind === kindF) && (!ownerF || t.owner === ownerF || t.owner === '같이');
  const filtered = !!kindF || !!ownerF;
  const late = open.filter((t) => t.due && t.due < today && pass(t)).sort(byDue);
  const lateIds = new Set(late.map((t) => t.id));
  const onDay = tasks.filter((t) => t.due === sel && !lateIds.has(t.id) && pass(t)).sort(byDue);
  const active = ranges.filter((r) => r.from <= sel && sel <= r.to).map((r) => r.id);
  const groupIds = [...new Set([...active, ...onDay.map((t) => t.stepId)])].sort((a, b) => a - b)
    .filter((id) => !filtered || onDay.some((t) => t.stepId === id));
  const noDate = open.filter((t) => !t.due && pass(t)).sort(byDue);
  const noDateOpen = showNoDate || noDate.some((t) => editing.has(t.id));
  const kindCount = new Map<TaskKind, number>();
  tasks.forEach((t) => { if (t.kind) kindCount.set(t.kind, (kindCount.get(t.kind) ?? 0) + 1); });

  const stepRefs: StepRef[] = steps.map((s) => ({ id: s.id, title: s.title }));
  const indexOf = (id: number) => steps.findIndex((s) => s.id === id);
  const titleOf = (id: number) => steps.find((s) => s.id === id)?.title ?? '';
  const typeOf = (id: number) => steps.find((s) => s.id === id)?.type ?? '';
  const row = (t: TaskItem, showStep = false) => (
    <TaskRow key={t.id} t={t} steps={stepRefs} listStepId={null} showStep={showStep} scope="modal" inset
      quietLate={lateIds.has(t.id)} onEditChange={reportEdit} onToggle={onToggle} onGone={focusTop} />
  );
  const defaultStep = groupIds[0] ?? currentId ?? steps[0]?.id ?? 1;

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div ref={headingRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
        <div className="flex items-center justify-end">
          {!shifting && <button type="button" className={`${textBtn} mx-0`} onClick={() => { setShifting(true); setComposing(false); }}>일정 옮기기</button>}
        </div>
        {shifting && <ShiftDates from={sel} titleOf={titleOf} getDoc={getDoc} onClose={() => setShifting(false)} />}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-48 flex-1">
            <Segmented label="담당으로 걸러 보기" value={ownerF} onChange={setOwnerF}
              options={[{ value: '', label: '전체' }, { value: '남편', label: '남편' }, { value: '아내', label: '아내' }]} />
          </div>
          <label className="flex items-center gap-2 text-sm font-normal text-ink-soft">종류
            <select className={dateCls} value={kindF} onChange={(e) => setKindF(e.target.value as TaskKind | '')} aria-label="종류로 걸러 보기">
              <option value="">전체</option>
              {TASK_KINDS.map((k) => { const n = kindCount.get(k) ?? 0; return <option key={k} value={k} disabled={n === 0}>{n ? `${k} ${n}` : k}</option>; })}
            </select>
          </label>
        </div>
      </div>
      <Card>
        <div className={cardRowCls}>
          {composing
            ? <div className="px-3"><TaskComposer stepId={defaultStep} steps={stepRefs} scope="modal" initialDue={sel} onClose={() => setComposing(false)} /></div>
            : <AddButton label="할 일 추가" onClick={() => { setComposing(true); setShifting(false); }} />}
        </div>
        {late.length > 0 && (
          <section aria-labelledby={`${uid}-late`} className={cardRowCls}>
            <h3 id={`${uid}-late`} className="px-4 pt-3 text-sm font-bold text-danger-ink">기한 지남</h3>
            {/* 바로 아래 같은 단계 머리가 있으면 단계 이름은 빼고 */}
            <ul>{late.map((t) => row(t, !groupIds.includes(t.stepId)))}</ul>
          </section>
        )}
        {groupIds.map((id) => {
          const items = onDay.filter((t) => t.stepId === id);
          return (
            <section key={id} aria-labelledby={`${uid}-g${id}`} className={cardRowCls}>
              <h3 id={`${uid}-g${id}`}>
                <button type="button" onClick={() => onStep(indexOf(id))}
                  className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm font-bold text-ink-soft transition-colors hover:bg-sunken focus-visible:-outline-offset-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(typeOf(id)) }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{id}단계 {titleOf(id)}</span>
                  <i className="fas fa-chevron-right text-xs text-muted" aria-hidden />
                </button>
              </h3>
              {items.length > 0 && <ul>{items.map((t) => row(t))}</ul>}
            </section>
          );
        })}
        {late.length === 0 && groupIds.length === 0 && <p className={`${cardRowCls} px-4 py-3 text-base text-muted`}>이날은 할 일이 없어요.</p>}
        {noDate.length > 0 && (
          <div className={cardRowCls}>
            <FoldRow label="날짜 없음" count={noDate.length} open={noDateOpen} onToggle={() => setShowNoDate((v) => !v)} controls={`${uid}-nodate`} />
            {noDateOpen && <ul id={`${uid}-nodate`} className="border-t border-line">{noDate.map((t) => row(t, true))}</ul>}
          </div>
        )}
      </Card>
      <TrashCard kinds={['task']} />
    </div>
  );
}
