'use client';

import { useState } from 'react';
import { STEP_COUNT, TASK_KINDS, TASK_OWNERS, type TaskItem, type TaskKind, type TaskOwner } from '@/lib/core/types';
import { useProgress, type DirtyScope } from '@/components/progress/ProgressProvider';
import {
  AutoTextarea, btnGhost, btnPrimary, composerCls, dateCls, enterSubmit, inputCls, oneLine, useBusy, useDirty, useFormEsc,
} from '@/components/progress/bits';
import { START_AFTER_DUE, taskErrorMessage } from './task-errors';

export interface StepRef { id: number; title: string }

// 할 일 메모 · 담당 · 자동 분류 표시는 데이터(lib/core/types 의 TaskItem)에 있다. 지산판과 같은 줄 코드를 쓰려고 이름만 다시 내보낸다.
export { TASK_OWNERS, type TaskOwner } from '@/lib/core/types';
export type TaskWithNote = TaskItem;
export const NOTE_MAX = 1000;

/** 담당 고르기(선택). 빈 값 = 안 정함. 「같이」는 남편 · 아내 걸러 보기 둘 다에 보인다. */
export function OwnerSelect({ value, onChange }: { value: TaskOwner | ''; onChange: (v: TaskOwner | '') => void }) {
  return (
    <label className={`flex items-center gap-2 ${labelCls}`}>담당
      <select className={dateCls} value={value} onChange={(e) => onChange(e.target.value as TaskOwner | '')} aria-label="담당">
        <option value="">안 정함</option>
        {TASK_OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

/** 메모 칸(새 할 일 · 고치는 폼 공용). 여러 줄, 자세한 내용은 여기에 — 할 일 제목은 한 줄로 짧게. */
export function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className={`block ${labelCls}`}>메모
      <AutoTextarea className={`${inputCls} mt-1`} rows={2} value={value} maxLength={NOTE_MAX} placeholder="자세한 내용(선택)"
        onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const labelCls = 'text-sm font-normal text-ink-soft';
/** 쉬운 모양 이름표: 고정 폭 칸이라 입력칸 왼쪽 끝이 한 줄로 맞는다 */
const simpleLabelCls = `w-28 shrink-0 ${labelCls}`;
/** 쉬운 모양 날짜 칸: 남은 폭을 채우고, 날짜가 다 보일 폭(11rem)이 안 남으면 이름표 밑 줄로 내려간다(좁은 카드 안 폼) */
const dateFitCls = `${dateCls} block w-full min-w-[11rem] flex-1 basis-[11rem]`;

/**
 * 쉬운 모양(새 홈)의 날짜 칸 + 「물어봐야 하는 일」: [언제부터(선택)] [언제까지] 두 줄(이름표는 고정 폭) + 켜기 칸 한 줄(밑에 작은 설명).
 * 데이터는 시작일(start) · 마감일(due) 그대로, 문의 필요 = 할 일 종류 「문의」. 담당(owner)은 쉬운 모양에서 보이지 않는다(값은 그대로).
 * 새 할 일 폼 · 고치는 폼이 같이 쓴다.
 */
export function SimpleWhenFields({ start, onStart, due, onDue, ask, onAsk }: {
  start: string; onStart: (v: string) => void; due: string; onDue: (v: string) => void; ask: boolean; onAsk: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      {/* 이름표는 고정 폭, 입력칸은 남은 폭을 채운다. 좁은 카드 안 폼이면 입력칸이 이름표 밑 줄로 내려가 폼 밖으로 나가지 않는다 */}
      <label className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><span className={simpleLabelCls}>언제부터(선택)</span>
        <input type="date" className={dateFitCls} value={start} onChange={(e) => onStart(e.target.value)} />
      </label>
      <label className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><span className={simpleLabelCls}>언제까지</span>
        <input type="date" className={dateFitCls} value={due} onChange={(e) => onDue(e.target.value)} />
      </label>
      {/* 「문의 필요」 켜기(2026-10-28 — 줄 꼬리표 · 거르기 단추와 같은 이름, 밑 설명 글이 무엇인지 말한다). 켜면 줄에 「문의 필요」 꼬리표 */}
      <label className="flex cursor-pointer items-start gap-3 py-1">
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-ink">문의 필요</span>
          <span className="mt-0.5 block text-sm font-normal text-sub">구청이나 업체에 물어볼 게 있으면 켜요. 물을 내용은 메모에 적어요.</span>
        </span>
        <span className="relative mt-0.5 inline-flex h-11 shrink-0 items-center">
          <input type="checkbox" role="switch" className="peer sr-only" checked={ask} onChange={(e) => onAsk(e.target.checked)} />
          <span className="h-7 w-12 rounded-full bg-strong transition-colors peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-ink" aria-hidden />
          <span className="absolute left-1 size-5 rounded-full bg-surface shadow-sm transition-transform peer-checked:translate-x-5" aria-hidden />
        </span>
      </label>
    </div>
  );
}

/** 할 일 종류 고르기(선택). 빈 값 = 종류 없음. 새 할 일 · 고치는 폼이 같이 쓴다. */
export function KindSelect({ value, onChange }: { value: TaskKind | ''; onChange: (v: TaskKind | '') => void }) {
  return (
    <label className={`flex items-center gap-2 ${labelCls}`}>종류
      <select className={dateCls} value={value} onChange={(e) => onChange(e.target.value as TaskKind | '')} aria-label="종류">
        <option value="">없음</option>
        {TASK_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
    </label>
  );
}

/**
 * 새 할 일 입력: 목록 첫 줄 「＋ 할 일 추가」를 누르면 그 자리에서 펼쳐진다. Enter = 추가, Esc = 취소(쓰던 글이 있으면 확인).
 * steps 를 주면(홈) 「단계」를 고르는 칸이 생기고 기본값은 stepId(지금 단계)다. 안 주면(단계 시트) stepId 로 고정.
 * initialDue: 마감일 칸의 처음 값(홈 타임라인에서 고른 날). 처음 값 그대로면 「쓰던 글」로 보지 않는다.
 * parentId: 주면 그 할 일의 세부 항목으로 더한다(단계는 서버가 부모를 따른다 — stepId 를 보내지 않고 단계 칸도 없다).
 *   parentTitle 은 폼 위 「‘제목’의 세부 항목」 안내에 쓴다.
 * 저장 거절(시작일 > 마감일 · 부모 문제)은 알림 대신 폼 안 빨강 한 줄로 적는다(send quiet).
 */
export function TaskComposer({ stepId, steps, scope, onClose, initialDue = '', parentId, parentTitle, simple = false, prepare, dirtyKey }: {
  stepId: number; steps?: StepRef[]; scope: DirtyScope; onClose: () => void; initialDue?: string; parentId?: string; parentTitle?: string;
  /** 새 홈(한눈에 보기)의 쉬운 폼: 제목 · 언제부터(시작일) · 언제까지(마감일) · 문의 필요 · 메모만(종류 · 담당 칸 없음) */
  simple?: boolean;
  /** 보내기 직전에 제목 · 종류를 바꾼다(새 홈 낱말 카드: 「욕실: …」처럼 카드 이름을 앞에 붙여 그 카드에 남게) */
  prepare?: (text: string, kind: TaskKind | '') => { text: string; kind: TaskKind | '' };
  /** 저장 안 한 입력 표시의 이름(한 화면에 폼이 여럿일 때 서로 덮지 않게) */
  dirtyKey?: string;
}) {
  const { send } = useProgress();
  const [text, setText] = useState('');
  const [start, setStart] = useState('');
  const [due, setDue] = useState(initialDue);
  const [note, setNote] = useState('');
  const [owner, setOwner] = useState<TaskOwner | ''>('');
  const [kind, setKind] = useState<TaskKind | ''>('');
  const [sid, setSid] = useState(stepId);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useBusy();
  const dirty = text.trim() !== '' || start !== '' || due !== initialDue || kind !== '' || owner !== '' || note.trim() !== '';
  useDirty(dirtyKey ?? `form:add-task:${parentId ? `sub:${parentId}` : steps ? 'home' : stepId}`, dirty, scope);
  const esc = useFormEsc(dirty, onClose);
  return (
    <form className={composerCls} onKeyDown={esc} onSubmit={(e) => {
      e.preventDefault();
      if (!text.trim()) return;
      if (start && due && start > due) { setErr(START_AFTER_DUE); return; }
      setErr(null);
      const where = parentId ? { parentId } : { stepId: sid };
      const ready = prepare ? prepare(text.trim(), kind) : { text, kind };
      void run(() => send({ op: 'task.add', ...where, text: ready.text, due: due || null, ...(start ? { start } : {}), ...(ready.kind ? { kind: ready.kind } : {}), ...(note.trim() ? { note: note.trim() } : {}), ...(owner ? { owner } : {}) }, {
        quiet: true,
        onSuccess: () => { setText(''); setStart(''); setDue(initialDue); setKind(''); setOwner(''); setNote(''); onClose(); },
      }).then((r) => setErr(taskErrorMessage(r))));
    }}>
      {parentId && <p className={labelCls}>‘{parentTitle ?? '위 할 일'}’의 세부 항목</p>}
      <AutoTextarea className={inputCls} value={text} maxLength={200} autoFocus aria-label="새 할 일" placeholder="짧게 한 줄로(자세한 건 메모에)"
        onChange={(e) => setText(oneLine(e.target.value))} onKeyDown={enterSubmit} />
      {steps && !parentId && (
        <label className={`block ${labelCls}`}>단계
          <select className={`${inputCls} mt-1`} value={sid} onChange={(e) => setSid(Number(e.target.value))}>
            {steps.slice(0, STEP_COUNT).map((s) => <option key={s.id} value={s.id}>{s.id}. {s.title}</option>)}
          </select>
        </label>
      )}
      {simple ? <SimpleWhenFields start={start} onStart={setStart} due={due} onDue={setDue} ask={kind === '문의'} onAsk={(v) => setKind(v ? '문의' : '')} /> : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className={`flex items-center gap-2 ${labelCls}`}>시작일
            <input type="date" className={dateCls} value={start} onChange={(e) => setStart(e.target.value)} aria-label="시작일" />
          </label>
          <label className={`flex items-center gap-2 ${labelCls}`}>마감일
            <input type="date" className={dateCls} value={due} onChange={(e) => setDue(e.target.value)} aria-label="마감일" />
          </label>
          <KindSelect value={kind} onChange={setKind} />
          <OwnerSelect value={owner} onChange={setOwner} />
        </div>
      )}
      <NoteField value={note} onChange={setNote} />
      {err && <p role="alert" className="text-sm font-normal text-danger-ink">{err}</p>}
      <div className="flex justify-end">
        <div className="flex gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>취소</button>
          <button className={btnPrimary} disabled={busy || !text.trim()}>추가</button>
        </div>
      </div>
    </form>
  );
}
