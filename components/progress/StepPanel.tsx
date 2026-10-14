'use client';

import { useState } from 'react';
import type { StepStatus, TaskItem } from '@/lib/core/types';
import { STEP_COUNT } from '@/lib/core/types';
import { dueLabel, relTime, todayStr } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { btnGhost, btnPrimary, EditBadge, inputCls, stamp, useBusy, useEditing } from './bits';

const STATUS: { v: StepStatus; label: string; on: string }[] = [
  { v: 'todo', label: '시작 전', on: 'bg-slate-600 text-white' },
  { v: 'doing', label: '진행 중', on: 'bg-blue-600 text-white' },
  { v: 'done', label: '완료', on: 'bg-emerald-500 text-white' },
];

interface StepRef { id: number; title: string }

export function StepPanel({ stepId, steps }: { stepId: number; steps: StepRef[] }) {
  const { doc, send } = useProgress();
  const st = doc?.steps[String(stepId)];
  const status = st?.status ?? 'todo';
  const ed = useEditing(`step:${stepId}`);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const { busy, run } = useBusy();
  const [showTrash, setShowTrash] = useState(false);
  if (!doc) return null;

  const tasks = Object.values(doc.tasks).filter((t) => t.stepId === stepId);
  const live = tasks.filter((t) => !t.deletedAt).sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt.localeCompare(b.createdAt));
  const trash = tasks.filter((t) => t.deletedAt);

  const setStatus = (v: StepStatus) => {
    if (v === status) return;
    void send({ op: 'step.update', stepId, baseVersion: st?.version ?? 0, patch: { status: v } });
  };

  return (
    <section className="mb-2 rounded-3xl border border-blue-100 bg-white p-4 shadow-sm" aria-label="우리 현황">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h5 className="text-[11px] font-black text-blue-600 tracking-widest uppercase flex items-center gap-2"><i className="fas fa-heart" /> 우리 현황</h5>
        <EditBadge k={`step:${stepId}`} />
      </div>

      <div className="status-seg grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl" role="group" aria-label="단계 상태">
        {STATUS.map((s) => (
          <button key={s.v} type="button" onClick={() => setStatus(s.v)}
            className={`py-2 rounded-xl text-[13px] font-bold ${status === s.v ? s.on : 'text-slate-500 hover:bg-white'}`}>{s.label}</button>
        ))}
      </div>

      {!ed.open ? (
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="text-[13px] text-slate-600 min-w-0">
            <div><span className="font-bold text-slate-500">목표일</span> {st?.targetDate ?? <span className="text-slate-300">미정</span>}</div>
            <div className="mt-1 whitespace-pre-wrap break-words"><span className="font-bold text-slate-500">메모</span> {st?.note || <span className="text-slate-300">없음</span>}</div>
            {stamp(st?.updatedBy, st?.updatedAt, relTime)}
          </div>
          <button type="button" className={btnGhost} onClick={() => { setDate(st?.targetDate ?? ''); setNote(st?.note ?? ''); ed.start(); }}>수정</button>
        </div>
      ) : (
        <form className="mt-3 space-y-2" onSubmit={(e) => {
          e.preventDefault();
          void run(() => send({ op: 'step.update', stepId, baseVersion: st?.version ?? 0, patch: { targetDate: date || null, note } }, { onSuccess: ed.stop }));
        }}>
          <label className="block text-[11px] font-black text-slate-400">목표일<input type="date" className={`${inputCls} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="block text-[11px] font-black text-slate-400">메모<textarea className={`${inputCls} mt-1`} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="flex gap-2 justify-end"><button type="button" className={btnGhost} onClick={ed.stop}>취소</button><button className={btnPrimary} disabled={busy}>저장</button></div>
        </form>
      )}

      <div className="mt-5">
        <div className="text-[11px] font-black text-slate-400 tracking-widest mb-2">할 일 ({live.filter((t) => t.done).length}/{live.length})</div>
        <ul className="space-y-2">
          {live.map((t) => <TaskRow key={t.id} t={t} steps={steps} />)}
          {live.length === 0 && <li className="text-[13px] text-slate-300 font-semibold">아직 할 일이 없어요.</li>}
        </ul>
        <AddTask stepId={stepId} />
        {trash.length > 0 && (
          <div className="mt-3">
            <button type="button" className="text-[12px] font-bold text-slate-400 hover:text-slate-600" onClick={() => setShowTrash((v) => !v)}>
              <i className={`fas fa-trash-can mr-1`} /> 삭제한 항목 {trash.length}개 {showTrash ? '접기' : '보기'}
            </button>
            {showTrash && (
              <ul className="mt-2 space-y-1">
                {trash.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-[13px] text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
                    <span className="line-through truncate">{t.text}</span>
                    <button type="button" className="text-blue-600 font-bold shrink-0" onClick={() => void send({ op: 'task.restore', id: t.id })}>복원</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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

function TaskRow({ t, steps }: { t: TaskItem; steps: StepRef[] }) {
  const { send, toast } = useProgress();
  const ed = useEditing(`task:${t.id}`);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [sid, setSid] = useState(t.stepId);
  const { busy, run } = useBusy();
  const dl = dueLabel(t.due, todayStr());

  const del = () => {
    if (!window.confirm(`"${t.text}" 할 일을 삭제할까요?`)) return;
    void send({ op: 'task.delete', id: t.id }).then((r) => {
      if (r.ok) toast('삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'task.restore', id: t.id }) } });
    });
  };

  if (ed.open) {
    return (
      <li className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3">
        <form className="space-y-2" onSubmit={(e) => {
          e.preventDefault();
          void run(() => send({ op: 'task.update', id: t.id, baseVersion: t.version, patch: { text, due: due || null, stepId: sid } }, { onSuccess: ed.stop }));
        }}>
          <input className={inputCls} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} aria-label="할 일 내용" />
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} aria-label="마감일" />
            <select className={inputCls} value={sid} onChange={(e) => setSid(Number(e.target.value))} aria-label="단계 이동">
              {steps.slice(0, STEP_COUNT).map((s) => <option key={s.id} value={s.id}>{s.id}. {s.title}</option>)}
            </select>
          </div>
          <div className="flex gap-2 justify-end"><button type="button" className={btnGhost} onClick={ed.stop}>취소</button><button className={btnPrimary} disabled={busy}>저장</button></div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
      <input type="checkbox" className="mt-1 h-5 w-5 accent-emerald-500 shrink-0" checked={t.done} aria-label={`${t.text} 완료`}
        onChange={(e) => void send({ op: 'task.update', id: t.id, patch: { done: e.target.checked } })} />
      <div className="min-w-0 flex-1">
        <div className={`text-[14px] font-bold break-words ${t.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{t.text}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {dl && <span className={`text-[11px] font-bold ${dl.late && !t.done ? 'text-red-500' : 'text-slate-500'}`}><i className="far fa-calendar mr-1" />{dl.text}</span>}
          {t.done && t.doneBy && <span className="text-[11px] font-bold text-emerald-600">{t.doneBy}가 {relTime(t.doneAt)} 체크함</span>}
          <EditBadge k={`task:${t.id}`} />
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button type="button" aria-label="수정" className="w-8 h-8 rounded-lg text-slate-400 hover:bg-white hover:text-blue-600" onClick={() => { setText(t.text); setDue(t.due ?? ''); setSid(t.stepId); ed.start(); }}><i className="fas fa-pen text-xs" /></button>
        <button type="button" aria-label="삭제" className="w-8 h-8 rounded-lg text-slate-400 hover:bg-white hover:text-red-500" onClick={del}><i className="fas fa-trash text-xs" /></button>
      </div>
    </li>
  );
}
