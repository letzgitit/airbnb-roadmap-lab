'use client';

import { useEffect, useRef, useState } from 'react';
import type { TaskItem, TaskKind } from '@/lib/core/types';
import { STEP_COUNT } from '@/lib/core/types';
import { dueLabel, todayStr } from '@/lib/client/format';
import { useProgress, type DirtyScope } from '@/components/progress/ProgressProvider';
import {
  AutoTextarea, btnGhost, btnPrimary, composerCls, dateCls, EditBadge, enterSubmit, inputCls, LastEdit, leadCls, oneLine, rowCls, rowText, textBtn,
  TRASH_NOTE, TrashButton, useBusy, useDirty, useEditing, useFormEsc,
} from '@/components/progress/bits';
import { callNumber, phonesIn, telHref } from './phone';
import { KindSelect, NoteField, OwnerSelect, type StepRef, type TaskOwner, type TaskWithNote } from './TaskComposer';

/**
 * 할 일 한 줄(홈 「할 일」과 단계 시트 「우리 할 일」이 같이 쓴다): [체크 44px] [글 + 보조 한 줄] [휴지통 44px].
 * 글을 누르면 그 자리에서 고치는 폼이 열린다(글 · 마감일 · 다른 단계로 옮기기). 지우기는 휴지통 → 확인 창 → 지움 + 8초 되돌리기 알림.
 *
 * - listStepId: 단계 시트에서 그 단계 번호. 다른 단계로 옮기면 그 목록에서 줄이 빠진다(onGone).
 *   홈(null)은 모든 단계를 한 목록에 두므로 옮겨도 줄이 남는다.
 * - showStep: 보조 줄에 「n단계 단계 이름」을 붙인다(홈).
 * - scope: 저장 안 한 입력의 범위(단계 시트 = 'modal', 홈 = 'page').
 * - inset: 카드 안이면 펼친 폼 좌우에 여백을 둔다.
 * - quietLate: 홈 「기한 지남」 묶음 안의 줄. 묶음 이름이 이미 빨강이라 날짜 보조 줄은 muted 로 둔다.
 */
export function TaskRow({ t: task, steps, listStepId, showStep = false, scope, inset = false, quietLate = false, onEditChange, onToggle, onGone }: {
  t: TaskItem; steps: StepRef[]; listStepId: number | null; showStep?: boolean; scope: DirtyScope; inset?: boolean; quietLate?: boolean;
  onEditChange: (id: string, open: boolean) => void; onToggle: (t: TaskItem) => void; onGone: () => void;
}) {
  const t = task as TaskWithNote; // 외도민판 · 지산판 같은 코드(autoFill 은 지산판에선 늘 비어 있다)
  const { send, toast, confirm } = useProgress();
  const ed = useEditing(`task:${t.id}`);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [kind, setKind] = useState<TaskKind | ''>('');
  const [note, setNote] = useState('');
  const [owner, setOwner] = useState<TaskOwner | ''>('');
  const [sid, setSid] = useState(t.stepId);
  const [moveOpen, setMoveOpen] = useState(false);
  const [base, setBase] = useState(t.version);
  const [orig, setOrig] = useState<{ text: string; due: string; kind: TaskKind | ''; owner: TaskOwner | ''; note: string; sid: number }>({ text: '', due: '', kind: '', owner: '', note: '', sid: t.stepId });
  const { busy, run } = useBusy();
  const textBtnRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const dl = dueLabel(t.due, todayStr());
  const dirty = ed.open && (text !== orig.text || due !== orig.due || kind !== orig.kind || note !== orig.note || owner !== orig.owner || sid !== orig.sid);
  useDirty(`form:task:${t.id}`, dirty, scope);
  const esc = useFormEsc(dirty, ed.stop);
  const deleted = !!t.deletedAt;
  // 내가 저장하는 동안(내가 옮기는 중일 때)엔 「다른 사람이 옮겼어요」 안내를 띄우지 않는다
  const moved = listStepId != null && !deleted && !busy && t.stepId !== listStepId;
  const stepName = steps.find((s) => s.id === t.stepId)?.title;

  // 목록에 「이 줄은 편집 중」을 알려, 상대가 지우거나 옮겨도 폼이 사라지지 않게 한다
  useEffect(() => { onEditChange(t.id, ed.open); }, [ed.open, t.id, onEditChange]);
  useEffect(() => () => onEditChange(t.id, false), [t.id, onEditChange]);
  // 폼을 닫으면(저장 · 취소) 다시 생긴 글 단추로 포커스를 돌린다
  const stays = !deleted && (listStepId == null || t.stepId === listStepId); // 이 목록에 계속 남는 줄인가
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
  const saveAsNew = () => run(() => send({ op: 'task.add', stepId: listStepId ?? sid, text, due: due || null, ...(kind ? { kind } : {}), ...(note.trim() ? { note: note.trim() } : {}), ...(owner ? { owner } : {}) }, {
    onSuccess: () => { ed.stop(); onGone(); },
  }));

  if (ed.open) {
    return (
      <li className={`border-b border-line last:border-b-0 ${inset ? 'px-3' : ''}`}>
        <div className={composerCls}>
          {deleted && <p role="alert" className="mb-2 text-base font-bold text-ink">다른 사람이 이 할 일을 삭제했어요.</p>}
          {moved && <p role="status" className="mb-2 text-base font-bold text-ink">다른 사람이 {t.stepId}단계로 옮겼어요.</p>}
          <form className="space-y-2" onKeyDown={esc} onSubmit={(e) => {
            e.preventDefault();
            if (deleted) { if (text.trim()) void saveAsNew(); return; }
            const leaving = listStepId != null && sid !== listStepId; // 다른 단계로 옮겨 저장하면 이 목록에서 줄이 사라진다
            void run(() => send({ op: 'task.update', id: t.id, baseVersion: base, patch: { text, due: due || null, stepId: sid, ...(kind !== orig.kind ? { kind: kind || null } : {}), ...(note !== orig.note ? { note: note.trim() || null } : {}), ...(owner !== orig.owner ? { owner: owner || null } : {}) } }, {
              onSuccess: () => { ed.stop(); if (leaving) onGone(); },
              onTakeLatest: (cur) => {
                const o = { text: String(cur.text ?? ''), due: String(cur.due ?? ''), kind: (cur.kind ?? '') as TaskKind | '', owner: (cur.owner ?? '') as TaskOwner | '', note: String(cur.note ?? ''), sid: typeof cur.stepId === 'number' ? cur.stepId : sid };
                setText(o.text); setDue(o.due); setKind(o.kind); setOwner(o.owner); setNote(o.note); setSid(o.sid); setOrig(o);
                setBase(Number(cur.version) || 0);
              },
            }));
          }}>
            {/* 긴 할 일도 다 보이게 글 길이에 맞춰 늘어나는 칸. Enter 로 저장(한 줄 글이라 줄바꿈은 넣지 않는다), Esc 는 취소 */}
            <AutoTextarea className={inputCls} rows={2} value={text} maxLength={200} autoFocus aria-label="할 일 내용"
              onChange={(e) => setText(oneLine(e.target.value))} onKeyDown={enterSubmit} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <label className="flex items-center gap-2 text-sm font-normal text-ink-soft">마감일
                <input type="date" className={dateCls} value={due} onChange={(e) => setDue(e.target.value)} aria-label="마감일" />
              </label>
              <KindSelect value={kind} onChange={setKind} />
              <OwnerSelect value={owner} onChange={setOwner} />
              {!deleted && !moveOpen && <button type="button" className={`${textBtn} ml-auto`} onClick={() => setMoveOpen(true)}>다른 단계로 옮기기</button>}
            </div>
            <NoteField value={note} onChange={setNote} />
            {/* 메모 속 전화번호는 눌러서 바로 건다(메모 글은 그대로) */}
            {phonesIn(note).length > 0 && (
              <p className="flex flex-wrap items-center gap-x-3 text-sm font-normal text-ink-soft">
                <span>전화 걸기</span>
                {[...new Set(phonesIn(note))].map((p) => <a key={p} href={telHref(p)} className={`${textBtn} mx-0 tabular-nums`}><i className="fas fa-phone mr-1.5" aria-hidden />{p}</a>)}
              </p>
            )}
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
        </div>
      </li>
    );
  }

  const late = !!dl?.late && !t.done;
  const call = callNumber(t.note);
  return (
    <li className={rowCls}>
      <label className={`${leadCls} cursor-pointer`}>
        <input type="checkbox" className="size-5 cursor-pointer" checked={t.done} aria-label={`${t.text} 완료`}
          onChange={(e) => { onToggle(t); void send({ op: 'task.update', id: t.id, patch: { done: e.target.checked } }); }} />
      </label>
      <button ref={textBtnRef} type="button" aria-label={`${t.text} 수정`} className="min-w-0 flex-1 py-3 text-left"
        onClick={() => {
          const o = { text: t.text, due: t.due ?? '', kind: (t.kind ?? '') as TaskKind | '', owner: (t.owner ?? '') as TaskOwner | '', note: t.note ?? '', sid: t.stepId };
          setText(o.text); setDue(o.due); setKind(o.kind); setOwner(o.owner); setNote(o.note); setSid(o.sid); setOrig(o); setBase(t.version); setMoveOpen(false); ed.start();
        }}>
        <span className={`block truncate ${rowText} ${t.done ? 'text-muted line-through' : ''}`}>{t.text}</span>
        {/* 보조 줄: 날짜(ink-soft) · 남은 날 · (홈) n단계 이름 + 상대가 편집 중일 때의 표시. 항목 사이는 점 없이 12px 간격. 다 없으면 줄 자체가 없다.
            「n일 지남」 빨강은 기한 지남 묶음 밖에서만(quietLate = 묶음 이름이 이미 빨강으로 말하므로 줄은 muted) */}
        <span className="mt-0.5 flex min-w-0 items-center gap-x-3 text-sm font-normal text-muted empty:hidden">
          {dl && <span className={`shrink-0 whitespace-nowrap ${t.done || quietLate ? '' : 'text-ink-soft'}`}>{dl.date}</span>}
          {dl && <span className={`shrink-0 whitespace-nowrap ${late && !quietLate ? 'text-danger-ink' : ''}`}>{dl.rel}</span>}
          {t.kind && <span className="shrink-0 whitespace-nowrap">{t.kind}</span>}
          {t.autoFill && <span className="shrink-0 whitespace-nowrap" title="단계 · 종류를 자동으로 골랐어요. 누르면 바꿀 수 있어요">자동으로 고름</span>}
          {t.owner && <span className="shrink-0 whitespace-nowrap">{t.owner}</span>}
          {t.note && <span className="shrink-0" title="메모 있음"><i className="far fa-note-sticky" aria-hidden /><span className="sr-only">메모 있음</span></span>}
          {showStep && <span className="min-w-0 truncate">{t.stepId}단계{stepName ? ` ${stepName}` : ''}</span>}
          <EditBadge k={`task:${t.id}`} />
        </span>
      </button>
      {/* 메모 첫 줄이 「전화 …」면 줄을 펼치지 않아도 바로 걸 수 있게 전화 단추(그 메모의 첫 번호) */}
      {call && (
        <a href={telHref(call)} aria-label={`${t.text} 전화 걸기 ${call}`}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-accent-ink transition-colors hover:bg-sunken">
          <i className="fas fa-phone" aria-hidden />
        </a>
      )}
      <TrashButton label={`${t.text} 삭제`} onClick={() => void del()} />
    </li>
  );
}
