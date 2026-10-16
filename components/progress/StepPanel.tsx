'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { StepStatus, TaskItem } from '@/lib/core/types';
import { STEP_COUNT } from '@/lib/core/types';
import { dueLabel, shortDate, todayStr } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import {
  AddRow, AutoTextarea, btnGhost, btnPrimary, dateCls, EditBadge, enterSubmit, inputCls, LastEdit, leadCls, oneLine, rowCls, rowText, textBtn,
  TRASH_NOTE, TrashButton, useBusy, useDirty, useEditing, useFormEsc,
} from './bits';

// 진행 상태 세 가지(시작 전 · 진행 중 · 완료)
const STATUS: { v: StepStatus; label: string }[] = [
  { v: 'todo', label: '시작 전' },
  { v: 'doing', label: '진행 중' },
  { v: 'done', label: '완료' },
];

const STICKY_MS = 8000; // 방금 체크한 줄이 제자리를 지키는 시간(되돌리기 알림과 같은 길이)

interface StepRef { id: number; title: string }

// ───────────────────────── 우리 할 일 ─────────────────────────
// 단계 창 「할 일」 탭의 우리 할 일. 안 끝난 일만 목록에 두고, 완료한 일은 맨 끝의 「완료한 일 n개」 안에 접어 둔다.
export function StepTasks({ stepId, steps }: { stepId: number; steps: StepRef[] }) {
  const { doc } = useProgress();
  // 편집 폼이 열려 있는 할 일 id: 상대가 그 사이 지우거나 옮겨도 폼을 지우지 않고 그대로 둔다
  const [editing, setEditing] = useState<Set<string>>(() => new Set());
  const reportEdit = useCallback((id: string, open: boolean) => {
    setEditing((s) => {
      if (open === s.has(id)) return s;
      const n = new Set(s);
      if (open) n.add(id); else n.delete(id);
      return n;
    });
  }, []);
  // 방금 체크·해제한 줄(id → 토글 직전 done): 알림 시간 동안은 직전 값 기준으로 줄을 세워 자리가 안 바뀐다
  const [sticky, setSticky] = useState<Record<string, boolean>>({});
  const stickyTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const m = stickyTimers.current;
    return () => { m.forEach((t) => clearTimeout(t)); m.clear(); };
  }, []);
  const onToggle = useCallback((t: TaskItem) => {
    setSticky((s) => (t.id in s ? s : { ...s, [t.id]: t.done }));
    const old = stickyTimers.current.get(t.id);
    if (old) clearTimeout(old);
    stickyTimers.current.set(t.id, setTimeout(() => {
      stickyTimers.current.delete(t.id);
      setSticky((s) => { if (!(t.id in s)) return s; const n = { ...s }; delete n[t.id]; return n; });
    }, STICKY_MS));
  }, []);
  const [showDone, setShowDone] = useState(false);
  const [composing, setComposing] = useState(false);
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
  const isDone = (t: TaskItem) => sticky[t.id] ?? t.done;
  const byDue = (a: TaskItem, b: TaskItem) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt.localeCompare(b.createdAt);
  const open = all.filter((t) => !isDone(t)).sort(byDue);
  const done = all.filter(isDone).sort((a, b) => (b.doneAt ?? b.createdAt).localeCompare(a.doneAt ?? a.createdAt));
  const mine = all.filter((t) => t.stepId === stepId && !t.deletedAt);
  // 끝낸 줄에서 편집 폼이 열려 있으면 접지 않는다(쓰던 글이 사라지지 않게)
  const doneExpanded = showDone || done.some((t) => editing.has(t.id));
  const row = (t: TaskItem) => <TaskRow key={t.id} t={t} steps={steps} panelStepId={stepId} onEditChange={reportEdit} onToggle={onToggle} onGone={focusHeading} />;

  return (
    <section aria-label="우리 할 일">
      <div ref={headingRef} tabIndex={-1} className="mb-1 flex items-baseline justify-between gap-3 outline-none">
        <h3 className="text-[15px] font-bold text-slate-700">우리 할 일</h3>
        <span className="text-[13px] font-semibold text-slate-500">{mine.filter((t) => t.done).length}/{mine.length}</span>
      </div>
      <ul>
        {open.map(row)}
        {open.length === 0 && editing.size === 0 && (
          <li className="py-2 text-[15px] font-semibold text-slate-500">{done.length > 0 ? '남은 할 일이 없어요.' : '아직 할 일이 없어요.'}</li>
        )}
        <li className={rowCls}>
          {composing
            ? <TaskComposer stepId={stepId} onClose={closeComposer} />
            : <AddRow buttonRef={addRef} label="할 일 추가" onClick={() => setComposing(true)} />}
        </li>
        {done.length > 0 && (
          <li className={rowCls}>
            <button type="button" aria-expanded={doneExpanded} onClick={() => setShowDone((v) => !v)}
              className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-[15px] font-semibold text-slate-600 hover:bg-slate-50">
              <span>완료한 일 {done.length}개</span>
              <i className={`fas ${doneExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} shrink-0 text-[12px] text-slate-500`} aria-hidden />
            </button>
          </li>
        )}
        {doneExpanded && done.map(row)}
      </ul>
    </section>
  );
}

// 새 할 일 입력: 「＋ 할 일 추가」를 누르면 그 자리에서 펼쳐진다. Enter = 추가, Esc = 취소(쓰던 글이 있으면 확인).
function TaskComposer({ stepId, onClose }: { stepId: number; onClose: () => void }) {
  const { send } = useProgress();
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const { busy, run } = useBusy();
  const dirty = text.trim() !== '' || due !== '';
  useDirty(`form:add-task:${stepId}`, dirty, 'modal');
  const esc = useFormEsc(dirty, onClose);
  return (
    <form className="my-2 w-full space-y-2 rounded-xl border border-slate-300 bg-slate-50 p-3" onKeyDown={esc} onSubmit={(e) => {
      e.preventDefault();
      if (!text.trim()) return;
      void run(() => send({ op: 'task.add', stepId, text, due: due || null }, { onSuccess: () => { setText(''); setDue(''); onClose(); } }));
    }}>
      <AutoTextarea className={inputCls} value={text} maxLength={200} autoFocus aria-label="새 할 일" placeholder="할 일을 적어 주세요"
        onChange={(e) => setText(oneLine(e.target.value))} onKeyDown={enterSubmit} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex items-center gap-2 text-[13px] font-bold text-slate-600">마감일
          <input type="date" className={dateCls} value={due} onChange={(e) => setDue(e.target.value)} aria-label="마감일" />
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>취소</button>
          <button className={btnPrimary} disabled={busy || !text.trim()}>추가</button>
        </div>
      </div>
    </form>
  );
}

// 할 일 한 줄: [체크 44px] [글 + 마감 한 줄] [휴지통 44px]. 글을 누르면 그 자리에서 편집 폼이 열린다.
// 삭제는 줄 끝의 휴지통 → 확인 창 → 지움(+ 8초 되돌리기 알림). 편집 폼 안에는 삭제 단추가 없다.
function TaskRow({ t, steps, panelStepId, onEditChange, onToggle, onGone }: {
  t: TaskItem; steps: StepRef[]; panelStepId: number;
  onEditChange: (id: string, open: boolean) => void; onToggle: (t: TaskItem) => void; onGone: () => void;
}) {
  const { send, toast, confirm } = useProgress();
  const ed = useEditing(`task:${t.id}`);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [sid, setSid] = useState(t.stepId);
  const [moveOpen, setMoveOpen] = useState(false);
  const [base, setBase] = useState(t.version);
  const [orig, setOrig] = useState({ text: '', due: '', sid: t.stepId });
  const { busy, run } = useBusy();
  const textBtnRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const dl = dueLabel(t.due, todayStr());
  const dirty = ed.open && (text !== orig.text || due !== orig.due || sid !== orig.sid);
  useDirty(`form:task:${t.id}`, dirty, 'modal');
  const esc = useFormEsc(dirty, ed.stop);
  const deleted = !!t.deletedAt;
  // 내가 저장하는 동안(내가 옮기는 중일 때)엔 「다른 사람이 옮겼어요」 안내를 띄우지 않는다
  const moved = !deleted && !busy && t.stepId !== panelStepId;

  // 목록(StepTasks)에 「이 줄은 편집 중」을 알려, 상대가 지우거나 옮겨도 폼이 사라지지 않게 한다
  useEffect(() => { onEditChange(t.id, ed.open); }, [ed.open, t.id, onEditChange]);
  useEffect(() => () => onEditChange(t.id, false), [t.id, onEditChange]);
  // 폼을 닫으면(저장 · 취소) 다시 생긴 글 단추로 포커스를 돌린다
  const stays = !deleted && t.stepId === panelStepId; // 이 목록에 계속 남는 줄인가
  useEffect(() => {
    if (wasOpen.current && !ed.open && stays) textBtnRef.current?.focus();
    wasOpen.current = ed.open;
  }, [ed.open, stays]);

  const del = async () => {
    const ok = await confirm({ title: '이 할 일을 지울까요?', body: t.text, note: TRASH_NOTE, confirmLabel: '삭제', cancelLabel: '취소', danger: true });
    if (!ok) return;
    void send({ op: 'task.delete', id: t.id }).then((r) => {
      if (r.ok) toast('할 일을 삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'task.restore', id: t.id }) } });
    });
    onGone();
  };
  // 상대가 지운 글을 내 폼 내용 그대로 새 할 일로 올린다
  const saveAsNew = () => run(() => send({ op: 'task.add', stepId: panelStepId, text, due: due || null }, {
    onSuccess: () => { ed.stop(); onGone(); },
  }));

  if (ed.open) {
    return (
      <li className="my-2 rounded-xl border border-slate-300 bg-slate-50 p-3">
        {deleted && <p role="alert" className="mb-2 text-[15px] font-bold text-slate-800">다른 사람이 이 할 일을 삭제했어요.</p>}
        {moved && <p role="status" className="mb-2 text-[15px] font-bold text-slate-800">다른 사람이 {t.stepId}단계로 옮겼어요.</p>}
        <form className="space-y-2" onKeyDown={esc} onSubmit={(e) => {
          e.preventDefault();
          if (deleted) { if (text.trim()) void saveAsNew(); return; }
          const leaving = sid !== panelStepId; // 다른 단계로 옮겨 저장하면 이 목록에서 줄이 사라진다
          void run(() => send({ op: 'task.update', id: t.id, baseVersion: base, patch: { text, due: due || null, stepId: sid } }, {
            onSuccess: () => { ed.stop(); if (leaving) onGone(); },
            onTakeLatest: (cur) => {
              const o = { text: String(cur.text ?? ''), due: String(cur.due ?? ''), sid: typeof cur.stepId === 'number' ? cur.stepId : sid };
              setText(o.text); setDue(o.due); setSid(o.sid); setOrig(o);
              setBase(Number(cur.version) || 0);
            },
          }));
        }}>
          {/* 긴 할 일도 다 보이게 글 길이에 맞춰 늘어나는 칸. Enter 로 저장(한 줄 글이라 줄바꿈은 넣지 않는다), Esc 는 취소 */}
          <AutoTextarea className={inputCls} rows={2} value={text} maxLength={200} autoFocus aria-label="할 일 내용"
            onChange={(e) => setText(oneLine(e.target.value))} onKeyDown={enterSubmit} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label className="flex items-center gap-2 text-[13px] font-bold text-slate-600">마감일
              <input type="date" className={dateCls} value={due} onChange={(e) => setDue(e.target.value)} aria-label="마감일" />
            </label>
            {!deleted && !moveOpen && <button type="button" className={`${textBtn} ml-auto`} onClick={() => setMoveOpen(true)}>다른 단계로 옮기기</button>}
          </div>
          {!deleted && moveOpen && (
            <select className={inputCls} value={sid} onChange={(e) => setSid(Number(e.target.value))} aria-label="단계 이동">
              {steps.slice(0, STEP_COUNT).map((s) => <option key={s.id} value={s.id}>{s.id}. {s.title}</option>)}
            </select>
          )}
          {deleted ? (
            <div className="flex items-center justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => { ed.stop(); onGone(); }}>닫기</button>
              <button type="button" className={btnPrimary} disabled={busy || !text.trim()} onClick={() => void saveAsNew()}>새 할 일로 저장</button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <button type="button" className={btnGhost} onClick={ed.stop}>취소</button>
              <button className={btnPrimary} disabled={busy}>저장</button>
            </div>
          )}
          {!deleted && <LastEdit by={t.updatedBy} at={t.updatedAt} />}
        </form>
      </li>
    );
  }

  return (
    <li className={rowCls}>
      <label className={`${leadCls} cursor-pointer`}>
        <input type="checkbox" className="h-5 w-5 cursor-pointer accent-[#155dfc]" checked={t.done} aria-label={`${t.text} 완료`}
          onChange={(e) => { onToggle(t); void send({ op: 'task.update', id: t.id, patch: { done: e.target.checked } }); }} />
      </label>
      <button ref={textBtnRef} type="button" aria-label={`${t.text} 수정`} className="min-w-0 flex-1 py-3 text-left"
        onClick={() => {
          const o = { text: t.text, due: t.due ?? '', sid: t.stepId };
          setText(o.text); setDue(o.due); setSid(o.sid); setOrig(o); setBase(t.version); setMoveOpen(false); ed.start();
        }}>
        <span className={`line-clamp-2 ${rowText} ${t.done ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{t.text}</span>
        {/* 보조 줄은 마감일 하나뿐(+ 상대가 편집 중일 때의 표시). 둘 다 없으면 줄 자체가 없다 */}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 empty:hidden">
          {dl && (
            <span className={`inline-flex gap-x-2 text-[13px] font-semibold ${dl.late && !t.done ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>
              <span><i className="far fa-calendar mr-1" aria-hidden />{dl.date}</span><span>{dl.rel}</span>
            </span>
          )}
          <EditBadge k={`task:${t.id}`} />
        </span>
      </button>
      <TrashButton label={`${t.text} 삭제`} onClick={() => void del()} />
    </li>
  );
}

// ───────────────────────── 진행 상태 ─────────────────────────
// 시트 머리글의 「● 진행 중 ⌄」 알약: 누르면 세 가지 중 고르는 작은 메뉴(현재 것에 체크, 44px 줄).
// 탭 막대처럼 보이지 않게 알약 모양 + 작은 색 점(시작 전 회색 · 진행 중 파랑 · 완료 초록).
// 고르면 예전과 같은 step.update(status)를 보내므로 동시에 고친 경우의 충돌 창도 그대로 쓴다.
const STATUS_DOT: Record<StepStatus, string> = { todo: 'bg-slate-400', doing: 'bg-blue-600', done: 'bg-emerald-600' };

export function StepStatusPill({ stepId }: { stepId: number }) {
  const { doc, send } = useProgress();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const st = doc?.steps[String(stepId)];
  const status: StepStatus = st?.status ?? 'todo';
  const cur = STATUS.find((x) => x.v === status) ?? STATUS[0];

  // 메뉴가 열려 있는 동안: 현재 항목에 포커스, Esc = 메뉴만 닫기(뒤의 시트까지 닫지 않게 먼저 가로챈다)
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
    <div className="relative -my-1">
      <button ref={btnRef} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={`${uid}-menu`} aria-label={`진행 상태: ${cur.label}`}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white pl-2.5 pr-2.5 text-[13px] font-bold text-slate-700 hover:bg-slate-50 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']">
        <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
        <span>{cur.label}</span>
        <i className="fas fa-chevron-down text-[10px] text-slate-500" aria-hidden />
      </button>
      {open && (
        <>
          {/* 바깥을 누르면 메뉴만 닫힌다(투명한 막이 시트 바깥 어두운 막까지 덮어, 시트가 같이 닫히지 않는다) */}
          <div className="fixed inset-0 z-20" aria-hidden onClick={() => setOpen(false)} />
          <div ref={menuRef} id={`${uid}-menu`} role="menu" aria-label="진행 상태" onKeyDown={onMenuKey}
            className="absolute left-0 top-full z-30 mt-1.5 w-40 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
            {STATUS.map((x) => (
              <button key={x.v} type="button" role="menuitemradio" aria-checked={status === x.v} onClick={() => pick(x.v)}
                className="flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left text-[15px] font-semibold text-slate-800 hover:bg-slate-50">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[x.v]}`} aria-hidden />
                <span className="flex-1">{x.label}</span>
                {status === x.v && <i className="fas fa-check text-[13px] text-slate-700" aria-hidden />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────── 목표일 · 메모 ─────────────────────────
// 평소에는 한 줄(요약)로 접어 두고, 누르면 펼쳐진다. 「할 일」 탭 맨 아래에 둔다. 진행 상태는 시트 머리글의 알약에 있다.
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
    <section aria-label="목표일 · 메모">
      <button type="button" aria-expanded={open} aria-controls={`${uid}-info`} onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-slate-100 text-left">
        <span className="shrink-0 text-[15px] font-bold text-slate-700">목표일 · 메모</span>
        <span className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[13px] font-semibold text-slate-500">
          {summary.map((x) => <span key={x}>{x}</span>)}
          <EditBadge k={`step:${stepId}`} />
        </span>
        <i className={`fas ${open ? 'fa-chevron-up' : 'fa-chevron-down'} shrink-0 text-[12px] text-slate-500`} aria-hidden />
      </button>

      {/* 접어도 지우지 않는다: 쓰던 메모와 저장 안 한 편집 보호가 끊기지 않게 */}
      <div id={`${uid}-info`} hidden={!open} className="pt-2">
        {!ed.open ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1 text-[15px] text-slate-700">
              <div><span className="mr-2 font-bold text-slate-500">목표일</span>{st?.targetDate ?? <span className="text-slate-500">미정</span>}</div>
              <div className="whitespace-pre-wrap"><span className="mr-2 font-bold text-slate-500">메모</span>{st?.note || <span className="text-slate-500">없음</span>}</div>
            </div>
            <button type="button" className={btnGhost} onClick={() => {
              const o = { date: st?.targetDate ?? '', note: st?.note ?? '' };
              setDate(o.date); setNote(o.note); setOrig(o); setBase(st?.version ?? 0); ed.start();
            }}>수정</button>
          </div>
        ) : (
          <form className="space-y-2" onKeyDown={escStep} onSubmit={(e) => {
            e.preventDefault();
            void run(() => send({ op: 'step.update', stepId, baseVersion: base, patch: { targetDate: date || null, note } }, {
              onSuccess: ed.stop,
              onTakeLatest: (cur) => {
                const o = { date: String(cur.targetDate ?? ''), note: String(cur.note ?? '') };
                setDate(o.date); setNote(o.note); setOrig(o); setBase(Number(cur.version) || 0);
              },
            }));
          }}>
            <label className="block text-[13px] font-bold text-slate-600">목표일<input type="date" className={`${inputCls} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="block text-[13px] font-bold text-slate-600">메모<AutoTextarea className={`${inputCls} mt-1`} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={ed.stop}>취소</button><button className={btnPrimary} disabled={busy}>저장</button></div>
            <LastEdit by={st?.updatedBy} at={st?.updatedAt} />
          </form>
        )}
      </div>
    </section>
  );
}
