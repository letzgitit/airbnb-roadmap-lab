'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StepStatus, TaskItem } from '@/lib/core/types';
import { STEP_COUNT } from '@/lib/core/types';
import { dueLabel, relTime, todayStr, withGa } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { btnGhost, btnPrimary, EditBadge, inputCls, Stamp, useBusy, useDirty, useEditing, useFormEsc } from './bits';

// 고른 상태는 흰 바탕 + 진한 글자(파랑은 누르는 주 버튼·링크·현재 위치에만 쓴다)
const STATUS: { v: StepStatus; label: string }[] = [
  { v: 'todo', label: '시작 전' },
  { v: 'doing', label: '진행 중' },
  { v: 'done', label: '완료' },
];

const STICKY_MS = 8000; // 방금 체크한 줄이 제자리를 지키는 시간(되돌리기 알림과 같은 길이)

interface StepRef { id: number; title: string }

// 단계 창 「챙길 것」 안의 우리 현황. 위에서부터: 우리 할 일(+ 추가) → 단계 상태 · 목표일 · 메모.
export function StepPanel({ stepId, steps }: { stepId: number; steps: StepRef[] }) {
  const { doc, send } = useProgress();
  const st = doc?.steps[String(stepId)];
  const status = st?.status ?? 'todo';
  const ed = useEditing(`step:${stepId}`);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  // 편집을 연 순간의 version. 저장할 때 이 값으로 보내야 그 사이 상대가 고친 걸 409 로 알아챈다.
  const [base, setBase] = useState(0);
  const [orig, setOrig] = useState({ date: '', note: '' });
  const { busy, run } = useBusy();
  const dirty = ed.open && (date !== orig.date || note !== orig.note);
  useDirty(`form:step:${stepId}`, dirty, 'modal');
  const escStep = useFormEsc(dirty, ed.stop);

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
  // 줄이 사라진 뒤 포커스가 몸통(body)으로 빠지지 않게 목록 제목으로 돌려보낸다
  const headingRef = useRef<HTMLDivElement>(null);
  const focusHeading = useCallback(() => { window.requestAnimationFrame(() => headingRef.current?.focus()); }, []);

  if (!doc) return null;

  const rows = Object.values(doc.tasks)
    .filter((t) => (t.stepId === stepId && !t.deletedAt) || editing.has(t.id))
    .sort((a, b) => Number(sticky[a.id] ?? a.done) - Number(sticky[b.id] ?? b.done) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt.localeCompare(b.createdAt));
  const mine = rows.filter((t) => t.stepId === stepId && !t.deletedAt);
  const setStatus = (v: StepStatus) => {
    if (v === status) return;
    void send({ op: 'step.update', stepId, baseVersion: st?.version ?? 0, patch: { status: v } });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="우리 현황">
      <div>
        <div ref={headingRef} tabIndex={-1} className="mb-1 text-[14px] font-bold text-slate-700 outline-none">우리 할 일 <span className="font-semibold text-slate-500">{mine.filter((t) => t.done).length}/{mine.length}</span></div>
        <ul>
          {rows.map((t) => <TaskRow key={t.id} t={t} steps={steps} panelStepId={stepId} onEditChange={reportEdit} onToggle={onToggle} onGone={focusHeading} />)}
          {mine.length === 0 && editing.size === 0 && <li className="py-2 text-[15px] font-semibold text-slate-500">아직 할 일이 없어요.</li>}
        </ul>
        <AddTask stepId={stepId} />
      </div>

      <div className="mt-5 border-t border-slate-200 pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[14px] font-bold text-slate-700">단계 상태</span>
          <EditBadge k={`step:${stepId}`} />
        </div>
        <div className="status-seg grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="단계 상태">
          {STATUS.map((s) => (
            <button key={s.v} type="button" onClick={() => setStatus(s.v)} aria-pressed={status === s.v}
              className={`min-h-11 rounded-lg text-[14px] ${status === s.v ? 'bg-white font-bold text-slate-900 shadow-sm' : 'font-semibold text-slate-600 hover:bg-white/60'}`}>{s.label}</button>
          ))}
        </div>

        {!ed.open ? (
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1 text-[15px] text-slate-700">
              <div><span className="mr-2 font-bold text-slate-500">목표일</span>{st?.targetDate ?? <span className="text-slate-500">미정</span>}</div>
              <div className="whitespace-pre-wrap"><span className="mr-2 font-bold text-slate-500">메모</span>{st?.note || <span className="text-slate-500">없음</span>}</div>
              <Stamp by={st?.updatedBy} at={st?.updatedAt} rel={relTime} />
            </div>
            <button type="button" className={btnGhost} onClick={() => {
              const o = { date: st?.targetDate ?? '', note: st?.note ?? '' };
              setDate(o.date); setNote(o.note); setOrig(o); setBase(st?.version ?? 0); ed.start();
            }}>수정</button>
          </div>
        ) : (
          <form className="mt-3 space-y-2" onKeyDown={escStep} onSubmit={(e) => {
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
            <label className="block text-[13px] font-bold text-slate-600">메모<textarea className={`${inputCls} mt-1`} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={ed.stop}>취소</button><button className={btnPrimary} disabled={busy}>저장</button></div>
          </form>
        )}
      </div>
    </section>
  );
}

function AddTask({ stepId }: { stepId: number }) {
  const { send } = useProgress();
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const { busy, run } = useBusy();
  useDirty(`form:add-task:${stepId}`, text.trim() !== '' || due !== '', 'modal');
  return (
    <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => {
      e.preventDefault();
      if (!text.trim()) return;
      void run(() => send({ op: 'task.add', stepId, text, due: due || null }, { onSuccess: () => { setText(''); setDue(''); } }));
    }}>
      <input className={inputCls} placeholder="할 일 추가" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} aria-label="새 할 일" />
      <input type="date" className={`${inputCls} sm:w-40`} value={due} onChange={(e) => setDue(e.target.value)} aria-label="마감일" />
      <button className={btnPrimary} disabled={busy || !text.trim()}>추가</button>
    </form>
  );
}

// 할 일 한 줄: 왼쪽 네모 = 완료 체크(44px 따로), 글을 누르면 그 자리에서 편집 폼이 열리고 폼 안에 「삭제」가 있다.
function TaskRow({ t, steps, panelStepId, onEditChange, onToggle, onGone }: {
  t: TaskItem; steps: StepRef[]; panelStepId: number;
  onEditChange: (id: string, open: boolean) => void; onToggle: (t: TaskItem) => void; onGone: () => void;
}) {
  const { send, toast } = useProgress();
  const ed = useEditing(`task:${t.id}`);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [sid, setSid] = useState(t.stepId);
  const [base, setBase] = useState(t.version);
  const [orig, setOrig] = useState({ text: '', due: '', sid: t.stepId });
  const { busy, run } = useBusy();
  const textBtn = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const dl = dueLabel(t.due, todayStr());
  const dirty = ed.open && (text !== orig.text || due !== orig.due || sid !== orig.sid);
  useDirty(`form:task:${t.id}`, dirty, 'modal');
  const esc = useFormEsc(dirty, ed.stop);
  const deleted = !!t.deletedAt;
  const moved = !deleted && t.stepId !== panelStepId;

  // 목록(StepPanel)에 「이 줄은 편집 중」을 알려, 상대가 지우거나 옮겨도 폼이 사라지지 않게 한다
  useEffect(() => { onEditChange(t.id, ed.open); }, [ed.open, t.id, onEditChange]);
  useEffect(() => () => onEditChange(t.id, false), [t.id, onEditChange]);
  // 폼을 닫으면(저장 · 취소) 다시 생긴 글 단추로 포커스를 돌린다
  useEffect(() => {
    if (wasOpen.current && !ed.open) textBtn.current?.focus();
    wasOpen.current = ed.open;
  }, [ed.open]);

  // 확인 창 없이 바로 지우고, 8초 동안 알림의 「되돌리기」로 취소할 수 있다(나중엔 맨 아래 「삭제한 항목」에서 복원).
  const del = () => {
    ed.stop(); // 폼을 먼저 닫아야 내 삭제가 「다른 사람이 삭제했어요」 안내로 번쩍이지 않는다
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
        {deleted && <p role="alert" className="mb-2 text-[14px] font-bold text-slate-800">다른 사람이 이 할 일을 삭제했어요.</p>}
        {moved && <p role="status" className="mb-2 text-[14px] font-bold text-slate-800">다른 사람이 {t.stepId}단계로 옮겼어요.</p>}
        <form className="space-y-2" onKeyDown={esc} onSubmit={(e) => {
          e.preventDefault();
          if (deleted) { if (text.trim()) void saveAsNew(); return; }
          void run(() => send({ op: 'task.update', id: t.id, baseVersion: base, patch: { text, due: due || null, stepId: sid } }, {
            onSuccess: ed.stop,
            onTakeLatest: (cur) => {
              const o = { text: String(cur.text ?? ''), due: String(cur.due ?? ''), sid: typeof cur.stepId === 'number' ? cur.stepId : sid };
              setText(o.text); setDue(o.due); setSid(o.sid); setOrig(o);
              setBase(Number(cur.version) || 0);
            },
          }));
        }}>
          <input className={inputCls} value={text} maxLength={200} autoFocus onChange={(e) => setText(e.target.value)} aria-label="할 일 내용" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} aria-label="마감일" />
            {!deleted && (
              <select className={inputCls} value={sid} onChange={(e) => setSid(Number(e.target.value))} aria-label="단계 이동">
                {steps.slice(0, STEP_COUNT).map((s) => <option key={s.id} value={s.id}>{s.id}. {s.title}</option>)}
              </select>
            )}
          </div>
          {deleted ? (
            <div className="flex items-center justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => { ed.stop(); onGone(); }}>닫기</button>
              <button type="button" className={btnPrimary} disabled={busy || !text.trim()} onClick={() => void saveAsNew()}>새 할 일로 저장</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" className={btnGhost} disabled={busy} onClick={del}>삭제</button>
              <div className="ml-auto flex gap-2"><button type="button" className={btnGhost} onClick={ed.stop}>취소</button><button className={btnPrimary} disabled={busy}>저장</button></div>
            </div>
          )}
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-start border-b border-slate-200 last:border-b-0">
      <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
        <input type="checkbox" className="h-5 w-5 cursor-pointer accent-emerald-600" checked={t.done} aria-label={`${t.text} 완료`}
          onChange={(e) => { onToggle(t); void send({ op: 'task.update', id: t.id, patch: { done: e.target.checked } }); }} />
      </label>
      <button ref={textBtn} type="button" aria-label={`${t.text} 수정`} className="min-w-0 flex-1 py-3 pr-1 text-left"
        onClick={() => {
          const o = { text: t.text, due: t.due ?? '', sid: t.stepId };
          setText(o.text); setDue(o.due); setSid(o.sid); setOrig(o); setBase(t.version); ed.start();
        }}>
        <span className={`line-clamp-2 text-[15px] font-bold leading-snug ${t.done ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{t.text}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {dl && <span className={`inline-flex gap-x-2 text-[13px] font-semibold ${dl.late && !t.done ? 'text-red-600' : 'text-slate-500'}`}><span><i className="far fa-calendar mr-1" aria-hidden />{dl.date}</span><span>{dl.rel}</span></span>}
          {t.done && t.doneBy && <span className="text-[13px] font-semibold text-emerald-700">{withGa(t.doneBy)} {relTime(t.doneAt)} 체크함</span>}
          <EditBadge k={`task:${t.id}`} />
        </span>
      </button>
    </li>
  );
}
