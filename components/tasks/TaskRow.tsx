'use client';

import { useEffect, useRef, useState } from 'react';
import type { TaskItem, TaskKind } from '@/lib/core/types';
import { STEP_COUNT } from '@/lib/core/types';
import { dueLabel, todayStr } from '@/lib/client/format';
import { useProgress, type DirtyScope } from '@/components/progress/ProgressProvider';
import { liveChildrenOf } from '@/lib/core/task-tree';
import {
  AutoTextarea, btnGhost, btnPrimary, clipLabel, composerCls, dateCls, EditBadge, enterSubmit, inputCls, LastEdit, leadCls, oneLine, rowCls, rowText, textBtn,
  TRASH_NOTE, TrashButton, useBusy, useDirty, useEditing, useFormEsc,
} from '@/components/progress/bits';
import { callNumber, phonesIn, telHref } from './phone';
import { START_AFTER_DUE, taskErrorMessage } from './task-errors';
import { PHASE_WORD, placeOf, placePatch, placeStep, spanDate, taskPhase } from './task-view';
import { KindSelect, NoteField, OwnerSelect, SimpleWhenFields, type StepRef, type TaskOwner, type TaskWithNote } from './TaskComposer';
import { TaskPhotos } from './TaskPhotos';
import { usePhotos } from '@/components/progress/PhotosPanel';

/**
 * 할 일 한 줄(홈 「할 일」과 단계 시트 「우리 할 일」이 같이 쓴다): [체크 44px] [글 + 보조 한 줄] [휴지통 44px].
 * 글을 누르면 그 자리에서 고치는 폼이 열린다(글 · 시작일 · 마감일 · 넣을 곳). 지우기는 휴지통 → 확인 창 → 지움 + 8초 되돌리기 알림.
 * 넣을 곳 = 「n단계 할 일」(어느 단계든) 또는 같은 단계 맨 위 할 일의 「‘제목’의 세부 항목」(한 층만).
 *   세부 항목이 달린 할 일은 다른 할 일 밑으로 못 넣는다(그 선택지는 꺼 둔다). 부모를 지우면 세부 항목도 같이 지워진다(서버).
 * 저장 거절(시작일 > 마감일 · 넣을 곳 문제)은 알림 대신 폼 안 빨강 한 줄로 적는다(send quiet).
 *
 * - listStepId: 단계 시트에서 그 단계 번호. 다른 단계로 옮기면 그 목록에서 줄이 빠진다(onGone).
 *   홈(null)은 모든 단계를 한 목록에 두므로 옮겨도 줄이 남는다.
 * - showStep: 보조 줄에 「n단계 단계 이름」을 붙인다(홈).
 * - scope: 저장 안 한 입력의 범위(단계 시트 = 'modal', 홈 = 'page').
 * - inset: 카드 안이면 펼친 폼 좌우에 여백을 둔다.
 * - quietLate: 홈 「기한 지남」 묶음 안의 줄. 묶음 이름이 이미 빨강이라 날짜 보조 줄은 muted 로 둔다.
 * - depth: 1 = 부모 바로 밑의 세부 항목 줄(앞 칸을 24px 들여 쓰고 글자를 한 단계 작게).
 * - parentTitle: 부모가 이 목록에 없는 세부 항목이면 부모 제목(보조 줄에 「‘부모 제목’의 세부 항목」).
 * - simple: 새 홈(한눈에 보기)의 쉬운 모양. 제목을 누르면 메모만 펼치고 접는다 — 고치기는 오른쪽 연필 단추(44px)로만.
 *   고치는 폼은 제목 · 언제부터(선택) · 언제까지 · 문의 필요(종류 「문의」) · 메모만(종류 · 담당 · 넣을 곳은 숨김, 값은 그대로).
 *   보조 줄: 날짜 · 남은 날 배지(지남 빨강 면 · 3일 안 진한 면 · 그 밖 옅은 면) · 「지금 할 때」(시작일 ~ 마감 사이, muted 400) · 「문의 필요」 배지.
 * - noTrash: 휴지통 없이 체크 · 고치기만(새 홈 「일주일 안에 할 일」 묶음 — 지우기는 아래 카드에서).
 */
type Form = { text: string; start: string; due: string; kind: TaskKind | ''; owner: TaskOwner | ''; note: string; place: string };

export function TaskRow({ t: task, steps, listStepId, showStep = false, scope, inset = false, quietLate = false, depth = 0, parentTitle, simple = false, noTrash = false, onEditChange, onToggle, onGone }: {
  t: TaskItem; steps: StepRef[]; listStepId: number | null; showStep?: boolean; scope: DirtyScope; inset?: boolean; quietLate?: boolean;
  depth?: 0 | 1; parentTitle?: string; simple?: boolean; noTrash?: boolean;
  onEditChange: (id: string, open: boolean) => void; onToggle: (t: TaskItem) => void; onGone: () => void;
}) {
  const t = task as TaskWithNote; // 외도민판 · 지산판 같은 코드(autoFill 은 지산판에선 늘 비어 있다)
  const { doc, send, toast, confirm } = useProgress();
  const { taskPhotos } = usePhotos();
  const ed = useEditing(`task:${t.id}`);
  const [text, setText] = useState('');
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [kind, setKind] = useState<TaskKind | ''>('');
  const [note, setNote] = useState('');
  const [owner, setOwner] = useState<TaskOwner | ''>('');
  const [place, setPlace] = useState(placeOf(t));
  const [err, setErr] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [base, setBase] = useState(t.version);
  const [orig, setOrig] = useState<Form>({ text: '', start: '', due: '', kind: '', owner: '', note: '', place: placeOf(t) });
  const { busy, run } = useBusy();
  const textBtnRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const dl = dueLabel(t.due, todayStr());
  const dateText = spanDate(t.start, t.due) ?? dl?.date;
  const dirty = ed.open && (text !== orig.text || start !== orig.start || due !== orig.due || kind !== orig.kind || note !== orig.note || owner !== orig.owner || place !== orig.place);
  const fill = (o: Form) => { setText(o.text); setStart(o.start); setDue(o.due); setKind(o.kind); setOwner(o.owner); setNote(o.note); setPlace(o.place); setOrig(o); };
  const formOf = (c: Record<string, unknown>): Form => ({
    text: String(c.text ?? ''), start: String(c.start ?? ''), due: String(c.due ?? ''), kind: (c.kind ?? '') as TaskKind | '', owner: (c.owner ?? '') as TaskOwner | '', note: String(c.note ?? ''),
    place: placeOf({ stepId: typeof c.stepId === 'number' ? c.stepId : t.stepId, parentId: typeof c.parentId === 'string' ? c.parentId : null }),
  });
  const tasks = doc?.tasks ?? {};
  const kidCount = doc ? liveChildrenOf(doc, t.id).length : 0;
  // 세부 항목으로 넣을 수 있는 곳: 같은 단계의 지우지 않은 맨 위 할 일(자기 자신 제외), 마감순
  const parents = Object.values(tasks)
    .filter((p) => !p.deletedAt && !p.parentId && p.stepId === t.stepId && p.id !== t.id)
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt.localeCompare(b.createdAt));
  // 지금 부모가 목록에 없으면(그 사이 지워짐 등) 지금 값이 select 에서 사라지지 않게 따로 둔다
  const lostParent = orig.place.startsWith('p:') && !parents.some((p) => `p:${p.id}` === orig.place) ? orig.place.slice(2) : null;
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
    const note = kidCount > 0 ? `세부 항목 ${kidCount}개도 같이 지워져요. ${TRASH_NOTE}` : TRASH_NOTE;
    const ok = await confirm({ title: '이 할 일을 지울까요?', body: t.text, note, confirmLabel: '삭제', cancelLabel: '취소', danger: true });
    if (!ok) return;
    void send({ op: 'task.delete', id: t.id }).then((r) => {
      if (r.ok) toast('할 일을 삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'task.restore', id: t.id }) } });
    });
    onGone();
  };
  // 시작일 > 마감일이면 보내지 않고 폼 안에 적는다
  const spanBad = () => { if (start && due && start > due) { setErr(START_AFTER_DUE); return true; } setErr(null); return false; };
  // 상대가 지운 글을 내 폼 내용 그대로 새 할 일로 올린다(세부 항목이었으면 같은 부모 밑으로)
  const saveAsNew = () => {
    if (spanBad()) return;
    const where = place.startsWith('p:') ? { parentId: place.slice(2) } : { stepId: listStepId ?? placeStep(place, tasks) ?? t.stepId };
    void run(() => send({ op: 'task.add', ...where, text, due: due || null, ...(start ? { start } : {}), ...(kind ? { kind } : {}), ...(note.trim() ? { note: note.trim() } : {}), ...(owner ? { owner } : {}) }, {
      quiet: true, onSuccess: () => { ed.stop(); onGone(); },
    }).then((r) => setErr(taskErrorMessage(r))));
  };

  if (ed.open) {
    return (
      <li className={`border-b border-line last:border-b-0 ${inset ? 'px-3' : ''}`}>
        <div className={composerCls}>
          {deleted && <p role="alert" className="mb-2 text-base font-bold text-ink">다른 사람이 이 할 일을 삭제했어요.</p>}
          {moved && <p role="status" className="mb-2 text-base font-bold text-ink">다른 사람이 {t.stepId}단계로 옮겼어요.</p>}
          <form className="space-y-2" onKeyDown={esc} onSubmit={(e) => {
            e.preventDefault();
            if (deleted) { if (text.trim()) saveAsNew(); return; }
            if (spanBad()) return;
            const nextStep = placeStep(place, tasks);
            const leaving = listStepId != null && nextStep != null && nextStep !== listStepId; // 다른 단계로 옮겨 저장하면 이 목록에서 줄이 사라진다
            const patch = {
              text, due: due || null,
              ...(start !== orig.start ? { start: start || null } : {}),
              ...placePatch(orig.place, place),
              ...(kind !== orig.kind ? { kind: kind || null } : {}), ...(note !== orig.note ? { note: note.trim() || null } : {}), ...(owner !== orig.owner ? { owner: owner || null } : {}),
            };
            void run(() => send({ op: 'task.update', id: t.id, baseVersion: base, patch }, {
              quiet: true,
              onSuccess: () => { ed.stop(); if (leaving) onGone(); },
              onTakeLatest: (cur) => { fill(formOf(cur)); setBase(Number(cur.version) || 0); },
            }).then((r) => setErr(taskErrorMessage(r))));
          }}>
            {/* 긴 할 일도 다 보이게 글 길이에 맞춰 늘어나는 칸. Enter 로 저장(한 줄 글이라 줄바꿈은 넣지 않는다), Esc 는 취소 */}
            <AutoTextarea className={inputCls} rows={2} value={text} maxLength={200} autoFocus aria-label="할 일 내용"
              onChange={(e) => setText(oneLine(e.target.value))} onKeyDown={enterSubmit} />
            {/* 쉬운 모양: 언제부터(선택) · 언제까지를 고정 폭 이름표로 한 줄씩 + 문의 필요(종류 「문의」 — 끄면 원래 종류로) */}
            {simple ? (
              <SimpleWhenFields start={start} onStart={setStart} due={due} onDue={setDue}
                ask={kind === '문의'} onAsk={(v) => setKind(v ? '문의' : orig.kind === '문의' ? '' : orig.kind)} />
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <label className="flex items-center gap-2 text-sm font-normal text-ink-soft">시작일
                  <input type="date" className={dateCls} value={start} onChange={(e) => setStart(e.target.value)} aria-label="시작일" />
                </label>
                <label className="flex items-center gap-2 text-sm font-normal text-ink-soft">마감일
                  <input type="date" className={dateCls} value={due} onChange={(e) => setDue(e.target.value)} aria-label="마감일" />
                </label>
                <KindSelect value={kind} onChange={setKind} />
                <OwnerSelect value={owner} onChange={setOwner} />
              </div>
            )}
            {!deleted && !simple && (
              <label className="block text-sm font-normal text-ink-soft">넣을 곳
                <select className={`${inputCls} mt-1`} value={place} onChange={(e) => setPlace(e.target.value)} aria-label="넣을 곳">
                  <optgroup label="단계 할 일로">
                    {steps.slice(0, STEP_COUNT).map((s) => <option key={s.id} value={`s:${s.id}`}>{s.id}단계 할 일 ({s.title})</option>)}
                  </optgroup>
                  {(parents.length > 0 || lostParent) && (
                    <optgroup label="다른 할 일의 세부 항목으로" disabled={kidCount > 0}>
                      {lostParent && <option value={`p:${lostParent}`}>‘{clipLabel(tasks[lostParent]?.text ?? '위 할 일')}’의 세부 항목</option>}
                      {parents.map((p) => <option key={p.id} value={`p:${p.id}`}>‘{clipLabel(p.text)}’의 세부 항목</option>)}
                    </optgroup>
                  )}
                </select>
                {kidCount > 0 && parents.length > 0 && <span className="mt-1 block text-muted">이 할 일에 세부 항목이 달려 있어서 다른 할 일 밑에는 못 넣어요.</span>}
              </label>
            )}
            <NoteField value={note} onChange={setNote} />
            {/* 쉬운 모양: 메모 사진도 여기서 붙인다(바로 올라가고, 저장 단추와 상관없다) */}
            {simple && !deleted && <TaskPhotos taskId={t.id} stepId={t.stepId} />}
            {/* 메모 속 전화번호는 눌러서 바로 건다(메모 글은 그대로) */}
            {phonesIn(note).length > 0 && (
              <p className="flex flex-wrap items-center gap-x-3 text-sm font-normal text-ink-soft">
                <span>전화 걸기</span>
                {[...new Set(phonesIn(note))].map((p) => <a key={p} href={telHref(p)} className={`${textBtn} mx-0 tabular-nums`}><i className="fas fa-phone mr-1.5" aria-hidden />{p}</a>)}
              </p>
            )}
            {err && <p role="alert" className="text-sm font-normal text-danger-ink">{err}</p>}
            {deleted ? (
              <div className="flex items-center justify-end gap-2">
                <button type="button" className={btnGhost} onClick={() => { ed.stop(); onGone(); }}>닫기</button>
                <button type="button" className={btnPrimary} disabled={busy || !text.trim()} onClick={saveAsNew}>새 할 일로 저장</button>
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
  const startEdit = () => { fill(formOf(t as unknown as Record<string, unknown>)); setErr(null); setBase(t.version); ed.start(); };
  if (simple) {
    // 보조 줄: 날짜(ink-soft) · 남은 날 배지(기한 지남 = 빨강 면 흰 글자 · 3일 안 = 진한 면 · 그 밖 = 옅은 회색 면) · 「지금 할 때」(muted 400) · 「문의 필요」 배지.
    // 누르지 못하는 표시라 청록을 쓰지 않는다. 「곧 마감」은 진한 배지가 말하므로 글자로 다시 쓰지 않는다. 담당은 쉬운 모양에서 보이지 않는다(값은 그대로).
    const phase = taskPhase(t, todayStr());
    const badgeTone = late ? 'bg-danger text-on-accent' : phase === 'soon' ? 'bg-ink text-surface' : 'bg-sunken text-ink-soft';
    const noteLines = (t.note ?? '').trim();
    const firstLine = noteLines.split('\n')[0];
    const photoN = taskPhotos.filter((p) => p.taskId === t.id).length;
    const more = noteLines.includes('\n') || firstLine.length > 40 || photoN > 0;
    const hasMemo = !!noteLines || photoN > 0;
    const ask = t.kind === '문의';
    const titleCls = `block break-words ${depth ? 'text-sm font-normal text-ink' : rowText} ${t.done ? 'text-muted line-through' : ''}`;
    const sub = (
      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-normal text-muted empty:hidden">
        {dateText && <span className={`whitespace-nowrap tabular-nums ${t.done ? '' : 'text-ink-soft'}`}>{dateText}</span>}
        {dl && !t.done && <span className={`whitespace-nowrap rounded-control px-1.5 py-0.5 text-xs font-bold tabular-nums ${badgeTone}`}>{dl.rel}</span>}
        {phase === 'prep' && <span className="whitespace-nowrap font-normal text-muted">{PHASE_WORD.prep}</span>}
        {ask && !t.done && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-control border border-line-strong bg-surface px-1.5 py-0.5 text-xs font-bold text-ink">
            <i className="fas fa-circle-question" aria-hidden />문의 필요
          </span>
        )}
        {parentTitle && <span className="min-w-0 truncate">‘{parentTitle}’의 세부 항목</span>}
        <EditBadge k={`task:${t.id}`} />
      </span>
    );
    return (
      <li className={`${rowCls} flex-wrap`}>
        <label className={`${leadCls} cursor-pointer ${depth ? 'ml-6' : ''}`}>
          <input type="checkbox" className="size-5 cursor-pointer" checked={t.done} aria-label={`${t.text} 완료`}
            onChange={(e) => { onToggle(t); void send({ op: 'task.update', id: t.id, patch: { done: e.target.checked } }); }} />
        </label>
        <div className="min-w-0 flex-1">
          {/* 제목을 누르면 메모만 펼치고 접는다(고치기는 오른쪽 연필 단추). 메모도 사진도 없으면 누르는 것이 아니다 */}
          {hasMemo ? (
            <button type="button" aria-expanded={noteOpen} className="block w-full py-3 text-left" onClick={() => setNoteOpen((v) => !v)}>
              <span className={titleCls}>{t.text}</span>
              {sub}
              <span className="sr-only">{noteOpen ? '메모 접기' : '메모 펼치기'}</span>
            </button>
          ) : (
            <div className="py-3"><span className={titleCls}>{t.text}</span>{sub}</div>
          )}
          {/* 메모: 접힌 채 첫 줄만 살짝(사진이 있으면 「사진 n」). 펼치면 15px · 행간 1.7 · 문단마다 간격 · 한 줄 최대 약 36em,
              메모 사진 · 「사진 추가」, 속 전화번호는 바로 건다. 메모도 사진도 없는 할 일은 고치는 폼에서 사진을 붙인다 */}
          {hasMemo && !noteOpen && (
              <button type="button" aria-expanded="false" aria-label={`메모 펼치기: ${firstLine || `사진 ${photoN}장`}`} onClick={() => setNoteOpen(true)}
                className="-mt-2 flex min-h-11 w-full items-center gap-1.5 pb-1 text-left text-sm font-normal text-muted">
                <i className={`${noteLines ? 'far fa-note-sticky' : 'far fa-image'} shrink-0`} aria-hidden />
                {noteLines && <span className="min-w-0 truncate">{firstLine}</span>}
                {photoN > 0 && <span className="shrink-0 whitespace-nowrap">{noteLines && <i className="far fa-image mr-1" aria-hidden />}사진 {photoN}</span>}
                {more && <i className="fas fa-chevron-down shrink-0 text-xs" aria-hidden />}
              </button>
          )}
        </div>
        {call && (
          <a href={telHref(call)} aria-label={`${t.text} 전화 걸기 ${call}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-accent-ink transition-colors hover:bg-sunken">
            <i className="fas fa-phone" aria-hidden />
          </a>
        )}
        <button ref={textBtnRef} type="button" aria-label={`${t.text} 고치기`} onClick={startEdit}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sunken">
          <i className="fas fa-pen text-base" aria-hidden />
        </button>
        {noTrash ? <span className="w-2 shrink-0" aria-hidden /> : <TrashButton label={`${t.text} 삭제`} onClick={() => void del()} />}
        {/* 펼친 메모는 단추 줄 밑에 줄 폭 그대로(체크 칸만큼 들여): 15px · 행간 1.7 · 문단마다 간격 · 한 줄 최대 약 36em,
            낱말 · 전화번호는 중간에 끊지 않는다(break-keep). 메모 사진 · 「사진 추가」, 속 전화번호는 바로 건다 */}
        {hasMemo && noteOpen && (
          <div className={`w-full pb-3 pr-4 ${depth ? 'pl-[68px]' : 'pl-11'}`}>
            {noteLines && (
              <div className="max-w-[36em] space-y-2 break-keep text-base font-normal leading-[1.7] text-ink-soft [overflow-wrap:anywhere]">
                {noteLines.split(/\n+/).map((para, i) => <p key={i} className="whitespace-pre-wrap">{para}</p>)}
              </div>
            )}
            <TaskPhotos taskId={t.id} stepId={t.stepId} />
            <div className="flex flex-wrap items-center gap-x-4">
              {[...new Set(phonesIn(noteLines))].map((p) => <a key={p} href={telHref(p)} className={`${textBtn} mx-0 tabular-nums`}><i className="fas fa-phone mr-1.5" aria-hidden />{p}</a>)}
              <button type="button" className={`${textBtn} mx-0`} aria-expanded="true" onClick={() => setNoteOpen(false)}>메모 접기</button>
            </div>
          </div>
        )}
      </li>
    );
  }
  return (
    <li className={rowCls}>
      <label className={`${leadCls} cursor-pointer ${depth ? 'ml-6' : ''}`}>
        <input type="checkbox" className="size-5 cursor-pointer" checked={t.done} aria-label={`${t.text} 완료`}
          onChange={(e) => { onToggle(t); void send({ op: 'task.update', id: t.id, patch: { done: e.target.checked } }); }} />
      </label>
      <button ref={textBtnRef} type="button" aria-label={`${t.text} 수정`} className="min-w-0 flex-1 py-3 text-left"
        onClick={() => { fill(formOf(t as unknown as Record<string, unknown>)); setErr(null); setBase(t.version); ed.start(); }}>
        <span className={`block truncate ${depth ? 'text-sm font-normal text-ink' : rowText} ${t.done ? 'text-muted line-through' : ''}`}>{t.text}</span>
        {/* 보조 줄: 날짜(ink-soft) · 남은 날 · (홈) n단계 이름 + 상대가 편집 중일 때의 표시. 항목 사이는 점 없이 12px 간격. 다 없으면 줄 자체가 없다.
            「n일 지남」 빨강은 기한 지남 묶음 밖에서만(quietLate = 묶음 이름이 이미 빨강으로 말하므로 줄은 muted) */}
        <span className="mt-0.5 flex min-w-0 items-center gap-x-3 text-sm font-normal text-muted empty:hidden">
          {dateText && <span className={`shrink-0 whitespace-nowrap ${t.done || quietLate ? '' : 'text-ink-soft'}`}>{dateText}</span>}
          {dl && <span className={`shrink-0 whitespace-nowrap ${late && !quietLate ? 'text-danger-ink' : ''}`}>{dl.rel}</span>}
          {t.kind && <span className="shrink-0 whitespace-nowrap">{t.kind}</span>}
          {t.autoFill && <span className="shrink-0 whitespace-nowrap" title="단계 · 종류를 자동으로 골랐어요. 누르면 바꿀 수 있어요">자동으로 고름</span>}
          {t.owner && <span className="shrink-0 whitespace-nowrap">{t.owner}</span>}
          {t.note && <span className="shrink-0" title="메모 있음"><i className="far fa-note-sticky" aria-hidden /><span className="sr-only">메모 있음</span></span>}
          {parentTitle && <span className="min-w-0 truncate">‘{parentTitle}’의 세부 항목</span>}
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
