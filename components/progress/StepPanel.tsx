'use client';

import { useState } from 'react';
import type { StepStatus, TaskItem } from '@/lib/core/types';
import { STEP_COUNT } from '@/lib/core/types';
import { dueLabel, relTime, todayStr } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { btnDanger, btnGhost, btnPrimary, EditBadge, inputCls, Stamp, useBusy, useDirty, useEditing, useFormEsc } from './bits';

// 고른 상태는 흰 바탕 + 진한 글자(채운 파랑은 누르는 주 버튼에만 쓴다)
const STATUS: { v: StepStatus; label: string; on: string }[] = [
  { v: 'todo', label: '시작 전', on: 'text-slate-800' },
  { v: 'doing', label: '진행 중', on: 'text-blue-700' },
  { v: 'done', label: '완료', on: 'text-emerald-700' },
];

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
  if (!doc) return null;

  const live = Object.values(doc.tasks).filter((t) => t.stepId === stepId && !t.deletedAt)
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt.localeCompare(b.createdAt));

  const setStatus = (v: StepStatus) => {
    if (v === status) return;
    void send({ op: 'step.update', stepId, baseVersion: st?.version ?? 0, patch: { status: v } });
  };

  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-4 shadow-sm" aria-label="우리 현황">
      <div>
        <div className="text-[14px] font-bold text-slate-700 mb-2">우리 할 일 <span className="text-slate-500 font-semibold">{live.filter((t) => t.done).length}/{live.length}</span></div>
        <ul className="space-y-2">
          {live.map((t) => <TaskRow key={t.id} t={t} steps={steps} />)}
          {live.length === 0 && <li className="text-[14px] text-slate-500 font-semibold">아직 할 일이 없어요.</li>}
        </ul>
        <AddTask stepId={stepId} />
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[14px] font-bold text-slate-700">단계 상태</span>
          <EditBadge k={`step:${stepId}`} />
        </div>
        <div className="status-seg grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl" role="group" aria-label="단계 상태">
          {STATUS.map((s) => (
            <button key={s.v} type="button" onClick={() => setStatus(s.v)} aria-pressed={status === s.v}
              className={`min-h-11 rounded-xl text-[14px] ${status === s.v ? `bg-white shadow-sm font-bold ${s.on}` : 'font-semibold text-slate-600 hover:bg-white/60'}`}>{s.label}</button>
          ))}
        </div>

        {!ed.open ? (
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="text-[14px] text-slate-700 min-w-0 space-y-1">
              <div><span className="font-bold text-slate-600 mr-2">목표일</span>{st?.targetDate ?? <span className="text-slate-500">미정</span>}</div>
              <div className="whitespace-pre-wrap break-words"><span className="font-bold text-slate-600 mr-2">메모</span>{st?.note || <span className="text-slate-500">없음</span>}</div>
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
            <div className="flex gap-2 justify-end"><button type="button" className={btnGhost} onClick={ed.stop}>취소</button><button className={btnPrimary} disabled={busy}>저장</button></div>
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
    <form className="mt-3 flex flex-col sm:flex-row gap-2" onSubmit={(e) => {
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
function TaskRow({ t, steps }: { t: TaskItem; steps: StepRef[] }) {
  const { send, toast } = useProgress();
  const ed = useEditing(`task:${t.id}`);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [sid, setSid] = useState(t.stepId);
  const [base, setBase] = useState(t.version);
  const [orig, setOrig] = useState({ text: '', due: '', sid: t.stepId });
  const { busy, run } = useBusy();
  const dl = dueLabel(t.due, todayStr());
  const dirty = ed.open && (text !== orig.text || due !== orig.due || sid !== orig.sid);
  useDirty(`form:task:${t.id}`, dirty, 'modal');
  const esc = useFormEsc(dirty, ed.stop);

  // 확인 창 없이 바로 지우고, 8초 동안 알림의 「되돌리기」로 취소할 수 있다(나중엔 맨 아래 「삭제한 항목」에서 복원).
  const del = () => {
    void send({ op: 'task.delete', id: t.id }).then((r) => {
      if (r.ok) toast('할 일을 삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'task.restore', id: t.id }) } });
    });
  };

  if (ed.open) {
    return (
      <li className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3">
        <form className="space-y-2" onKeyDown={esc} onSubmit={(e) => {
          e.preventDefault();
          void run(() => send({ op: 'task.update', id: t.id, baseVersion: base, patch: { text, due: due || null, stepId: sid } }, {
            onSuccess: ed.stop,
            onTakeLatest: (cur) => {
              const o = { text: String(cur.text ?? ''), due: String(cur.due ?? ''), sid: typeof cur.stepId === 'number' ? cur.stepId : sid };
              setText(o.text); setDue(o.due); setSid(o.sid); setOrig(o);
              setBase(Number(cur.version) || 0);
            },
          }));
        }}>
          <input className={inputCls} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} aria-label="할 일 내용" />
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} aria-label="마감일" />
            <select className={inputCls} value={sid} onChange={(e) => setSid(Number(e.target.value))} aria-label="단계 이동">
              {steps.slice(0, STEP_COUNT).map((s) => <option key={s.id} value={s.id}>{s.id}. {s.title}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={btnDanger} onClick={del}>삭제</button>
            <div className="ml-auto flex gap-2"><button type="button" className={btnGhost} onClick={ed.stop}>취소</button><button className={btnPrimary} disabled={busy}>저장</button></div>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-start rounded-2xl bg-slate-50 pr-1">
      <label className="w-11 h-11 shrink-0 flex items-center justify-center cursor-pointer">
        <input type="checkbox" className="h-5 w-5 accent-emerald-600 cursor-pointer" checked={t.done} aria-label={`${t.text} 완료`}
          onChange={(e) => void send({ op: 'task.update', id: t.id, patch: { done: e.target.checked } })} />
      </label>
      <button type="button" aria-label={`${t.text} 수정`} className="min-w-0 flex-1 rounded-xl py-3 pr-2 text-left hover:bg-slate-100/70"
        onClick={() => {
          const o = { text: t.text, due: t.due ?? '', sid: t.stepId };
          setText(o.text); setDue(o.due); setSid(o.sid); setOrig(o); setBase(t.version); ed.start();
        }}>
        <span className={`line-clamp-2 break-words text-[14px] font-bold leading-snug ${t.done ? 'line-through text-slate-500' : 'text-slate-800'}`}>{t.text}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {dl && <span className={`inline-flex gap-x-2 text-[12px] font-bold ${dl.late && !t.done ? 'text-red-600' : 'text-slate-500'}`}><span><i className="far fa-calendar mr-1" aria-hidden />{dl.date}</span><span>{dl.rel}</span></span>}
          {t.done && t.doneBy && <span className="text-[12px] font-bold text-emerald-700">{t.doneBy}가 {relTime(t.doneAt)} 체크함</span>}
          <EditBadge k={`task:${t.id}`} />
        </span>
      </button>
    </li>
  );
}
