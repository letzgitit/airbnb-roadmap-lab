'use client';

import { useState } from 'react';
import type { StepStatus, TaskItem } from '@/lib/core/types';
import { STEP_COUNT } from '@/lib/core/types';
import { dueLabel, relTime, todayStr } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { btnGhost, btnPrimary, EditBadge, iconBtn, inputCls, Stamp, useBusy, useEditing } from './bits';

// 고른 상태는 흰 바탕 + 진한 글자(채운 파랑은 누르는 주 버튼에만 쓴다)
const STATUS: { v: StepStatus; label: string; on: string }[] = [
  { v: 'todo', label: '시작 전', on: 'text-slate-800' },
  { v: 'doing', label: '진행 중', on: 'text-blue-700' },
  { v: 'done', label: '완료', on: 'text-emerald-700' },
];

interface StepRef { id: number; title: string }

export function StepPanel({ stepId, steps }: { stepId: number; steps: StepRef[] }) {
  const { doc, send } = useProgress();
  const st = doc?.steps[String(stepId)];
  const status = st?.status ?? 'todo';
  const ed = useEditing(`step:${stepId}`);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  // 편집을 연 순간의 version. 저장할 때 이 값으로 보내야 그 사이 상대가 고친 걸 409 로 알아챈다.
  const [base, setBase] = useState(0);
  const { busy, run } = useBusy();
  if (!doc) return null;

  const live = Object.values(doc.tasks).filter((t) => t.stepId === stepId && !t.deletedAt)
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt.localeCompare(b.createdAt));

  const setStatus = (v: StepStatus) => {
    if (v === status) return;
    void send({ op: 'step.update', stepId, baseVersion: st?.version ?? 0, patch: { status: v } });
  };

  return (
    <section className="mb-2 rounded-3xl border border-blue-100 bg-white p-4 shadow-sm" aria-label="우리 현황">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h5 className="text-[14px] font-bold text-slate-700 flex items-center gap-2"><i className="fas fa-heart text-blue-600" aria-hidden /> 우리 현황</h5>
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
          <button type="button" className={btnGhost} onClick={() => { setDate(st?.targetDate ?? ''); setNote(st?.note ?? ''); setBase(st?.version ?? 0); ed.start(); }}>수정</button>
        </div>
      ) : (
        <form className="mt-3 space-y-2" onSubmit={(e) => {
          e.preventDefault();
          void run(() => send({ op: 'step.update', stepId, baseVersion: base, patch: { targetDate: date || null, note } }, {
            onSuccess: ed.stop,
            onTakeLatest: (cur) => { setDate(String(cur.targetDate ?? '')); setNote(String(cur.note ?? '')); setBase(Number(cur.version) || 0); },
          }));
        }}>
          <label className="block text-[13px] font-bold text-slate-600">목표일<input type="date" className={`${inputCls} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="block text-[13px] font-bold text-slate-600">메모<textarea className={`${inputCls} mt-1`} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="flex gap-2 justify-end"><button type="button" className={btnGhost} onClick={ed.stop}>취소</button><button className={btnPrimary} disabled={busy}>저장</button></div>
        </form>
      )}

      <div className="mt-5">
        <div className="text-[14px] font-bold text-slate-700 mb-2">할 일 <span className="text-slate-500 font-semibold">{live.filter((t) => t.done).length}/{live.length}</span></div>
        <ul className="space-y-2">
          {live.map((t) => <TaskRow key={t.id} t={t} steps={steps} />)}
          {live.length === 0 && <li className="text-[14px] text-slate-500 font-semibold">아직 할 일이 없어요.</li>}
        </ul>
        <AddTask stepId={stepId} />
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
  const [base, setBase] = useState(t.version);
  const { busy, run } = useBusy();
  const dl = dueLabel(t.due, todayStr());

  // 확인 창 없이 바로 지우고, 8초 동안 알림의 「되돌리기」로 취소할 수 있다(나중엔 맨 아래 「삭제한 항목」에서 복원).
  const del = () => {
    void send({ op: 'task.delete', id: t.id }).then((r) => {
      if (r.ok) toast('할 일을 삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'task.restore', id: t.id }) } });
    });
  };

  if (ed.open) {
    return (
      <li className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3">
        <form className="space-y-2" onSubmit={(e) => {
          e.preventDefault();
          void run(() => send({ op: 'task.update', id: t.id, baseVersion: base, patch: { text, due: due || null, stepId: sid } }, {
            onSuccess: ed.stop,
            onTakeLatest: (cur) => {
              setText(String(cur.text ?? '')); setDue(String(cur.due ?? ''));
              if (typeof cur.stepId === 'number') setSid(cur.stepId);
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
          <div className="flex gap-2 justify-end"><button type="button" className={btnGhost} onClick={ed.stop}>취소</button><button className={btnPrimary} disabled={busy}>저장</button></div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-1 rounded-2xl bg-slate-50 pl-1 pr-1 py-1">
      <label className="w-11 h-11 shrink-0 flex items-center justify-center cursor-pointer">
        <input type="checkbox" className="h-5 w-5 accent-emerald-600 cursor-pointer" checked={t.done} aria-label={`${t.text} 완료`}
          onChange={(e) => void send({ op: 'task.update', id: t.id, patch: { done: e.target.checked } })} />
      </label>
      <div className="min-w-0 flex-1 py-2.5">
        <div className={`text-[14px] font-bold break-words ${t.done ? 'line-through text-slate-500' : 'text-slate-800'}`}>{t.text}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {dl && <span className={`inline-flex gap-x-2 text-[12px] font-bold ${dl.late && !t.done ? 'text-red-600' : 'text-slate-500'}`}><span><i className="far fa-calendar mr-1" aria-hidden />{dl.date}</span><span>{dl.rel}</span></span>}
          {t.done && t.doneBy && <span className="text-[12px] font-bold text-emerald-700">{t.doneBy}가 {relTime(t.doneAt)} 체크함</span>}
          <EditBadge k={`task:${t.id}`} />
        </div>
      </div>
      <div className="flex shrink-0">
        <button type="button" aria-label="수정" className={`${iconBtn} hover:text-blue-700`} onClick={() => { setText(t.text); setDue(t.due ?? ''); setSid(t.stepId); setBase(t.version); ed.start(); }}><i className="fas fa-pen text-[13px]" aria-hidden /></button>
        <button type="button" aria-label="삭제" className={`${iconBtn} hover:text-red-600`} onClick={del}><i className="fas fa-trash text-[13px]" aria-hidden /></button>
      </div>
    </li>
  );
}
