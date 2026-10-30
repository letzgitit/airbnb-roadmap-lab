'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { liveChildrenOf } from '@/lib/core/task-tree';
import { STEP_COUNT, TASK_KINDS, type TaskKind } from '@/lib/core/types';
import { useProgress } from '@/components/progress/ProgressProvider';
import { btnPrimary, clipLabel, inputCls, LastEdit, TRASH_NOTE, useDirty, useFormEsc } from '@/components/progress/bits';
import { START_AFTER_DUE, taskErrorMessage } from '@/components/tasks/task-errors';
import { placeOf, placePatch } from '@/components/tasks/task-view';
import { CheckLineButton } from '@/components/tasks/TaskMemo';
import { cleanNote } from '@/components/tasks/checklist';
import type { Editing, Phase } from './gantt-model';
import s from './gantt.module.css';
import { Plus, Trash } from './icons';

// 간트 안에서 그 자리에 펼쳐지는 할 일 폼(고치기 · 새 할 일 · 새 세부 항목).
//   이름 · 시작일(없어도 됨) · 마감일 · 종류 · 메모 · 넣을 곳 · 끝냄 · 지우기 · 「＋ 세부 항목 추가」.
//   넣을 곳 = 「n단계 할 일」(어느 단계든) 또는 같은 단계 맨 위 할 일의 「‘제목’의 세부 항목」(한 층만) — 할 일 줄 폼(TaskRow)과 같은 말 · 같은 값.
//   저장 거절(시작일 > 마감일 · 넣을 곳 문제)은 알림 대신 폼 안 빨강 한 줄(send quiet + taskErrorMessage).
//   지우기 = 확인 창(세부 항목이 있으면 같이 지워진다고) → 지움 → 8초 「되돌리기」(세부 항목도 같이 돌아온다).
export interface StepRef { id: number; title: string }
interface Form { text: string; start: string; due: string; kind: TaskKind | ''; note: string; place: string; done: boolean }

const secBtn = 'inline-flex min-h-11 shrink-0 items-center justify-center rounded-control bg-surface px-4 text-base font-bold text-ink-soft ring-1 ring-inset ring-line-strong transition-colors hover:bg-page';
const fieldCls = inputCls;

export function GanttForm({ ed, phase, steps, onClose, onAddSub }: {
  ed: Editing; phase: Phase; steps: StepRef[];
  onClose: () => void; onAddSub: (parentId: string) => void;
}) {
  const { doc, send, toast, confirm } = useProgress();
  const tasks = doc?.tasks ?? {};
  const cur = ed.kind === 'edit' ? tasks[ed.id] : undefined;
  const parent = ed.kind === 'newsub' ? tasks[ed.parentId] : undefined;
  const [orig] = useState<Form>(() => cur
    ? { text: cur.text, start: cur.start ?? '', due: cur.due ?? '', kind: cur.kind ?? '', note: cur.note ?? '', place: placeOf(cur), done: cur.done }
    : { text: '', start: '', due: parent?.due ?? '', kind: '', note: '', place: parent ? `p:${parent.id}` : `s:${phase.id}`, done: false });
  const [f, setF] = useState<Form>(orig);
  const noteId = useId();
  const [base] = useState(cur?.version ?? 0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const dirty = (Object.keys(f) as (keyof Form)[]).some((k) => f[k] !== orig[k]);
  useDirty('form:gantt', dirty, 'page');
  const esc = useFormEsc(dirty, onClose);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((o) => ({ ...o, [k]: v })); setErr(''); };

  useEffect(() => {
    boxRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (ed.kind !== 'edit') textRef.current?.focus({ preventScroll: true });
  }, [ed.kind]);

  if (ed.kind === 'edit' && !cur) return null;
  const isSub = ed.kind === 'newsub' || !!cur?.parentId;
  const head = ed.kind === 'new' ? '새 할 일' : ed.kind === 'newsub' ? '새 세부 항목' : isSub ? '세부 항목 고치기' : '할 일 고치기';
  const kidCount = cur && doc ? liveChildrenOf(doc, cur.id).length : 0;
  const stepOf = cur?.stepId ?? parent?.stepId ?? phase.id;
  // 세부 항목으로 넣을 수 있는 곳: 같은 단계의 지우지 않은 맨 위 할 일(자기 자신 제외), 마감순
  const parents = Object.values(tasks)
    .filter((p) => !p.deletedAt && !p.parentId && p.stepId === stepOf && p.id !== cur?.id)
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt.localeCompare(b.createdAt));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = f.text.trim();
    if (!text) { setErr('이름을 적어 주세요.'); textRef.current?.focus(); return; }
    if (f.start && f.due && f.start > f.due) { setErr(START_AFTER_DUE); return; }
    setBusy(true);
    let r;
    if (cur) {
      const patch: Record<string, unknown> = {};
      if (text !== orig.text) patch.text = text;
      if (f.start !== orig.start) patch.start = f.start || null;
      if (f.due !== orig.due) patch.due = f.due || null;
      if (f.kind !== orig.kind) patch.kind = f.kind || null;
      if (f.note !== orig.note) patch.note = cleanNote(f.note) || null;
      if (f.done !== orig.done) patch.done = f.done;
      Object.assign(patch, placePatch(orig.place, f.place));
      if (Object.keys(patch).length === 0) { setBusy(false); onClose(); return; }
      r = await send({ op: 'task.update', id: cur.id, baseVersion: base, patch }, { quiet: true, onTakeLatest: () => onClose() });
    } else {
      const where = f.place.startsWith('p:') ? { parentId: f.place.slice(2) } : { stepId: Number(f.place.slice(2)) };
      r = await send({
        op: 'task.add', text, ...where, due: f.due || null, ...(f.start ? { start: f.start } : {}),
        ...(f.kind ? { kind: f.kind } : {}), ...(cleanNote(f.note) ? { note: cleanNote(f.note) } : {}),
      }, { quiet: true });
    }
    setBusy(false);
    if (r.ok) { onClose(); return; }
    const msg = taskErrorMessage(r);
    if (msg) setErr(msg);
  };

  const del = async () => {
    if (!cur) return;
    const ok = await confirm({
      title: isSub ? '이 세부 항목을 지울까요?' : '이 할 일을 지울까요?', body: cur.text,
      note: kidCount ? `세부 항목 ${kidCount}개도 같이 지워져요. ${TRASH_NOTE}` : TRASH_NOTE, confirmLabel: '삭제', cancelLabel: '취소', danger: true,
    });
    if (!ok) return;
    onClose();
    const r = await send({ op: 'task.delete', id: cur.id });
    if (r.ok) toast(kidCount ? `할 일 1개와 세부 항목 ${kidCount}개를 삭제했어요.` : '할 일을 삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'task.restore', id: cur.id }) } });
  };

  return (
    <form ref={boxRef} className={s.fbox} onSubmit={(e) => void submit(e)} onKeyDown={esc} autoComplete="off" aria-label={head}>
      <div className={s.fhead}><b>{head}</b></div>
      <label className={s.f}>이름
        <input ref={textRef} type="text" className={fieldCls} value={f.text} maxLength={200} placeholder="예: 서류 떼기" onChange={(e) => set('text', e.target.value)} />
      </label>
      <div className={s.two}>
        <label className={s.f}>시작일(안 적어도 돼요)
          <input type="date" className={fieldCls} value={f.start} onChange={(e) => set('start', e.target.value)} />
        </label>
        <label className={s.f}>마감일
          <input type="date" className={fieldCls} value={f.due} onChange={(e) => set('due', e.target.value)} />
        </label>
      </div>
      <label className={s.f}>종류
        <select className={fieldCls} value={f.kind} onChange={(e) => set('kind', e.target.value as TaskKind | '')}>
          <option value="">없음</option>
          {TASK_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>
      <label className={s.f}>넣을 곳
        <select className={fieldCls} value={f.place} onChange={(e) => set('place', e.target.value)}>
          <optgroup label="단계 할 일로">
            {steps.slice(0, STEP_COUNT).map((x) => <option key={x.id} value={`s:${x.id}`}>{x.id}단계 할 일 ({x.title})</option>)}
          </optgroup>
          {parents.length > 0 && (
            <optgroup label="다른 할 일의 세부 항목으로" disabled={kidCount > 0}>
              {parents.map((p) => <option key={p.id} value={`p:${p.id}`}>‘{clipLabel(p.text)}’의 세부 항목</option>)}
            </optgroup>
          )}
        </select>
        {kidCount > 0 && parents.length > 0 && <span className={s.hint}>이 할 일에 세부 항목이 달려 있어서 다른 할 일 밑에는 못 넣어요.</span>}
      </label>
      <label className={s.f}>메모
        <textarea id={noteId} className={`${fieldCls} min-h-[70px] resize-y`} rows={2} value={f.note} maxLength={1000} placeholder="전화번호 · 물어볼 것" onChange={(e) => set('note', e.target.value)} />
      </label>
      {/* 메모 칸 바로 밑 「＋ 체크 항목」(할 일 폼과 같은 단추 — 빈 체크 줄을 넣고 그 줄 끝에 커서) */}
      <CheckLineButton noteId={noteId} value={f.note} onChange={(v) => set('note', v)} className="-ml-2.5 justify-self-start" />
      {cur && (
        <label className={s.check}><input type="checkbox" checked={f.done} onChange={(e) => set('done', e.target.checked)} />끝냄</label>
      )}
      {cur && !cur.parentId && (
        <button type="button" className={s.addSub} onClick={() => onAddSub(cur.id)}><Plus />세부 항목 추가</button>
      )}
      {err && <p className={s.ferr} role="alert">{err}</p>}
      <div className={s.acts}>
        <button type="submit" className={btnPrimary} disabled={busy}>{cur ? '저장' : '추가'}</button>
        <button type="button" className={secBtn} onClick={onClose}>취소</button>
        {cur && <button type="button" className={s.ibtn} onClick={() => void del()} aria-label={`${cur.text} 삭제`}><Trash /></button>}
      </div>
      {cur && <LastEdit by={cur.updatedBy} at={cur.updatedAt} />}
    </form>
  );
}
