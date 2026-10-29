'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TaskItem, TaskKind } from '@/lib/core/types';
import { STEP_COUNT } from '@/lib/core/types';
import { dueLabel, todayStr } from '@/lib/client/format';
import { useProgress, type DirtyScope } from '@/components/progress/ProgressProvider';
import { liveChildrenOf } from '@/lib/core/task-tree';
import {
  AutoTextarea, btnGhost, btnPrimary, clipLabel, composerCls, dateCls, EditBadge, enterSubmit, inputCls, LastEdit, oneLine, textBtn,
  TRASH_NOTE, useBusy, useDirty, useEditing, useFormEsc,
} from '@/components/progress/bits';
import { callNumber, phonesIn, telHref } from './phone';
import { START_AFTER_DUE, taskErrorMessage } from './task-errors';
import { longDate, PHASE_WORD, placeOf, placePatch, placeStep, spanDate, taskPhase } from './task-view';
import { KindSelect, NoteField, SimpleWhenFields, type StepRef, type TaskWithNote } from './TaskComposer';
import { TaskPhotos } from './TaskPhotos';
import { GuideButton, GuideField } from './TaskGuide';
import { fetchGuide, saveGuide, useGuideIds } from './guides-client';
import { usePhotos } from '@/components/progress/PhotosPanel';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { LineIcon } from '@/components/ui/LineIcon';

/**
 * 할 일 한 줄 — 어느 화면이든 같은 규칙(2026-10-29 사이트 주인 「모두 다 동일하게」): 새 홈 단계 블록 · 달력 「오늘」 · 고른 날 · 「다가오는 일정」,
 * 자세히 보기(/classic) 홈 「할 일」 · 그날 창 · 단계 시트 「우리 할 일」. (간트 줄 · 「이번 주 할 일」 · 검색 결과 줄은 따로 — 건너가기 줄이라)
 *   [체크 44px] [제목 16/600 + ?(도움말) + 작은 사진 ……… 남은 날 꼬리표]
 *               [보조 줄 13 muted ……… 전화 · 연필 · 휴지통(각 44px, 20px 선 아이콘)]
 *               [메모 첫 줄 14 sub ……… 고정 꺾쇠]
 * - 제목 · 메모 줄 · 꺾쇠를 누르면 그 자리에서 내용만 펼친다(메모 전체 · 메모 사진 · 「＋ 사진」 · 전화번호 바로 걸기 — 보기만). 같은 꺾쇠 자리로 접는다.
 *   꺾쇠는 줄 오른쪽 끝 고정 자리(단추 열과 같은 세로줄)에서 위 · 아래로만 돈다. 펼쳐도 달라질 것이 없으면(짧은 한 줄 · 사진 · 전화번호 없음) 꺾쇠도 접고 펴기도 없다.
 * - 연필 = 그 자리 고치는 폼, 휴지통 = 확인 창 없이 바로 지우고 8초 「되돌리기」 알림, 체크 = 완료.
 * - 고치는 폼: simple(새 홈) = 제목 · 언제부터(선택) · 언제까지 · 문의 필요(종류 「문의」) · 메모 · 도움말 · 사진(종류 · 넣을 곳은 숨김, 값은 그대로) + 「이 할 일 지우기」(확인 창).
 *   자세히 보기 = 글 · 시작일 · 마감일 · 종류 · 넣을 곳 · 메모 · 도움말.
 *   넣을 곳 = 「n단계 할 일」(어느 단계든) 또는 같은 단계 맨 위 할 일의 「‘제목’의 세부 항목」(한 층만).
 *   세부 항목이 달린 할 일은 다른 할 일 밑으로 못 넣는다(그 선택지는 꺼 둔다). 부모를 지우면 세부 항목도 같이 지워진다(서버).
 *   저장 거절(시작일 > 마감일 · 넣을 곳 문제)은 알림 대신 폼 안 빨강 한 줄로 적는다(send quiet).
 * - 보조 줄: 「10월 27일(화)까지」 · 「문의 필요」 안내 꼬리표 · 「지금 하면 돼요」 · 세부 항목이면 부모 이름,
 *   자세히 보기는 종류 · 「자동으로 고름」 · (showStep) 「n단계 이름」도. 남은 날 꼬리표: 지남 = 위험 · 3일 안 = 주의 · 그 밖 = 회색.
 *
 * - listStepId: 단계 시트에서 그 단계 번호. 다른 단계로 옮기면 그 목록에서 줄이 빠진다(onGone). 홈(null)은 옮겨도 줄이 남는다.
 * - scope: 저장 안 한 입력의 범위(단계 시트 = 'modal', 홈 = 'page').
 * - inset: 테두리 상자(Card) 안 줄 — 줄 · 폼 좌우에 여백을 둔다.
 * - quietLate: 자세히 보기 「기한 지남」 묶음 안의 줄. 묶음 이름이 이미 빨강이라 남은 날 꼬리표는 회색으로.
 * - depth: 1 = 부모 바로 밑의 세부 항목 줄(24px 들여 쓰고 글자를 한 단계 가늘게).
 * - parentTitle: 부모가 이 목록에 없는 세부 항목이면 부모 제목(보조 줄에 「‘부모 제목’의 세부 항목」).
 * - lead · tag: 달력 「다가오는 일정」처럼 체크 칸 뒤 큰 날짜 칸(lead) · 보조 줄 맨 앞 분야 꼬리표(tag)를 끼울 때.
 */
type Form = { text: string; start: string; due: string; kind: TaskKind | ''; note: string; place: string };
/**
 * 새 홈 「이번 주 할 일」 · 검색 결과 → 아래 블록의 그 할 일 줄로. 그 줄(쉬운 모양 TaskRow)이 받아 내려오고 펼치고 잠깐 칠한다.
 * detail = 할 일 id(옛 꼴) 또는 { id, guide: true }(검색에서 도움말에서만 걸린 할 일 — 칠한 뒤 도움말 창까지 연다)
 */
export const FOCUS_TASK_EVENT = 'home:focus-task';
type FocusDetail = string | { id: string; guide?: boolean };
/** 그 할 일 줄이 지금 화면에 있으면 보내고 true, 없으면(접힌 묶음 안 등) false */
export function focusTask(id: string, opts: { guide?: boolean } = {}): boolean {
  if (!document.getElementById(`task-${id}`)) return false;
  const detail: FocusDetail = opts.guide ? { id, guide: true } : id;
  // 방금 펼친 묶음 안 줄이면 받는 쪽(useEffect)이 아직 안 붙었을 수 있어 한 박자 늦게 보낸다
  window.setTimeout(() => window.dispatchEvent(new CustomEvent(FOCUS_TASK_EVENT, { detail })), 60);
  return true;
}
// 설명서(현황 문서 밖 — guides-client): 폼을 열 때 본문을 받아 두고, 저장할 때 바뀌었으면 할 일보다 먼저 따로 저장한다
type GuideForm = { text: string; orig: string; base: number; loading: boolean; error: string | null };
const NO_GUIDE: GuideForm = { text: '', orig: '', base: 0, loading: false, error: null };

export function TaskRow({ t: task, steps, listStepId, showStep = false, scope, inset = false, quietLate = false, depth = 0, parentTitle, simple = false, hideDate = false, hideDueOn = null, lead, tag, onEditChange, onToggle, onGone }: {
  t: TaskItem; steps: StepRef[]; listStepId: number | null; showStep?: boolean; scope: DirtyScope; inset?: boolean; quietLate?: boolean;
  depth?: 0 | 1; parentTitle?: string; simple?: boolean;
  /** 체크 칸 뒤에 끼우는 칸(달력 「다가오는 일정」 큰 날짜) · 보조 줄 맨 앞(분야 꼬리표) */
  lead?: ReactNode; tag?: ReactNode;
  /** 쉬운 모양: 보조 줄의 「10월 28일(수)까지」를 숨긴다(달력 그날 목록처럼 머리가 이미 그 날짜를 말할 때). 남은 날 배지는 남긴다 */
  hideDate?: boolean;
  /** 쉬운 모양: 마감이 이 날이면 「n월 n일까지」를 숨긴다(단계 블록 머리 날짜와 같을 때). 시작일이 있는 기간 표시는 그대로 */
  hideDueOn?: string | null;
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
  const [place, setPlace] = useState(placeOf(t));
  const [err, setErr] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  // 쉬운 모양 접힌 메모 첫 줄이 줄 폭에서 잘렸는가(말줄임) — 잘렸으면 펼칠 것이 있다(글 길이 어림 대신 실제 폭으로 잰다)
  const memoRef = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const el = memoRef.current;
    if (!el) return;
    // 처음 붙일 때도 한 번 불린다
    const ro = new ResizeObserver(() => setClipped(el.scrollWidth > el.clientWidth + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [t.note, noteOpen, ed.open, simple]);
  const [base, setBase] = useState(t.version);
  const [orig, setOrig] = useState<Form>({ text: '', start: '', due: '', kind: '', note: '', place: placeOf(t) });
  const { busy, run } = useBusy();
  const textBtnRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // 「이번 주 할 일」에서 이 할 일을 누르면(FOCUS_TASK_EVENT): 이 줄로 내려와 메모를 펼치고 잠깐 형광으로 칠한다(쉬운 모양만)
  const rowRef = useRef<HTMLLIElement>(null);
  const [flash, setFlash] = useState(false);
  // 검색에서 도움말에서만 걸린 할 일로 왔으면 칠한 뒤 도움말 창을 연다(물음표 단추가 이 값이 바뀔 때 연다)
  const [guideAsk, setGuideAsk] = useState(0);
  useEffect(() => {
    if (!simple) return;
    let timer = 0;
    let guideTimer = 0;
    const onFocus = (e: Event) => {
      const d = (e as CustomEvent<FocusDetail>).detail;
      const id = typeof d === 'string' ? d : d?.id;
      if (id !== t.id || !rowRef.current) return;
      if (typeof d === 'object' && d?.guide) { window.clearTimeout(guideTimer); guideTimer = window.setTimeout(() => setGuideAsk((n) => n + 1), 700); }
      if ((t.note ?? '').trim()) setNoteOpen(true);
      // 줄의 scroll-margin-top = 탭 줄(--spacing-tabbar) + 붙은 블록 머리(두 줄까지 88px) — 그 밑에 가려지지 않게
      rowRef.current.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      rowRef.current.querySelector<HTMLElement>('input[type="checkbox"]')?.focus({ preventScroll: true });
      setFlash(false);
      window.requestAnimationFrame(() => setFlash(true));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setFlash(false), 1900);
    };
    window.addEventListener(FOCUS_TASK_EVENT, onFocus);
    return () => { window.removeEventListener(FOCUS_TASK_EVENT, onFocus); window.clearTimeout(timer); window.clearTimeout(guideTimer); };
  }, [simple, t.id, t.note]);
  const dl = dueLabel(t.due, todayStr());
  const dirty = ed.open && (text !== orig.text || start !== orig.start || due !== orig.due || kind !== orig.kind || note !== orig.note || gf.text !== gf.orig || place !== orig.place);
  const fill = (o: Form) => { setText(o.text); setStart(o.start); setDue(o.due); setKind(o.kind); setNote(o.note); setPlace(o.place); setOrig(o); };
  // 폼을 열 때 설명서 본문 받기(없으면 빈 칸, base 0)
  const loadGuide = () => {
    if (!guideMeta) { setGf(NO_GUIDE); return; }
    setGf({ ...NO_GUIDE, loading: true });
    fetchGuide(t.id)
      .then((g) => setGf({ text: g?.md ?? '', orig: g?.md ?? '', base: g?.version ?? 0, loading: false, error: null }))
      .catch(() => setGf({ ...NO_GUIDE, error: '도움말을 불러오지 못했어요. 폼을 닫았다 다시 열어 주세요.' }));
  };
  const formOf = (c: Record<string, unknown>): Form => ({
    text: String(c.text ?? ''), start: String(c.start ?? ''), due: String(c.due ?? ''), kind: (c.kind ?? '') as TaskKind | '', note: String(c.note ?? ''),
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
    void run(() => send({ op: 'task.add', ...where, text, due: due || null, ...(start ? { start } : {}), ...(kind ? { kind } : {}), ...(note.trim() ? { note: note.trim() } : {}) }, {
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
            };
            void run(async () => {
              // 설명서가 바뀌었으면 먼저 따로 저장한다(실패하면 할 일도 저장하지 않고 폼에 까닭을 적는다)
              if (gf.text !== gf.orig && !gf.loading && !gf.error) {
                const g = await saveGuide(t.id, gf.text, gf.base);
                if (!g.ok) {
                  // 409: 그 사이 다른 사람이 고침 — 내 글은 그대로 두고 version 만 맞춰, 한 번 더 저장하면 덮어쓴다
                  if (g.status === 409) setGf((s) => ({ ...s, base: g.current?.version ?? 0 }));
                  setErr(g.status === 409 ? '그 사이 다른 사람이 도움말을 고쳤어요. 내 글로 덮어쓰려면 한 번 더 저장하세요.' : g.message);
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
  // 남은 날 꼬리표(제목 줄 오른쪽): 기한 지남 = 위험(빨강 테두리) · 3일 안 = 주의(검정 테두리) · 그 밖 = 회색. 누르지 못하는 표시라 빨강 면 · 검정 면을 쓰지 않는다.
  // 둘째 줄: 「10월 27일(화)까지」(13 메타) · 「문의 필요」 안내 꼬리표 · 「지금 하면 돼요」.
  // 마감이 블록 머리 날짜와 같으면(hideDueOn) 「n월 n일까지」를 숨긴다(머리가 이미 말한다 — 남은 날 꼬리표는 그대로).
  // 둘째 줄에 보일 것이 없으면(날짜 없는 할 일 등) 단추를 제목 줄 오른쪽에 둬 빈 줄로 높아지지 않게 한다.
  const phase = taskPhase(t, todayStr());
  // quietLate(자세히 보기 「기한 지남」 묶음 안): 묶음 이름이 이미 빨강이라 줄마다 빨강을 되풀이하지 않는다
  const tone: BadgeTone = late ? (quietLate ? 'neutral' : 'danger') : phase === 'soon' ? 'warn' : 'neutral';
  const noteLines = (t.note ?? '').trim();
  const firstLine = noteLines.split('\n')[0];
  const photos = taskPhotos.filter((p) => p.taskId === t.id);
  const photoN = photos.length;
  const phones = [...new Set(phonesIn(noteLines))];
  // 펼치면 달라지는 것이 있을 때만 접고 편다: 메모가 여러 줄 · 첫 줄이 잘림 · 메모 사진 · 메모 속 전화번호(펼치면 바로 걸기)
  const expandable = noteLines.includes('\n') || clipped || photoN > 0 || phones.length > 0;
  const open = noteOpen && expandable;
  const toggleMemo = () => setNoteOpen((v) => !v);
  const memoId = `task-${t.id}-memo`;
  const ask = t.kind === '문의';
  const span = spanDate(t.start, t.due);
  const dateWord = span ?? (t.due && !(hideDueOn && t.due === hideDueOn) ? `${longDate(t.due)}까지` : null);
  const showDate = !!dateWord && !hideDate;
  // 자세히 보기(simple 아님)만: 종류(「문의」 밖 — 새 홈은 종류를 안 보인다) · 「자동으로 고름」(Todoist 에서 들어와 자동으로 고른 것)
  const kindWord = !simple && t.kind && !ask ? t.kind : null;
  const autoWord = !simple && t.autoFill;
  const stepWord = showStep ? `${t.stepId}단계${stepName ? ` ${stepName}` : ''}` : null;
  const hasSub = !!tag || showDate || (ask && !t.done) || phase === 'prep' || !!parentTitle || !!kindWord || !!autoWord || !!stepWord;
  const sub = (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-meta font-normal text-muted">
      {tag}
      {showDate && <span className="whitespace-nowrap tabular-nums">{dateWord}</span>}
      {ask && !t.done && <Badge tone="info">문의 필요</Badge>}
      {kindWord && <span className="whitespace-nowrap">{kindWord}</span>}
      {autoWord && <span className="whitespace-nowrap" title="단계 · 종류를 자동으로 골랐어요. 고치기에서 바꿀 수 있어요">자동으로 고름</span>}
      {phase === 'prep' && <span className="whitespace-nowrap">{PHASE_WORD.prep}</span>}
      {parentTitle && <span className="min-w-0 truncate">‘{parentTitle}’의 세부 항목</span>}
      {stepWord && <span className="min-w-0 truncate">{stepWord}</span>}
      <EditBadge k={`task:${t.id}`} />
    </span>
  );
  const iconBtn = 'flex size-11 shrink-0 items-center justify-center rounded-control transition-colors hover:bg-sunken';
  const buttons = (
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
  );
  return (
    // inset = 테두리 상자(Card) 안 줄 — 상자에 안쪽 여백이 없어 줄이 좌우 16px 를 둔다(체크 칸 · 단추 칸이 44px 로 바깥에 걸치므로)
    <li ref={rowRef} id={`task-${t.id}`} className={`flex scroll-mt-[calc(var(--spacing-tabbar)+5.5rem)] flex-wrap items-start gap-x-2.5 border-b border-line py-3.5 last:border-b-0 ${inset ? 'px-4' : ''} ${depth ? (inset ? 'pl-10' : 'pl-6') : ''} ${flash ? 'task-flash' : ''}`}>
      {/* 체크(22px 네모 · 모서리 6, 누르는 칸 44px): 빈 칸 → 고르면 검정(다크 흰색) 면 + 체크 */}
      <label className="relative -my-2.5 -ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center">
        <input type="checkbox" checked={t.done} aria-label={`${t.text} 완료`}
          className="peer size-5.5 cursor-pointer appearance-none rounded-chip border-[1.5px] border-faint bg-surface transition-colors checked:border-ink checked:bg-ink"
          onChange={(e) => { onToggle(t); void send({ op: 'task.update', id: t.id, patch: { done: e.target.checked } }); }} />
        <LineIcon name="check" stroke={2.6} className="pointer-events-none absolute size-4 text-surface opacity-0 peer-checked:opacity-100" />
      </label>
      {/* lead = 체크 칸과 제목 사이에 끼우는 칸(달력 「다가오는 일정」의 큰 날짜 — 데일리 .evr) */}
      {lead}
      <div className="min-w-0 flex-1">
        {/* 첫 줄: 제목 + ?(설명서) + 작은 사진(20px 2~3장 + 「+n」) ……… 오른쪽 남은 날 꼬리표.
            제목을 누르면 메모만 펼치고 접는다(펼쳐도 달라질 것이 없으면 누르는 것이 아니다).
            물음표 · 사진은 제목 글 바로 뒤(두 줄로 꺾여도 마지막 낱말 뒤) — 제목을 글 흐름(inline)으로 두고 이어 붙인다.
            메모를 펼치는 제목은 글 흐름 안에 있어야 해서 button 대신 role="button" 글(Enter · Space 로도 펼침) */}
        <div className="flex items-start gap-2">
          <div className={`min-w-0 flex-1 break-words text-base ${depth ? 'font-medium' : 'font-semibold'} ${t.done ? 'text-muted line-through' : 'text-ink'}`}>
            {expandable ? (
              <span role="button" tabIndex={0} aria-expanded={open} aria-controls={memoId} className="cursor-pointer rounded-sm"
                onClick={toggleMemo}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMemo(); } }}>
                {t.text}<span className="sr-only">{open ? ' 메모 접기' : ' 메모 펼치기'}</span>
              </span>
            ) : <span>{t.text}</span>}
            {guideMeta && <GuideButton taskId={t.id} title={t.text} version={guideMeta.version} openKey={guideAsk} />}
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
          {!hasSub && buttons}
        </div>
        {/* 둘째 줄: 날짜(13) + 오른쪽 단추(전화 · 고치기 · 지우기). 단추 칸은 44px 이고 위아래로 줄 밖까지 걸쳐 줄 높이를 늘리지 않는다 */}
        {hasSub && (
          <div className="mt-1 flex items-center gap-2">
            {sub}
            {buttons}
          </div>
        )}
        {/* 셋째 줄: 메모(단계 블록 머리처럼 접고 편다). 접힘 = 첫 줄 한 줄(14 요지 글, 넘치면 말줄임), 펼침 = 같은 자리에 메모 전체
            (16px · 행간 1.7 · 문단마다 간격 · 한 줄 최대 약 36em, 낱말 · 전화번호는 중간에 끊지 않는다 — break-keep).
            꺾쇠는 줄 오른쪽 끝 고정 자리(전화 · 연필 · 휴지통 단추 열과 같은 세로줄) — 펼쳐도 접어도 그 자리에서 위 · 아래로만 돈다.
            메모 줄 어디를 눌러도 접고 편다(글을 끌어 고르는 중이면 그대로 — 펼친 메모 글은 골라 복사할 수 있게 button 이 아닌 글).
            펼쳐도 달라질 것이 없으면(짧은 한 줄 · 사진 · 전화번호 없음) 꺾쇠 없이 글만. 사진은 첫 줄 제목 뒤에 이미 보인다 */}
        {noteLines && (
          <div className={`${open ? '' : '-mb-2.5'} flex items-start`}
            onClick={expandable ? (e) => {
              if ((e.target as HTMLElement).closest('a, button')) return;
              if (window.getSelection()?.toString()) return;
              toggleMemo();
            } : undefined}>
            <div id={memoId} className={`min-w-0 flex-1 ${expandable ? 'cursor-pointer' : ''} ${open ? 'py-2' : 'flex min-h-11 items-center'}`}>
              {open ? (
                <div className="max-w-[36em] space-y-2 break-keep text-base font-normal leading-[1.7] text-ink-soft [overflow-wrap:anywhere]">
                  {noteLines.split(/\n+/).map((para, i) => <p key={i} className="whitespace-pre-wrap">{para}</p>)}
                </div>
              ) : <span ref={memoRef} className="block min-w-0 truncate text-sm font-normal text-sub">{firstLine}</span>}
            </div>
            {expandable && (
              <button type="button" aria-expanded={open} aria-controls={memoId} aria-label={open ? `메모 접기: ${t.text}` : `메모 펼치기: ${t.text}`} onClick={toggleMemo}
                className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-control text-ink-soft transition-colors hover:bg-sunken">
                <LineIcon name="chevron" stroke={2} className={`size-5 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
              </button>
            )}
          </div>
        )}
        {/* 펼친 메모 밑: 메모 사진 · 「＋ 사진」, 메모 속 전화번호는 바로 건다(따로 접는 단추는 없다 — 꺾쇠 · 제목 · 메모 줄로 접는다) */}
        {open && (
          <div className="pt-1">
            <TaskPhotos taskId={t.id} stepId={t.stepId} />
            {phones.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4">
                {phones.map((p) => <a key={p} href={telHref(p)} className={`${textBtn} mx-0 tabular-nums`}><i className="fas fa-phone mr-1.5" aria-hidden />{p}</a>)}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
