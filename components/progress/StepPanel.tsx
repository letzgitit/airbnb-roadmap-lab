'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { StepStatus, TaskItem } from '@/lib/core/types';
import { shortDate } from '@/lib/client/format';
import { AddButton } from '@/components/ui/AddButton';
import { FoldRow } from '@/components/ui/FoldRow';
import { TaskComposer, type StepRef } from '@/components/tasks/TaskComposer';
import { TaskRow } from '@/components/tasks/TaskRow';
import { useEditingSet, useStickyDone } from '@/components/tasks/useTaskList';
import { treeRows } from '@/components/tasks/task-view';
import { useProgress } from './ProgressProvider';
import {
  AutoTextarea, btnGhost, btnPrimary, composerCls, EditBadge, inputCls, LastEdit, useBusy, useDirty, useEditing, useFormEsc,
} from './bits';

// 진행 상태 세 가지(시작 전 · 진행 중 · 완료)
const STATUS: { v: StepStatus; label: string }[] = [
  { v: 'todo', label: '시작 전' },
  { v: 'doing', label: '진행 중' },
  { v: 'done', label: '완료' },
];

// ───────────────────────── 우리 할 일 ─────────────────────────
// 단계 시트 「할 일」 탭의 우리 할 일: 첫 줄 「＋ 할 일 추가」 → 안 끝난 일(마감 순) → 「끝낸 일 n개」(접힘).
// 줄 모양은 홈 「할 일」과 같은 TaskRow 다(이 단계 안이라 보조 줄에 단계 이름은 없다).
export function StepTasks({ stepId, steps }: { stepId: number; steps: StepRef[] }) {
  const { doc } = useProgress();
  const { editing, reportEdit } = useEditingSet();
  const { isDone, onToggle } = useStickyDone();
  const [showDone, setShowDone] = useState(false);
  const [composing, setComposing] = useState(false);
  const doneId = useId();
  // 줄이 사라진 뒤 포커스가 몸통(body)으로 빠지지 않게 목록 제목으로 돌려보낸다
  const headingRef = useRef<HTMLDivElement>(null);
  const focusHeading = useCallback(() => { window.requestAnimationFrame(() => headingRef.current?.focus()); }, []);
  const addRef = useRef<HTMLButtonElement>(null);
  const closeComposer = useCallback(() => {
    setComposing(false);
    window.requestAnimationFrame(() => addRef.current?.focus());
  }, []);

  if (!doc) return null;

  const all = Object.values(doc.tasks).filter((t) => (t.stepId === stepId && !t.deletedAt) || editing.has(t.id));
  const byDue = (a: TaskItem, b: TaskItem) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt.localeCompare(b.createdAt);
  const open = all.filter((t) => !isDone(t)).sort(byDue);
  const done = all.filter(isDone).sort((a, b) => (b.doneAt ?? b.createdAt).localeCompare(a.doneAt ?? a.createdAt));
  const mine = all.filter((t) => t.stepId === stepId && !t.deletedAt);
  // 끝낸 줄에서 편집 폼이 열려 있으면 접지 않는다(쓰던 글이 사라지지 않게)
  const doneExpanded = showDone || done.some((t) => editing.has(t.id));
  // 세부 항목은 부모 바로 밑에 들여 쓴다(부모가 다른 목록에 있으면 맨 위 층 + 「‘부모’의 세부」)
  const rows = (list: TaskItem[]) => treeRows(list, doc.tasks).map(({ item: t, depth, parentTitle }) => (
    <TaskRow key={t.id} t={t} steps={steps} listStepId={stepId} scope="modal" depth={depth} parentTitle={parentTitle}
      onEditChange={reportEdit} onToggle={onToggle} onGone={focusHeading} />
  ));

  return (
    <section aria-label="우리 할 일">
      <div ref={headingRef} tabIndex={-1} className="mb-1 flex items-baseline justify-between gap-3 outline-none">
        <h3 className="text-lg font-bold text-ink">우리 할 일</h3>
        <span className="text-sm font-normal text-muted">{mine.filter((t) => t.done).length}/{mine.length}</span>
      </div>
      <ul className="border-t border-line">
        <li className="border-b border-line">
          {composing
            ? <TaskComposer stepId={stepId} scope="modal" onClose={closeComposer} />
            : <AddButton buttonRef={addRef} label="할 일 추가" onClick={() => setComposing(true)} />}
        </li>
        {rows(open)}
        {open.length === 0 && editing.size === 0 && (
          <li className="border-b border-line py-3 text-base text-muted">{done.length > 0 ? '남은 할 일이 없어요.' : '아직 할 일이 없어요.'}</li>
        )}
        {done.length > 0 && (
          <li className="border-b border-line [&>button]:px-0">
            <FoldRow label="끝낸 일" count={done.length} open={doneExpanded} onToggle={() => setShowDone((v) => !v)} controls={doneId} />
          </li>
        )}
      </ul>
      {doneExpanded && done.length > 0 && <ul id={doneId}>{rows(done)}</ul>}
    </section>
  );
}

// ───────────────────────── 진행 상태 ─────────────────────────
// 시트 머리 줄의 「● 진행 중 ⌄」 단추(44px): 누르면 세 가지 중 고르는 작은 메뉴(지금 것에 체크).
// 점: 시작 전 = 흐린 점, 진행 중 = 강조색 점, 완료 = 흐린 체크(완료는 초록을 쓰지 않는다).
// 고르면 예전과 같은 step.update(status)를 보내므로 동시에 고친 경우의 충돌 창도 그대로 쓴다.
function StatusMark({ s }: { s: StepStatus }) {
  if (s === 'done') return <i className="fas fa-check w-2.5 shrink-0 text-center text-sm text-muted" aria-hidden />;
  return <span className={`size-2 shrink-0 rounded-full ${s === 'doing' ? 'bg-accent' : 'bg-faint'}`} aria-hidden />;
}

export function StepStatusPill({ stepId }: { stepId: number }) {
  const { doc, send } = useProgress();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const st = doc?.steps[String(stepId)];
  const status: StepStatus = st?.status ?? 'todo';
  const cur = STATUS.find((x) => x.v === status) ?? STATUS[0];

  // 메뉴가 열려 있는 동안: 지금 항목에 포커스, Esc = 메뉴만 닫기(뒤의 시트까지 닫지 않게 먼저 가로챈다)
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!doc) return null;

  const pick = (v: StepStatus) => {
    setOpen(false);
    btnRef.current?.focus();
    if (v === status) return;
    void send({ op: 'step.update', stepId, baseVersion: st?.version ?? 0, patch: { status: v } });
  };
  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    let n = -1;
    if (e.key === 'ArrowDown') n = (i + 1) % items.length;
    else if (e.key === 'ArrowUp') n = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = items.length - 1;
    else if (e.key === 'Tab') { setOpen(false); return; }
    if (n < 0) return;
    e.preventDefault();
    items[n]?.focus();
  };

  return (
    <div className="relative">
      <button ref={btnRef} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={`${uid}-menu`} aria-label={`진행 상태: ${cur.label}`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-control border border-line bg-surface px-3 text-base font-bold text-ink-soft transition-colors hover:bg-sunken">
        <StatusMark s={status} />
        <span>{cur.label}</span>
        <i className="fas fa-chevron-down text-sm text-muted" aria-hidden />
      </button>
      {open && (
        <>
          {/* 바깥을 누르면 메뉴만 닫힌다(투명한 막이 시트 바깥 어두운 막까지 덮어, 시트가 같이 닫히지 않는다) */}
          <div className="fixed inset-0 z-20" aria-hidden onClick={() => setOpen(false)} />
          <div ref={menuRef} id={`${uid}-menu`} role="menu" aria-label="진행 상태" onKeyDown={onMenuKey}
            className="absolute left-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-control border border-line bg-surface py-1 shadow-xl dark:shadow-black/50">
            {STATUS.map((x) => (
              <button key={x.v} type="button" role="menuitemradio" aria-checked={status === x.v} onClick={() => pick(x.v)}
                className={`flex min-h-11 w-full items-center gap-3 px-4 text-left text-base hover:bg-sunken focus-visible:bg-sunken ${status === x.v ? 'font-bold text-ink' : 'font-semibold text-ink-soft'}`}>
                <span className="flex w-2.5 justify-center"><StatusMark s={x.v} /></span>
                <span className="flex-1">{x.label}</span>
                {status === x.v && <i className="fas fa-check text-sm text-ink" aria-hidden />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────── 목표일 · 메모 ─────────────────────────
// 평소에는 접는 줄 하나(FoldRow 모양 + 오른쪽 요약), 누르면 펼쳐진다. 「할 일」 탭 맨 아래에 둔다.
export function StepInfo({ stepId }: { stepId: number }) {
  const { doc, send } = useProgress();
  const uid = useId();
  const st = doc?.steps[String(stepId)];
  const ed = useEditing(`step:${stepId}`);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  // 편집을 연 순간의 version. 저장할 때 이 값으로 보내야 그 사이 상대가 고친 걸 409 로 알아챈다.
  const [base, setBase] = useState(0);
  const [orig, setOrig] = useState({ date: '', note: '' });
  const { busy, run } = useBusy();
  const dirty = ed.open && (date !== orig.date || note !== orig.note);
  useDirty(`form:step:${stepId}`, dirty, 'modal');
  const escStep = useFormEsc(dirty, ed.stop);
  if (!doc) return null;

  // 접힌 줄의 요약: 목표일(있을 때) · 메모 있음(있을 때), 둘 다 없으면 「없음」
  const summary = [st?.targetDate ? shortDate(st.targetDate) : '', st?.note?.trim() ? '메모 있음' : ''].filter(Boolean);
  if (summary.length === 0) summary.push('없음');

  return (
    <section aria-label="목표일 · 메모" className="border-y border-line">
      <button type="button" aria-expanded={open} aria-controls={`${uid}-info`} onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-3 text-left transition-colors hover:bg-sunken">
        <span className="shrink-0 text-base font-semibold text-ink-soft">목표일 · 메모</span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm font-normal text-muted">
          {summary.map((s, k) => <span key={k} className={k === 0 && st?.targetDate ? 'text-ink-soft' : ''}>{s}</span>)}
          <EditBadge k={`step:${stepId}`} />
        </span>
        <i className={`fas fa-chevron-down shrink-0 text-sm text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {/* 접어도 지우지 않는다: 쓰던 메모와 저장 안 한 편집 보호가 끊기지 않게 */}
      <div id={`${uid}-info`} hidden={!open} className="pb-3">
        {!ed.open ? (
          <div className="flex items-start justify-between gap-3 pt-1">
            <dl className="min-w-0 space-y-1 text-base text-ink">
              <div className="flex gap-2"><dt className="shrink-0 text-muted">목표일</dt><dd>{st?.targetDate ?? <span className="text-muted">미정</span>}</dd></div>
              <div className="flex gap-2"><dt className="shrink-0 text-muted">메모</dt><dd className="min-w-0 whitespace-pre-wrap break-words">{st?.note || <span className="text-muted">없음</span>}</dd></div>
            </dl>
            <button type="button" className={btnGhost} onClick={() => {
              const o = { date: st?.targetDate ?? '', note: st?.note ?? '' };
              setDate(o.date); setNote(o.note); setOrig(o); setBase(st?.version ?? 0); ed.start();
            }}>수정</button>
          </div>
        ) : (
          <form className={composerCls} onKeyDown={escStep} onSubmit={(e) => {
            e.preventDefault();
            void run(() => send({ op: 'step.update', stepId, baseVersion: base, patch: { targetDate: date || null, note } }, {
              onSuccess: ed.stop,
              onTakeLatest: (cur) => {
                const o = { date: String(cur.targetDate ?? ''), note: String(cur.note ?? '') };
                setDate(o.date); setNote(o.note); setOrig(o); setBase(Number(cur.version) || 0);
              },
            }));
          }}>
            <label className="block text-sm font-normal text-ink-soft">목표일<input type="date" className={`${inputCls} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="block text-sm font-normal text-ink-soft">메모<AutoTextarea className={`${inputCls} mt-1`} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={ed.stop}>취소</button><button className={btnPrimary} disabled={busy}>저장</button></div>
            <LastEdit by={st?.updatedBy} at={st?.updatedAt} />
          </form>
        )}
      </div>
    </section>
  );
}
