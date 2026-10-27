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
import { longDate, PHASE_WORD, placeOf, placePatch, placeStep, spanDate, taskPhase } from './task-view';
import { KindSelect, NoteField, OwnerSelect, SimpleWhenFields, type StepRef, type TaskOwner, type TaskWithNote } from './TaskComposer';
import { TaskPhotos } from './TaskPhotos';
import { GuideButton, GuideField } from './TaskGuide';
import { fetchGuide, saveGuide, useGuideIds } from './guides-client';
import { usePhotos } from '@/components/progress/PhotosPanel';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { LineIcon } from '@/components/ui/LineIcon';

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
 * - simple: 새 홈(한눈에 보기)의 쉬운 모양(시안 B). [동그란 체크 24] [제목 16/600 + 오른쪽 남은 날 배지] / [보조 줄 14 muted + 오른쪽 전화 · 연필 · 휴지통].
 *   단추 셋은 제목 줄이 아니라 날짜 줄 오른쪽에 둔다(제목 폭을 줄이지 않게). 누르는 칸은 44px, 아이콘은 20px 선 아이콘.
 *   제목을 누르면 메모만 펼치고 접는다 — 고치기는 연필, 지우기는 휴지통(확인 창 없이 바로 지우고 8초 「되돌리기」 알림).
 *   고치는 폼은 제목 · 언제부터(선택) · 언제까지 · 문의 필요(종류 「문의」) · 메모만(종류 · 담당 · 넣을 곳은 숨김, 값은 그대로). 폼 안 「이 할 일 지우기」는 확인 창을 띄운다.
 *   보조 줄: 「10월 27일(화)까지」 · 「문의 필요」 안내 배지 · 「지금 할 때」. 남은 날 배지: 지남 = 경고(빨강 글자 옅은 면) · 3일 안 = 주의(노랑) · 그 밖 = 회색.
 */
type Form = { text: string; start: string; due: string; kind: TaskKind | ''; owner: TaskOwner | ''; note: string; place: string };
/** 새 홈 「이번 주 할 일」 → 아래 블록의 그 할 일 줄로(detail = 할 일 id). 그 줄(쉬운 모양 TaskRow)이 받아 내려오고 펼치고 잠깐 칠한다 */
export const FOCUS_TASK_EVENT = 'home:focus-task';
/** 그 할 일 줄이 지금 화면에 있으면 보내고 true, 없으면(접힌 묶음 안 등) false */
export function focusTask(id: string): boolean {
  if (!document.getElementById(`task-${id}`)) return false;
  // 방금 펼친 묶음 안 줄이면 받는 쪽(useEffect)이 아직 안 붙었을 수 있어 한 박자 늦게 보낸다
  window.setTimeout(() => window.dispatchEvent(new CustomEvent(FOCUS_TASK_EVENT, { detail: id })), 60);
  return true;
}
// 설명서(현황 문서 밖 — guides-client): 폼을 열 때 본문을 받아 두고, 저장할 때 바뀌었으면 할 일보다 먼저 따로 저장한다
type GuideForm = { text: string; orig: string; base: number; loading: boolean; error: string | null };
const NO_GUIDE: GuideForm = { text: '', orig: '', base: 0, loading: false, error: null };

export function TaskRow({ t: task, steps, listStepId, showStep = false, scope, inset = false, quietLate = false, depth = 0, parentTitle, simple = false, hideDate = false, autoEdit = false, onEditChange, onToggle, onGone }: {
  t: TaskItem; steps: StepRef[]; listStepId: number | null; showStep?: boolean; scope: DirtyScope; inset?: boolean; quietLate?: boolean;
  depth?: 0 | 1; parentTitle?: string; simple?: boolean;
  /** 처음 그릴 때 바로 고치는 폼을 연다(달력 「다가오는 일정」의 연필 — 폼을 닫으면 부르는 쪽이 이 줄을 치운다) */
  autoEdit?: boolean;
  /** 쉬운 모양: 보조 줄의 「10월 28일(수)까지」를 숨긴다(달력 그날 목록처럼 머리가 이미 그 날짜를 말할 때). 남은 날 배지는 남긴다 */
  hideDate?: boolean;
  onEditChange: (id: string, open: boolean) => void; onToggle: (t: TaskItem) => void; onGone: () => void;
}) {
  const t = task as TaskWithNote; // 외도민판 · 지산판 같은 코드(autoFill 은 지산판에선 늘 비어 있다)
  const { doc, send, toast, confirm } = useProgress();
  const { taskPhotos, view } = usePhotos();
  const ed = useEditing(`task:${t.id}`);
  const [text, setText] = useState('');
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [kind, setKind] = useState<TaskKind | ''>('');
  const [note, setNote] = useState('');
  const [gf, setGf] = useState<GuideForm>(NO_GUIDE);
  const guideIds = useGuideIds();
  const guideMeta = t.deletedAt ? undefined : guideIds[t.id];
  const [owner, setOwner] = useState<TaskOwner | ''>('');
  const [place, setPlace] = useState(placeOf(t));
  const [err, setErr] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [base, setBase] = useState(t.version);
  const [orig, setOrig] = useState<Form>({ text: '', start: '', due: '', kind: '', owner: '', note: '', place: placeOf(t) });
  const { busy, run } = useBusy();
  const textBtnRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // 「이번 주 할 일」에서 이 할 일을 누르면(FOCUS_TASK_EVENT): 이 줄로 내려와 메모를 펼치고 잠깐 형광으로 칠한다(쉬운 모양만)
  const rowRef = useRef<HTMLLIElement>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!simple) return;
    let timer = 0;
    const onFocus = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== t.id || !rowRef.current) return;
      if ((t.note ?? '').trim()) setNoteOpen(true);
      rowRef.current.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      rowRef.current.querySelector<HTMLElement>('input[type="checkbox"]')?.focus({ preventScroll: true });
      setFlash(false);
      window.requestAnimationFrame(() => setFlash(true));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setFlash(false), 1900);
    };
    window.addEventListener(FOCUS_TASK_EVENT, onFocus);
    return () => { window.removeEventListener(FOCUS_TASK_EVENT, onFocus); window.clearTimeout(timer); };
  }, [simple, t.id, t.note]);
  const dl = dueLabel(t.due, todayStr());
  const dateText = spanDate(t.start, t.due) ?? dl?.date;
  const dirty = ed.open && (text !== orig.text || start !== orig.start || due !== orig.due || kind !== orig.kind || note !== orig.note || gf.text !== gf.orig || owner !== orig.owner || place !== orig.place);
  const fill = (o: Form) => { setText(o.text); setStart(o.start); setDue(o.due); setKind(o.kind); setOwner(o.owner); setNote(o.note); setPlace(o.place); setOrig(o); };
  // 폼을 열 때 설명서 본문 받기(없으면 빈 칸, base 0)
  const loadGuide = () => {
    if (!guideMeta) { setGf(NO_GUIDE); return; }
    setGf({ ...NO_GUIDE, loading: true });
    fetchGuide(t.id)
      .then((g) => setGf({ text: g?.md ?? '', orig: g?.md ?? '', base: g?.version ?? 0, loading: false, error: null }))
      .catch(() => setGf({ ...NO_GUIDE, error: '설명서를 불러오지 못했어요. 폼을 닫았다 다시 열어 주세요.' }));
  };
  const formOf = (c: Record<string, unknown>): Form => ({
    text: String(c.text ?? ''), start: String(c.start ?? ''), due: String(c.due ?? ''), kind: (c.kind ?? '') as TaskKind | '', owner: (c.owner ?? '') as TaskOwner | '', note: String(c.note ?? ''),
    place: placeOf({ stepId: typeof c.stepId === 'number' ? c.stepId : t.stepId, parentId: typeof c.parentId === 'string' ? c.parentId : null }),
  });
  // autoEdit: 다른 자리(달력 「다가오는 일정」의 연필)에서 고치려고 이 줄을 그릴 때 — 처음 그릴 때 한 번 바로 고치는 폼을 연다
  useEffect(() => {
    if (!autoEdit) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 처음 그릴 때 한 번만 폼을 연다
    fill(formOf(t as unknown as Record<string, unknown>));
    loadGuide();
    setErr(null);
    setBase(t.version);
    ed.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 그릴 때 한 번만
  }, []);
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
  // 쉬운 모양 줄의 휴지통: 확인 창 없이 바로 지우고 8초 「되돌리기」(같은 지우기 · 되살리기 길)
  const quickDel = () => {
    void send({ op: 'task.delete', id: t.id }).then((r) => {
      if (r.ok) toast(kidCount > 0 ? `할 일과 세부 항목 ${kidCount}개를 삭제했어요.` : '할 일을 삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'task.restore', id: t.id }) } });
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
              ...(kind !== orig.kind ? { kind: kind || null } : {}), ...(note !== orig.note ? { note: note.trim() || null } : {}),
              ...(owner !== orig.owner ? { owner: owner || null } : {}),
            };
            void run(async () => {
              // 설명서가 바뀌었으면 먼저 따로 저장한다(실패하면 할 일도 저장하지 않고 폼에 까닭을 적는다)
              if (gf.text !== gf.orig && !gf.loading && !gf.error) {
                const g = await saveGuide(t.id, gf.text, gf.base);
                if (!g.ok) {
                  // 409: 그 사이 다른 사람이 고침 — 내 글은 그대로 두고 version 만 맞춰, 한 번 더 저장하면 덮어쓴다
                  if (g.status === 409) setGf((s) => ({ ...s, base: g.current?.version ?? 0 }));
                  setErr(g.status === 409 ? '그 사이 다른 사람이 설명서를 고쳤어요. 내 글로 덮어쓰려면 한 번 더 저장하세요.' : g.message);
                  return;
                }
                setGf((s) => ({ ...s, orig: g.guide?.md ?? '', text: g.guide?.md ?? '', base: g.guide?.version ?? 0 }));
              }
              const r = await send({ op: 'task.update', id: t.id, baseVersion: base, patch }, {
                quiet: true,
                onSuccess: () => { ed.stop(); if (leaving) onGone(); },
                onTakeLatest: (cur) => { fill(formOf(cur)); setBase(Number(cur.version) || 0); },
              });
              setErr(taskErrorMessage(r));
            });
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
            {/* 설명서: 접혀 있다가 펼쳐 쓰는 큰 칸(부부가 직접 고친다) */}
            {/* 지운 할 일을 새로 올리는 폼에서는 설명서를 쓰지 않는다(새 id 가 저장 뒤에야 생김) */}
            {!deleted && <GuideField value={gf.text} onChange={(v) => setGf((s) => ({ ...s, text: v }))} title={text} loading={gf.loading} error={gf.error} />}
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
                {/* 쉬운 모양: 줄에 휴지통을 두지 않고 고치는 폼 안에서 지운다(확인 창 → 되돌리기 알림은 그대로) */}
                {simple && (
                  <button type="button" className="mr-auto inline-flex min-h-11 items-center gap-1.5 px-2 text-base font-bold text-danger-ink hover:underline"
                    onClick={() => { ed.stop(); void del(); }}>
                    <i className="fas fa-trash-can" aria-hidden />이 할 일 지우기
                  </button>
                )}
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
  const startEdit = () => { fill(formOf(t as unknown as Record<string, unknown>)); loadGuide(); setErr(null); setBase(t.version); ed.start(); };
  if (simple) {
    // 남은 날 꼬리표(제목 줄 오른쪽): 기한 지남 = 위험(빨강 테두리) · 3일 안 = 주의(검정 테두리) · 그 밖 = 회색. 누르지 못하는 표시라 빨강 면 · 검정 면을 쓰지 않는다.
    // 둘째 줄: 「10월 27일(화)까지」(13 메타) · 「문의 필요」 안내 꼬리표 · 「지금 할 때」. 담당은 쉬운 모양에서 보이지 않는다(값은 그대로).
    const phase = taskPhase(t, todayStr());
    const tone: BadgeTone = late ? 'danger' : phase === 'soon' ? 'warn' : 'neutral';
    const noteLines = (t.note ?? '').trim();
    const firstLine = noteLines.split('\n')[0];
    const photos = taskPhotos.filter((p) => p.taskId === t.id);
    const photoN = photos.length;
    const more = noteLines.includes('\n') || firstLine.length > 40;
    const hasMemo = !!noteLines || photoN > 0;
    const ask = t.kind === '문의';
    const dateWord = spanDate(t.start, t.due) ?? (t.due ? `${longDate(t.due)}까지` : null);
    const sub = (
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-meta font-normal text-muted">
        {dateWord && !hideDate && <span className="whitespace-nowrap tabular-nums">{dateWord}</span>}
        {ask && !t.done && <Badge tone="info">문의 필요</Badge>}
        {phase === 'prep' && <span className="whitespace-nowrap">{PHASE_WORD.prep}</span>}
        {parentTitle && <span className="min-w-0 truncate">‘{parentTitle}’의 세부 항목</span>}
        <EditBadge k={`task:${t.id}`} />
      </span>
    );
    const iconBtn = 'flex size-11 shrink-0 items-center justify-center rounded-control transition-colors hover:bg-sunken';
    return (
      <li ref={rowRef} id={`task-${t.id}`} className={`flex scroll-mt-16 flex-wrap items-start gap-x-2.5 border-b border-line py-3.5 last:border-b-0 ${depth ? 'pl-6' : ''} ${flash ? 'task-flash' : ''}`}>
        {/* 체크(22px 네모 · 모서리 6, 누르는 칸 44px): 빈 칸 → 고르면 검정(다크 흰색) 면 + 체크 */}
        <label className="relative -my-2.5 -ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center">
          <input type="checkbox" checked={t.done} aria-label={`${t.text} 완료`}
            className="peer size-5.5 cursor-pointer appearance-none rounded-chip border-[1.5px] border-faint bg-surface transition-colors checked:border-ink checked:bg-ink"
            onChange={(e) => { onToggle(t); void send({ op: 'task.update', id: t.id, patch: { done: e.target.checked } }); }} />
          <LineIcon name="check" stroke={2.6} className="pointer-events-none absolute size-4 text-surface opacity-0 peer-checked:opacity-100" />
        </label>
        <div className="min-w-0 flex-1">
          {/* 첫 줄: 제목 + ?(설명서) + 작은 사진(20px 2~3장 + 「+n」) ……… 오른쪽 남은 날 꼬리표.
              제목을 누르면 메모만 펼치고 접는다(메모도 사진도 없으면 누르는 것이 아니다).
              물음표 · 사진은 제목 글 바로 뒤(두 줄로 꺾여도 마지막 낱말 뒤) — 제목을 글 흐름(inline)으로 두고 이어 붙인다.
              메모를 펼치는 제목은 글 흐름 안에 있어야 해서 button 대신 role="button" 글(Enter · Space 로도 펼침) */}
          <div className="flex items-start gap-2">
            <div className={`min-w-0 flex-1 break-words text-base ${depth ? 'font-medium' : 'font-semibold'} ${t.done ? 'text-muted line-through' : 'text-ink'}`}>
              {hasMemo ? (
                <span role="button" tabIndex={0} aria-expanded={noteOpen} className="cursor-pointer rounded-sm"
                  onClick={() => setNoteOpen((v) => !v)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNoteOpen((v) => !v); } }}>
                  {t.text}<span className="sr-only">{noteOpen ? ' 메모 접기' : ' 메모 펼치기'}</span>
                </span>
              ) : <span>{t.text}</span>}
              {guideMeta && <GuideButton taskId={t.id} title={t.text} version={guideMeta.version} />}
              {photoN > 0 && (
                <button type="button" onClick={() => view(photos[0].id, undefined, photos.map((p) => p.id))} aria-label={`${t.text} 사진 ${photoN}장 크게 보기`}
                  className="relative -my-3 ml-1 inline-flex min-h-11 items-center gap-0.5 align-middle">
                  {photos.slice(0, photoN > 3 ? 2 : 3).map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p.id} src={`/api/photos/${p.id}?size=thumb`} alt="" loading="lazy" decoding="async" className="size-5 rounded-sm bg-strong object-cover" />
                  ))}
                  {photoN > 3 && <span className="ml-0.5 text-meta font-semibold text-muted">+{photoN - 2}</span>}
                </button>
              )}
            </div>
            {dl && !t.done && <Badge tone={tone} className="mt-px shrink-0">{dl.rel}</Badge>}
          </div>
          {/* 둘째 줄: 날짜(13) + 오른쪽 단추(전화 · 고치기 · 지우기). 단추 칸은 44px 이고 위아래로 줄 밖까지 걸쳐 줄 높이를 늘리지 않는다 */}
          <div className="mt-1 flex items-center gap-2">
            {sub}
            <span className="-my-2.5 -mr-2.5 flex shrink-0 items-center text-ink-soft">
              {call && (
                <a href={telHref(call)} aria-label={`${t.text} 전화 걸기 ${call}`} className={iconBtn}>
                  <LineIcon name="phone" className="size-5" />
                </a>
              )}
              <button ref={textBtnRef} type="button" aria-label={`${t.text} 고치기`} onClick={startEdit} className={iconBtn}>
                <LineIcon name="pen" className="size-5" />
              </button>
              <button type="button" aria-label={`${t.text} 삭제`} onClick={quickDel} className={`${iconBtn} hover:text-danger-ink active:text-danger-ink`}>
                <LineIcon name="trash" className="size-5" />
              </button>
            </span>
          </div>
          {/* 셋째 줄: 메모 첫 줄(접힘, 14 요지 글). 누르면 아래(줄 폭 그대로)에 메모 전체를 펼친다. 사진은 첫 줄 제목 뒤에 이미 보인다 */}
          {noteLines && !noteOpen && (
              <button type="button" aria-expanded="false" aria-label={`메모 펼치기: ${firstLine}`} onClick={() => setNoteOpen(true)}
                className="-mb-2.5 flex min-h-11 w-full items-center gap-1 text-left text-sm font-normal text-sub">
                <span className="min-w-0 truncate">{firstLine}</span>
                {more && <LineIcon name="chevron" className="size-4 shrink-0 rotate-90 text-muted" stroke={2} />}
              </button>
          )}
        </div>
        {/* 펼친 메모는 줄 폭 그대로(체크 칸만큼 들여): 16px · 행간 1.7 · 문단마다 간격 · 한 줄 최대 약 36em,
            낱말 · 전화번호는 중간에 끊지 않는다(break-keep). 메모 사진 · 「사진 추가」, 속 전화번호는 바로 건다 */}
        {hasMemo && noteOpen && (
          <div className="w-full pl-[44px] pr-2 pt-2">
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
        onClick={startEdit}>
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
