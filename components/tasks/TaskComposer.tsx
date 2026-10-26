'use client';

import { useState } from 'react';
import { STEP_COUNT, TASK_KINDS, type TaskKind } from '@/lib/core/types';
import { useProgress, type DirtyScope } from '@/components/progress/ProgressProvider';
import {
  AutoTextarea, btnGhost, btnPrimary, composerCls, dateCls, enterSubmit, inputCls, oneLine, useBusy, useDirty, useFormEsc,
} from '@/components/progress/bits';

export interface StepRef { id: number; title: string }

const labelCls = 'text-sm font-normal text-ink-soft';

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
 */
export function TaskComposer({ stepId, steps, scope, onClose }: {
  stepId: number; steps?: StepRef[]; scope: DirtyScope; onClose: () => void;
}) {
  const { send } = useProgress();
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [kind, setKind] = useState<TaskKind | ''>('');
  const [sid, setSid] = useState(stepId);
  const { busy, run } = useBusy();
  const dirty = text.trim() !== '' || due !== '' || kind !== '';
  useDirty(`form:add-task:${steps ? 'home' : stepId}`, dirty, scope);
  const esc = useFormEsc(dirty, onClose);
  return (
    <form className={composerCls} onKeyDown={esc} onSubmit={(e) => {
      e.preventDefault();
      if (!text.trim()) return;
      void run(() => send({ op: 'task.add', stepId: sid, text, due: due || null, ...(kind ? { kind } : {}) }, { onSuccess: () => { setText(''); setDue(''); setKind(''); onClose(); } }));
    }}>
      <AutoTextarea className={inputCls} value={text} maxLength={200} autoFocus aria-label="새 할 일" placeholder="할 일을 적어 주세요"
        onChange={(e) => setText(oneLine(e.target.value))} onKeyDown={enterSubmit} />
      {steps && (
        <label className={`block ${labelCls}`}>단계
          <select className={`${inputCls} mt-1`} value={sid} onChange={(e) => setSid(Number(e.target.value))}>
            {steps.slice(0, STEP_COUNT).map((s) => <option key={s.id} value={s.id}>{s.id}. {s.title}</option>)}
          </select>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className={`flex items-center gap-2 ${labelCls}`}>마감일
          <input type="date" className={dateCls} value={due} onChange={(e) => setDue(e.target.value)} aria-label="마감일" />
        </label>
        <KindSelect value={kind} onChange={setKind} />
        <div className="ml-auto flex gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>취소</button>
          <button className={btnPrimary} disabled={busy || !text.trim()}>추가</button>
        </div>
      </div>
    </form>
  );
}
