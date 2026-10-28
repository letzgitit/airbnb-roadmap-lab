'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TaskItem } from '@/lib/core/types';
import { useProgress } from '@/components/progress/ProgressProvider';
import { usePhotos } from '@/components/progress/PhotosPanel';
import { TaskComposer, type StepRef } from '@/components/tasks/TaskComposer';
import { TaskRow } from '@/components/tasks/TaskRow';
import { longDate, treeRows, SOON_DAYS } from '@/components/tasks/task-view';
import { useEditingSet, useStickyDone } from '@/components/tasks/useTaskList';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { addBtnCls, btnGhost, btnPrimary, inputCls } from '@/components/ui/buttonCls';
import { FoldRow } from '@/components/ui/FoldRow';
import { LineIcon } from '@/components/ui/LineIcon';
import { byDue, daysBetween, prepareAdd, progressSr, progressText, relDay, type CardDef, type CardSummary } from './home-model';
import { addCardNote, removeCardNote, restoreCardNote, useCardNotes, type CardNote } from './cardnotes-client';

/** 블록 틀(데일리 .sec): 흰 면, 폰은 화면 끝까지 · 넓은 화면은 1px 선 테두리. 블록 사이는 바탕 회색 8px(부모의 gap-2) */
export const blockCls = 'bg-surface md:border md:border-line';

/**
 * 펼친 블록의 머리를 분야 탭 줄 바로 밑에 붙인다(연락처 앱 머리글처럼): 할 일을 내려 보는 동안 머리가 따라오고,
 * 블록이 끝나면 다음 블록 머리가 밀어 올린다(sticky 는 블록 section 안에서만 움직인다). top = 탭 줄 높이(--spacing-tabbar),
 * z 는 탭 줄(30)보다 아래, 면은 블록과 같은 bg-surface. 붙은 동안만 아래 1px 선(그림자 1px — 자리를 밀지 않게).
 * 접힌 블록은 머리 한 줄뿐이라 붙지 않고, 붙이는 클래스도 펼쳤을 때만 단다.
 */
const stickyHeadCls = 'sticky top-tabbar z-20 bg-surface';
const stuckLineCls = 'shadow-[0_1px_0_var(--color-line)]';
/** 블록 맨 위 1px 표시(sentinel)가 탭 줄 밑으로 지나가 숨었으면 머리가 붙은 것. 기준 선은 머리의 계산된 top(= 탭 줄 높이)을 읽는다 */
function useStuck(on: boolean) {
  const sentinel = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const s = sentinel.current;
    const h = head.current;
    if (!on || !s || !h) return;
    const top = parseFloat(getComputedStyle(h).top) || 0;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < top + 1),
      { rootMargin: `-${top}px 0px 0px 0px`, threshold: 0 });
    io.observe(s);
    return () => io.disconnect();
  }, [on]);
  return { sentinel, head, stuck: on && stuck };
}
/** 머리 위치를 재는 기준(머리의 계산된 top = 탭 줄 높이) */
const stickyTop = (head: HTMLElement | null) => (head ? parseFloat(getComputedStyle(head).top) || 0 : 0);

/**
 * 블록 머리(데일리 .sec-h): 52px 줄, 제목 19/800 + 글자 밑 짧은 형광 밑줄(다크도 19/800 — 밑줄만 없음). 오른쪽에 메타(13) · 꼬리표 · 작은 글자 단추.
 * 좁아서 한 줄에 안 들어가면 오른쪽 메타가 제목 밑 줄로 내려간다.
 * sticky = 탭 줄 밑에 붙는 머리(「이번 주 할 일」 본문 블록) — 펼친 단계 블록과 같은 규칙.
 */
export function BlockHead({ id, title, count, right, sticky = false }: { id?: string; title: ReactNode; count?: ReactNode; right?: ReactNode; sticky?: boolean }) {
  const { sentinel, head, stuck } = useStuck(sticky);
  return (
    <>
      {sticky && <div ref={sentinel} aria-hidden className="h-px -mb-px" />}
      <div ref={head} className={`flex min-h-13 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-5 py-2.5 ${sticky ? stickyHeadCls : ''} ${stuck ? stuckLineCls : ''}`}>
        <h2 id={id} className="flex min-w-0 items-baseline gap-2 text-head font-extrabold tracking-[-0.01875rem] text-ink">
          <span className="head-mark min-w-0">{title}</span>
          {count != null && <small className="shrink-0 text-meta font-normal tracking-normal text-muted tabular-nums">{count}</small>}
        </h2>
        {right && <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap text-meta text-muted">{right}</div>}
      </div>
    </>
  );
}

/**
 * 일터 탭(행정 · 설비 · 운영)의 단계 블록 하나(기획 27의 3절 · 9절 — 예전 「카드」). 접고 펴는 블록(처음엔 접힘 — 펼친 블록은 부르는 쪽이 이 브라우저 탭에 기억, home-state.ts).
 * 머리 = 제목(형광 밑줄) + 오른쪽 「11월 9일(월)까지」 · 꼬리표(D-12 · 기한 지남 n) · 「2/7」 · 맨 끝 꺾쇠. 머리 줄 전체가 접기 · 펴기 단추.
 * 다 끝낸 블록 머리 = 제목(muted, 밑줄 없음) + 「완료」 꼬리표 + 빈 개수 칸 + 꺾쇠.
 * 펼쳤을 때만 몸통 = 설명 한 줄 → 안 끝난 할 일 줄(마감 이른 순, 세부 항목은 부모 밑) → 「완료 n」(접음 — 펼치면 끝낸 줄)
 *   → 블록 메모(한 줄씩) → 블록 사진(64px 썸네일) → 맨 아래 단추 줄 「＋ 할 일 · ＋ 메모 · ＋ 사진」.
 * 빈 블록에 「할 일 없음」 같은 글은 쓰지 않는다 — 단추 줄만 보인다.
 * 할 일 줄은 TaskRow 쉬운 모양(simple) — 쓰기는 기존 /api/progress/mutate 그대로(Todoist 동기화도 같은 길).
 * 메모 · 사진은 더하기 · 지우기만(고치기 없음): 메모 = 별도 저장소(cardnotes-client), 사진 = 사진 저장소에 cardId(= blockId)를 달아서.
 */
export function StepBlock({ blockId, card, cards, title, tasks, summary, steps, today, open, onToggle }: {
  blockId: string; card: CardDef; cards: CardDef[]; title: string; tasks: TaskItem[]; summary: CardSummary; steps: StepRef[]; today: string;
  /** 펼쳤는가 · 머리 줄을 눌렀을 때 */
  open: boolean; onToggle: () => void;
}) {
  const { doc } = useProgress();
  const uid = useId();
  const { isDone, onToggle: onToggleDone } = useStickyDone();
  const { editing, reportEdit } = useEditingSet();
  const [composing, setComposing] = useState<'task' | 'note' | null>(null);
  const [showDone, setShowDone] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLButtonElement>(null);
  const closeComposer = useCallback(() => {
    setComposing((was) => {
      window.requestAnimationFrame(() => (was === 'note' ? noteRef : addRef).current?.focus());
      return null;
    });
  }, []);
  const all = useMemo(() => doc?.tasks ?? {}, [doc]);

  const openRows = useMemo(() => treeRows(tasks.filter((t) => !isDone(t) || editing.has(t.id)).sort(byDue), all), [tasks, isDone, editing, all]);
  const doneRows = useMemo(() => treeRows(tasks.filter((t) => isDone(t) && !editing.has(t.id)).sort(byDue), all), [tasks, isDone, editing, all]);
  const prepare = useMemo(() => (card.match ? (text: string, kind: Parameters<typeof prepareAdd>[3]) => prepareAdd(cards, card, text, kind) : undefined), [card, cards]);

  const row = (r: (typeof openRows)[number]) => (
    // 마감이 블록 머리 날짜와 같은 줄은 「n월 n일까지」를 숨긴다(머리가 이미 말한다 — 남은 날 꼬리표만)
    <TaskRow key={r.item.id} t={r.item} steps={steps} listStepId={null} scope="page" simple depth={r.depth} parentTitle={r.parentTitle} hideDueOn={summary.deadline}
      onEditChange={reportEdit} onToggle={onToggleDone} onGone={() => undefined} />
  );
  const progress = progressText(summary);
  const done = summary.finished;
  const { sentinel, head, stuck } = useStuck(open);
  const section = useRef<HTMLElement>(null);
  // 붙은 머리에서 접으면 접은 뒤 그 머리가 탭 줄 바로 밑에 오게 스크롤을 되돌린다(접히면 블록이 짧아져 머리가 화면 위로 사라지므로)
  //   기준 선(탭 줄 높이)은 접기 전에 잰다 — 접힌 머리는 sticky 가 아니어서 top 을 읽을 수 없다
  const keepHead = useRef<number | null>(null);
  const toggle = () => {
    const s = section.current;
    const top = stickyTop(head.current);
    keepHead.current = open && s && s.getBoundingClientRect().top < top ? top : null;
    onToggle();
  };
  useLayoutEffect(() => {
    const top = keepHead.current;
    if (top == null) return;
    keepHead.current = null;
    const s = section.current;
    if (s) window.scrollTo({ top: window.scrollY + s.getBoundingClientRect().top - top });
  }, [open]);

  return (
    <section ref={section} aria-labelledby={`${uid}-t`} className={blockCls}>
      {open && <div ref={sentinel} aria-hidden className="h-px -mb-px" />}
      {/* 머리 줄: 제목 속 단추가 줄 전체를 덮어(::after) 어디를 눌러도 접고 편다.
          오른쪽 메타(날짜 · 꼬리표 · 개수 · 꺾쇠)는 쪼개지지 않는 한 덩어리로 오른쪽 세로 가운데. 제목 옆에 다 안 들어가면
          덩어리째 아래 줄로 내려 오른쪽 정렬(flex-wrap — 제목은 한 줄 폭을 다 쓰니 많아야 2줄).
          메타 덩어리는 누를 것이 없는 장식이라 pointer-events-none — 꺾쇠의 회전(transform)이 쌓임 맥락을 만들어
          ::after 위에 그려지므로, 이게 없으면 꺾쇠를 정확히 누를 때 단추가 안 눌린다(2026-10-29 폰 제보).
          펼친 블록은 머리가 탭 줄 밑에 붙는다(useStuck — 붙은 동안만 아래 선).
          다 끝낸 블록은 「완료」 꼬리표만 — 제목은 muted · 형광 밑줄 없음(훑어볼 때 뒤로 물러나게) */}
      <div ref={head} className={`flex min-h-13 flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 transition-colors hover:bg-sunken has-[>h2>button:focus-visible]:outline-2 has-[>h2>button:focus-visible]:-outline-offset-2 has-[>h2>button:focus-visible]:outline-accent-ink ${open ? stickyHeadCls : 'relative'} ${stuck ? stuckLineCls : ''}`}>
        <h2 id={`${uid}-t`} className={`min-w-0 flex-auto text-head font-extrabold tracking-[-0.01875rem] ${done ? 'text-muted' : 'text-ink'}`}>
          <button type="button" aria-expanded={open} aria-controls={`${uid}-b`} onClick={toggle}
            className="text-left outline-none after:absolute after:inset-0 after:content-['']">
            {done ? title : <span className="head-mark">{title}</span>}
          </button>
        </h2>
        <div className="pointer-events-none ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap text-meta text-muted">
          {!done && summary.deadline && <span className="tabular-nums">{longDate(summary.deadline)}까지</span>}
          <StateBadge summary={summary} today={today} date={summary.deadline} />
          {/* 개수 칸: 개수가 없거나 다 끝낸 블록도 같은 너비를 비워 둔다(꼬리표 오른쪽 끝이 모든 머리에서 한 세로줄에 서게) */}
          <span className="min-w-9 text-right font-semibold text-ink-soft tabular-nums" aria-hidden>{done ? '' : progress}</span>
          {!done && progress && <span className="sr-only">{progressSr(summary)}</span>}
          <LineIcon name="chevron" stroke={2} className={`size-5 text-ink-soft transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
        </div>
      </div>
      {/* 몸통: 펼쳤을 때만 그린다(접힌 동안 할 일 줄이 없어 「이번 주 할 일」 건너가기는 먼저 펼친다) */}
      <div id={`${uid}-b`} hidden={!open}>
        {open && (
          <>
            {card.sub && <p className="truncate px-5 pb-2.5 text-sm text-sub">{card.sub}</p>}
            {openRows.length > 0 && <ul className="border-t border-line px-5">{openRows.map(row)}</ul>}
            {doneRows.length > 0 && (
              <div className="border-t border-line">
                <span className="block px-1"><FoldRow strongChevron label="완료" count={doneRows.length} unit="" open={showDone} onToggle={() => setShowDone((v) => !v)} controls={`${uid}-done`} /></span>
                {showDone && <ul id={`${uid}-done`} className="border-t border-line px-5">{doneRows.map(row)}</ul>}
              </div>
            )}
            <BlockNotes blockId={blockId} title={title} />
            <BlockPhotos blockId={blockId} title={title} />
            {/* 맨 아래 단추 줄: 「＋ 할 일 · ＋ 메모 · ＋ 사진」. 할 일 · 메모는 누르면 그 자리에 폼, 사진은 바로 고르기 */}
            <div className="border-t border-line">
              {composing === 'task' ? (
                <div className="px-3 pb-1">
                  <TaskComposer stepId={card.addStep} scope="page" simple prepare={prepare} dirtyKey={`form:add-task:card:${card.id}:${card.addStep}`} onClose={closeComposer} />
                </div>
              ) : composing === 'note' ? (
                <NoteComposer blockId={blockId} title={title} onClose={closeComposer} />
              ) : (
                <div className="flex flex-wrap items-center px-2">
                  <button ref={addRef} type="button" onClick={() => setComposing('task')} className={addBtnCls}>
                    <LineIcon name="plus" className="size-4.5" stroke={2.2} />할 일
                    <span className="sr-only">: {title}에 더하기</span>
                  </button>
                  <button ref={noteRef} type="button" onClick={() => setComposing('note')} className={addBtnCls}>
                    <LineIcon name="plus" className="size-4.5" stroke={2.2} />메모
                    <span className="sr-only">: {title}에 더하기</span>
                  </button>
                  <AddPhotoButton blockId={blockId} stepId={card.addStep} title={title} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// 「10월 28일」(이 기기 시각 기준) — 메모 적은 날
const noteDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}월 ${d.getDate()}일`;
};

/** 블록 메모 목록: 한 줄씩(글 16 `ink-soft` + 밑에 날짜 · 쓴 사람 13 `muted` — 가운뎃점 없이 띄어 쓴다) + 오른쪽 휴지통(바로 지우고 8초 「되돌리기」) */
function BlockNotes({ blockId, title }: { blockId: string; title: string }) {
  const notes = useCardNotes(blockId);
  const { toast } = useProgress();
  if (notes.length === 0) return null;
  const del = async (n: CardNote) => {
    const r = await removeCardNote(blockId, n.id);
    if (!r.ok) { toast(r.message, { kind: 'error' }); return; }
    toast('메모를 지웠어요.', {
      ms: 8000,
      action: { label: '되돌리기', run: () => void restoreCardNote(blockId, r.note).then((x) => { if (!x.ok) toast(x.message, { kind: 'error' }); }) },
    });
  };
  return (
    <ul aria-label={`${title} 메모`} className="border-t border-line px-5">
      {notes.map((n) => (
        <li key={n.id} className="flex items-start gap-2 border-b border-line py-3 last:border-b-0">
          <div className="min-w-0 flex-1">
            <p className="break-words text-base text-ink-soft [overflow-wrap:anywhere]">{n.text}</p>
            <p className="mt-0.5 flex gap-2 text-meta text-muted"><span className="tabular-nums">{noteDay(n.at)}</span>{n.by && <span>{n.by}</span>}</p>
          </div>
          <button type="button" aria-label={`메모 지우기: ${n.text.slice(0, 30)}`} onClick={() => void del(n)}
            className="-my-1.5 -mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-control text-ink-soft transition-colors hover:bg-sunken hover:text-danger-ink active:text-danger-ink">
            <LineIcon name="trash" className="size-5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 「＋ 메모」 폼: 한 줄 입력(500자) + 취소 · 저장. Enter = 저장, Esc = 닫기. 저장하면 폼을 닫고 목록 맨 아래에 붙는다 */
function NoteComposer({ blockId, title, onClose }: { blockId: string; title: string; onClose: () => void }) {
  const uid = useId();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const r = await addCardNote(blockId, text);
    setBusy(false);
    if (!r.ok) { setErr(r.message); return; }
    onClose();
  };
  return (
    <form className="space-y-2 px-5 py-3" onSubmit={(e) => { e.preventDefault(); void save(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}>
      <label htmlFor={`${uid}-n`} className="sr-only">{title} 메모</label>
      <input id={`${uid}-n`} className={inputCls} value={text} maxLength={500} autoFocus autoComplete="off" placeholder="예: 신분증 원본 챙기기"
        onChange={(e) => { setText(e.target.value); setErr(null); }} />
      {err && <p role="alert" className="text-sm text-danger-ink">{err}</p>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onClose}>취소</button>
        <button className={btnPrimary} disabled={busy || !text.trim()}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </form>
  );
}

/** 블록 사진: 64px 정사각 썸네일 격자(누르면 크게 — 이 블록 사진 안에서만 넘김. 지우기는 크게 보기의 휴지통 → 30일 보관 · 8초 「되돌리기」) */
function BlockPhotos({ blockId, title }: { blockId: string; title: string }) {
  const { cardPhotos, view } = usePhotos();
  const list = cardPhotos.filter((p) => p.cardId === blockId);
  if (list.length === 0) return null;
  const ids = list.map((p) => p.id);
  return (
    <ul aria-label={`${title} 사진 ${list.length}장`} className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
      {list.map((p, i) => (
        <li key={p.id}>
          <button type="button" onClick={() => view(p.id, undefined, ids)} aria-label={`${title} 사진 ${i + 1} 크게 보기`}
            className="relative block size-16 overflow-hidden rounded-thumb bg-strong">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/photos/${p.id}?size=thumb`} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            <span className="pointer-events-none absolute inset-0 rounded-thumb ring-1 ring-inset ring-ink/10" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 「＋ 사진」: 누르면 바로 사진 고르기(여러 장), 이 블록 id 를 달아 올린다(단계 = 블록의 「＋ 할 일」 단계) */
function AddPhotoButton({ blockId, stepId, title }: { blockId: string; stepId: number; title: string }) {
  const uid = useId();
  const { uploadToCard } = usePhotos();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input id={`${uid}-f`} type="file" accept="image/*" multiple className="peer sr-only" disabled={busy}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (!files.length) return;
          setBusy(true);
          void uploadToCard(blockId, stepId, files).finally(() => setBusy(false));
        }} />
      <label htmlFor={`${uid}-f`} className={`${addBtnCls} cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-accent-ink ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        <LineIcon name="plus" className="size-4.5" stroke={2.2} />{busy ? '올리는 중' : '사진'}
        <span className="sr-only">: {title}에 사진 올리기</span>
      </label>
    </>
  );
}

/** 블록 꼬리표 하나: 다 했으면 「완료」, 기한 지난 일이 있으면 「기한 지남 n」(위험), 아니면 date 까지 남은 날(3일 안 주의 · 그 밖 회색) */
function StateBadge({ summary, today, date }: { summary: CardSummary; today: string; date: string | null }) {
  if (summary.finished) return <Badge tone="neutral">완료</Badge>;
  if (summary.late > 0) return <Badge tone="danger">기한 지남 {summary.late}</Badge>;
  if (!date) return null;
  const rel = relDay(date, today);
  const tone: BadgeTone = rel.tone === 'late' ? 'danger' : daysBetween(today, date) <= SOON_DAYS ? 'warn' : 'neutral';
  return <Badge tone={tone}>{rel.text}</Badge>;
}
