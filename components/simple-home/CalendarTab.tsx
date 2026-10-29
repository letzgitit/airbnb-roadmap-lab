'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ProgressDoc, TaskItem } from '@/lib/core/types';
import { useProgress } from '@/components/progress/ProgressProvider';
import { GuideButton } from '@/components/tasks/TaskGuide';
import { TaskPhotos } from '@/components/tasks/TaskPhotos';
import { TaskRow } from '@/components/tasks/TaskRow';
import { useGuideIds } from '@/components/tasks/guides-client';
import { phonesIn, telHref } from '@/components/tasks/phone';
import { treeRows, SOON_DAYS } from '@/components/tasks/task-view';
import { useEditingSet, useStickyDone } from '@/components/tasks/useTaskList';
import type { StepRef } from '@/components/tasks/TaskComposer';
import { Badge } from '@/components/ui/Badge';
import { textBtn } from '@/components/ui/buttonCls';
import { GroupHead } from '@/components/ui/GroupHead';
import { LineIcon } from '@/components/ui/LineIcon';
import { blockCls } from './StepBlock';
import { useMonthSwipe } from './TabSwipe';
import {
  addMonths, dateParts, daysBetween, dayDots, dayTasks, fieldLabel, monthOf, monthWeeks, relDay, taskTabs, upcomingTasks, UPCOMING_DAYS,
  type DayDot, type WorkTabId,
} from './home-model';

// 요일 순서 일 · 월 · 화 · 수 · 목 · 금 · 토(2026-10-28 사이트 주인 지시 — monthWeeks 도 일요일 시작)
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** 분야 점 색(globals.css --color-ev-* — 데일리 「달력」 묶음 --ev-* 에서 고른 세 색) */
export const FIELD_DOT: Record<WorkTabId, string> = { admin: 'bg-ev-admin', facility: 'bg-ev-facility', ops: 'bg-ev-ops' };
// 일요일 빨강 · 토요일 파랑(데일리 --cal-sun · --cal-sat = 위험 빨강 · 안내 파랑). 지난 날의 일 · 토는 회색과 반씩 섞어 흐리게(데일리 app.css 「달력」 묶음)
const SUN = 'text-danger-ink', SAT = 'text-info-ink';
const SUN_DIM = 'text-[color-mix(in_srgb,var(--color-danger-ink),var(--color-muted))]';
const SAT_DIM = 'text-[color-mix(in_srgb,var(--color-info-ink),var(--color-muted))]';

/**
 * 달력 탭(기획 27의 6절 — 데일리 「일정 · 모집」 그대로). 흰 블록 하나에 위에서 아래로:
 * - 달 머리: ‹ 「2026년 10월」 › + 오른쪽 「오늘」(이번 달 · 오늘을 보고 있으면 없음).
 * - 요일 줄 일 · 월 · 화 · 수 · 목 · 금 · 토(13, 일요일 빨강 · 토요일 파랑), 주마다 옅은 선.
 * - 판(요일 줄 + 날 칸)을 왼쪽으로 쓸면 다음 달, 오른쪽으로 쓸면 이전 달(TabSwipe.tsx useMonthSwipe — 판 위 쓸기는 탭을 넘기지 않는다).
 * - 날 칸(56px): 숫자 16 + 36px 동그라미 — 오늘 = 검정 동그라미 · 흰 숫자, 고른 날 = 회색 동그라미, 앞으로 할 일이 있는 날 = 굵게. 다른 달 날은 비워 둔다.
 *   숫자 밑 분야 색 점(그날 마감 할 일의 분야 — 행정 · 설비 · 운영 셋까지, 그 분야를 다 끝냈으면 회색 점). 칸 안에 글자는 없다.
 * - 「오늘」(또는 고른 날 「10월 30일 (금)」) 묶음: 그날 마감 · 그날 시작 할 일 줄(TaskRow 쉬운 모양 — 체크 · 설명서 · 연필 · 휴지통). 없으면 「오늘은 할 일이 없어요」.
 *   날을 누르면 이 자리가 그날 할 일로 바로 바뀐다(한 번 더 누르게 하지 않는다).
 * - 「다가오는 일정 n건」: 내일부터 14일 안 마감인 안 끝난 할 일 — 위 묶음에 나온 것은 뺀다(데일리 일정 줄 — 왼쪽 체크 칸, 큰 날짜 「29 / 10월 목」, 제목,
 *   분야 점 + 꼬리표, 오른쪽 남은 날 — 3일 안 = 주의 꼬리표, 그 밖 = 13 보조 글자). 줄을 누르면 그 자리에서 펼쳐 메모 · 사진 · 도움말 · 고치기 · 지우기.
 * 「첫 손님까지」 큰 카드는 없앴다(머리 띠에 있다).
 */
export function CalendarTab({ rowSteps, today }: { rowSteps: StepRef[]; today: string }) {
  const { doc } = useProgress();
  const uid = useId();
  const tabOf = useMemo(() => (doc ? taskTabs(doc) : new Map<string, WorkTabId>()), [doc]);
  const dots = useMemo(() => (doc ? dayDots(doc, tabOf) : new Map<string, DayDot[]>()), [doc, tabOf]);
  const [month, setMonth] = useState(() => monthOf(today));
  const [picked, setPicked] = useState<string>(today);
  const dayRef = useRef<HTMLDivElement>(null);
  const userPicked = useRef(false);
  // 사람이 날을 고르면 그날 목록 머리가 보이게(처음 열 때는 끌어오지 않는다)
  useEffect(() => {
    if (userPicked.current) dayRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [picked]);
  // 달력 판(요일 줄 + 날짜 칸)을 좌우로 쓸면 달을 넘긴다 — ‹ › 단추와 같다. 판에는 data-noswipe 를 달아 탭 넘기기가 이 터치를 받지 않게
  const board = useRef<HTMLDivElement>(null);
  useMonthSwipe(board, month, (step) => setMonth((v) => addMonths(v, step)));
  if (!doc) return null;

  const thisMonth = monthOf(today);
  const [y, mo] = month.split('-').map(Number);
  const weeks = monthWeeks(month);
  const pick = (d: string) => { userPicked.current = true; setPicked(d); if (monthOf(d) !== month) setMonth(monthOf(d)); };
  const navBtn = 'flex size-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-sunken hover:text-ink';

  return (
    <section aria-label="할 일 달력" className={`${blockCls} pb-2`}>
      <div className="px-3 md:px-4">
        {/* 달 머리(데일리 .cal-h): ‹ 달 이름 › … 「오늘」 */}
        <div className="flex min-h-12 items-center">
          <button type="button" aria-label="이전 달" className={navBtn} onClick={() => setMonth((v) => addMonths(v, -1))}>
            <LineIcon name="chevron" className="size-4 rotate-180" stroke={2.2} />
          </button>
          <h2 className="min-w-0 text-base font-bold text-ink tabular-nums" aria-live="polite">{y}년 {mo}월</h2>
          <button type="button" aria-label="다음 달" className={navBtn} onClick={() => setMonth((v) => addMonths(v, 1))}>
            <LineIcon name="chevron" className="size-4" stroke={2.2} />
          </button>
          {!(month === thisMonth && picked === today) && (
            <button type="button" className={`${textBtn} ml-auto mr-0 px-2`} onClick={() => { setMonth(thisMonth); pick(today); }}>오늘</button>
          )}
        </div>
        <div ref={board} data-noswipe>
        <div className="grid grid-cols-7 border-b border-line text-center text-meta leading-7" aria-hidden>
          {DOW.map((d, i) => <span key={d} className={i === 0 ? SUN : i === 6 ? SAT : 'text-muted'}>{d}</span>)}
        </div>
        <div role="group" aria-label={`${mo}월 달력`}>
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 border-b border-line">
              {week.map((d, i) => {
                const inMonth = d.slice(0, 7) === month.slice(0, 7);
                // 다른 달 날은 비워 둔다(데일리처럼 — 그 달 날만 보인다)
                if (!inMonth) return <span key={d} aria-hidden className="h-14" />;
                const isToday = d === today;
                const on = d === picked;
                const list = dots.get(d) ?? [];
                const dim = d < today;
                const busy = !dim && list.some((x) => !x.done);
                const { wd } = dateParts(d);
                const say = list.length ? `, ${list.map((x) => `${fieldLabel(x.tab)}${x.done ? ' 완료' : ''}`).join(', ')} 할 일` : '';
                const label = `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일 ${wd}요일${isToday ? ', 오늘' : ''}${say}`;
                // 글자색: 일 빨강 · 토 파랑(지난 날은 흐리게) · 나머지 본문색. 앞으로 할 일이 있는 날은 굵게
                const tint = i === 0 ? (dim ? SUN_DIM : SUN) : i === 6 ? (dim ? SAT_DIM : SAT) : busy ? 'text-ink' : 'text-ink-soft';
                const circle = isToday ? 'bg-ink font-bold text-surface' : on ? `bg-strong font-bold ${tint}` : `${tint} ${busy ? 'font-bold' : 'font-normal'}`;
                return (
                  <button key={d} type="button" aria-pressed={on} aria-label={label} aria-controls={`${uid}-day`} onClick={() => pick(d)}
                    className="group relative flex h-14 min-w-0 justify-center pt-1.5 focus-visible:-outline-offset-2">
                    <span className={`flex size-9 items-center justify-center rounded-full text-base tabular-nums transition-colors ${circle} ${!isToday && !on ? 'group-hover:bg-sunken' : ''}`}>
                      {Number(d.slice(8))}
                    </span>
                    {list.length > 0 && (
                      <span className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-[3px]" aria-hidden>
                        {list.map((x) => <i key={x.tab} className={`block size-1.5 rounded-full ${x.done ? 'bg-muted' : FIELD_DOT[x.tab]}`} />)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        </div>
      </div>

      <div id={`${uid}-day`} ref={dayRef} aria-live="polite" className="scroll-mt-[calc(var(--spacing-tabbar)+0.5rem)]">
        <DayList key={picked} doc={doc} date={picked} today={today} steps={rowSteps} />
      </div>
      <Upcoming doc={doc} today={today} picked={picked} steps={rowSteps} tabOf={tabOf} />
    </section>
  );
}

/** 「오늘」(또는 고른 날) 묶음: 그날 마감 + 그날 시작 할 일 줄(쉬운 모양 — 체크 · 설명서 · 연필 · 휴지통). 마감 쪽은 날짜 줄을 숨긴다(머리가 말한다) */
function DayList({ doc, date, today, steps }: { doc: ProgressDoc; date: string; today: string; steps: StepRef[] }) {
  const uid = useId();
  const { reportEdit } = useEditingSet();
  const { due, starting } = useMemo(() => dayTasks(doc, date), [doc, date]);
  const isToday = date === today;
  const { md, wd } = dateParts(date);
  const name = isToday ? '오늘' : `${md.replace('/', '월 ')}일 (${wd})`;
  const rows = (list: TaskItem[], hideDate: boolean) => treeRows(list, doc.tasks).map((r) => (
    <TaskRow key={r.item.id} t={r.item} steps={steps} listStepId={null} scope="page" simple depth={r.depth} hideDate={hideDate}
      parentTitle={r.parentTitle} onEditChange={reportEdit} onToggle={() => undefined} onGone={() => undefined} />
  ));
  const n = due.length + starting.length;
  return (
    <section aria-labelledby={`${uid}-h`}>
      <GroupHead id={`${uid}-h`} name={name} count={n} />
      {n === 0 ? (
        <p className="px-5 pb-3 pt-2 text-cta text-muted">{isToday ? '오늘은 할 일이 없어요.' : '이날은 할 일이 없어요.'}</p>
      ) : (
        <ul className="px-5">{rows(due, true)}{rows(starting, false)}</ul>
      )}
    </section>
  );
}

/**
 * 「다가오는 일정 n건」: 내일부터 14일 안 마감인 안 끝난 할 일(방금 체크한 줄은 8초 동안 자리를 지킨다).
 * 위 「오늘」 · 고른 날 묶음에 이미 나온 할 일(그날 마감 · 그날 시작)은 뺀다(같은 줄이 두 번 나오지 않게).
 */
function Upcoming({ doc, today, picked, steps, tabOf }: { doc: ProgressDoc; today: string; picked: string; steps: StepRef[]; tabOf: Map<string, WorkTabId> }) {
  const uid = useId();
  const { isDone, onToggle } = useStickyDone();
  const list = useMemo(() => upcomingTasks(doc, today, UPCOMING_DAYS, isDone).filter((t) => t.due !== picked && t.start !== picked), [doc, today, picked, isDone]);
  return (
    <section aria-labelledby={`${uid}-h`}>
      <GroupHead id={`${uid}-h`} name="다가오는 일정" count={list.length} />
      {list.length === 0 ? (
        <p className="px-5 pb-3 pt-2 text-cta text-muted">앞으로 2주 안에 마감인 할 일이 없어요.</p>
      ) : (
        <ul className="px-5">
          {list.map((t) => <UpcomingRow key={t.id} t={t} today={today} steps={steps} tab={tabOf.get(t.id) ?? null} onToggle={onToggle} />)}
        </ul>
      )}
    </section>
  );
}

/**
 * 다가오는 일정 한 줄(데일리 .evr): [체크 칸] [큰 날짜 「29」 + 「10월 목」] [제목 16 (두 줄까지) / 분야 점 + 「행정」 꼬리표 ……… 남은 날] [꺾쇠].
 * 누르면 그 자리에서 펼친다: 메모 전체 · 메모 사진(「＋ 사진」) · 도움말 · 고치기(그 자리에서 고치는 폼) · 지우기(바로 지우고 8초 「되돌리기」).
 */
function UpcomingRow({ t, today, steps, tab, onToggle }: { t: TaskItem; today: string; steps: StepRef[]; tab: WorkTabId | null; onToggle: (t: TaskItem) => void }) {
  const uid = useId();
  const { send, toast } = useProgress();
  const guideIds = useGuideIds();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const seenOpen = useRef(false);
  const due = t.due!;
  const { wd } = dateParts(due);
  const rel = relDay(due, today);
  // 남은 날: 3일 안이면 주의 꼬리표, 그 밖은 13 보조 글자(데일리 .evr-n)
  const soon = daysBetween(today, due) <= SOON_DAYS;
  const note = (t.note ?? '').trim();
  const guide = guideIds[t.id];

  if (editing) {
    // 고치는 폼은 할 일 줄(TaskRow)의 것을 그대로 — 폼을 닫으면(저장 · 취소) 펼친 줄로 돌아온다
    return (
      <TaskRow t={t} steps={steps} listStepId={null} scope="page" simple autoEdit onToggle={onToggle} onGone={() => setEditing(false)}
        onEditChange={(_id, on) => { if (on) seenOpen.current = true; else if (seenOpen.current) { seenOpen.current = false; setEditing(false); } }} />
    );
  }
  const quickDel = () => {
    void send({ op: 'task.delete', id: t.id }).then((r) => {
      if (r.ok) toast('할 일을 삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'task.restore', id: t.id }) } });
    });
  };
  const iconBtn = 'flex size-11 shrink-0 items-center justify-center rounded-control text-ink-soft transition-colors hover:bg-sunken';
  return (
    <li className="border-t border-line first:border-t-0">
      <div className="flex items-center">
      {/* 줄 왼쪽 체크 칸 하나(할 일 줄과 같은 꼴 — 22px 네모, 누르는 칸 44px) */}
      <label className="relative -ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center">
        <input type="checkbox" checked={t.done} aria-label={`${t.text} 완료`}
          className="peer size-5.5 cursor-pointer appearance-none rounded-chip border-[1.5px] border-faint bg-surface transition-colors checked:border-ink checked:bg-ink"
          onChange={(e) => { onToggle(t); void send({ op: 'task.update', id: t.id, patch: { done: e.target.checked } }); }} />
        <LineIcon name="check" stroke={2.6} className="pointer-events-none absolute size-4 text-surface opacity-0 peer-checked:opacity-100" />
      </label>
      <button type="button" aria-expanded={open} aria-controls={`${uid}-d`} onClick={() => setOpen((v) => !v)}
        className="flex min-h-15 min-w-0 flex-1 items-center gap-3 py-2 text-left active:opacity-60">
        <span className="flex w-11 shrink-0 flex-col items-center gap-0.5 leading-none" aria-hidden>
          <b className="text-2xl font-semibold tracking-[-0.02em] text-ink tabular-nums">{Number(due.slice(8))}</b>
          <small className="whitespace-nowrap text-meta text-muted">{Number(due.slice(5, 7))}월 {wd}</small>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className={`text-base leading-[1.3] text-ink-soft ${open ? '' : 'line-clamp-2'}`}>
            <span className="sr-only">{Number(due.slice(5, 7))}월 {Number(due.slice(8))}일 {wd}요일, </span>{t.text}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-meta text-muted">
            {tab && <><i className={`block size-[7px] shrink-0 rounded-full ${FIELD_DOT[tab]}`} aria-hidden /><Badge>{fieldLabel(tab)}</Badge></>}
            {t.kind === '문의' && <Badge tone="info">문의 필요</Badge>}
            {soon ? <Badge tone="warn" className="ml-auto">{rel.text}</Badge> : <span className="ml-auto whitespace-nowrap tabular-nums">{rel.text}</span>}
          </span>
        </span>
        <LineIcon name="chevron" className={`size-4 shrink-0 text-muted transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} stroke={2} />
      </button>
      </div>
      {open && (
        // 펼친 내용은 제목 글 줄에 맞춘다(체크 칸 34 + 날짜 칸 44 + 사이 12)
        <div id={`${uid}-d`} className="pb-3 pl-[90px]">
          {note && (
            <div className="max-w-[36em] space-y-2 break-keep pb-1 text-base leading-[1.7] text-ink-soft [overflow-wrap:anywhere]">
              {note.split(/\n+/).map((para, i) => <p key={i} className="whitespace-pre-wrap">{para}</p>)}
            </div>
          )}
          {[...new Set(phonesIn(note))].map((p) => <a key={p} href={telHref(p)} className={`${textBtn} mx-0 mr-4 tabular-nums`}><i className="fas fa-phone mr-1.5" aria-hidden />{p}</a>)}
          <TaskPhotos taskId={t.id} stepId={t.stepId} />
          {/* 단추 줄: [도움말] ……… [고치기] [지우기] — 완료 체크는 줄 왼쪽 칸 하나 */}
          <div className="flex items-center gap-1">
            {guide && <span className="inline-flex items-center gap-0.5 text-cta font-semibold text-ink-soft">도움말<GuideButton taskId={t.id} title={t.text} version={guide.version} /></span>}
            <span className="ml-auto flex items-center">
              <button type="button" aria-label={`${t.text} 고치기`} onClick={() => setEditing(true)} className={iconBtn}><LineIcon name="pen" className="size-5" /></button>
              <button type="button" aria-label={`${t.text} 삭제`} onClick={quickDel} className={`${iconBtn} -mr-2.5 hover:text-danger-ink active:text-danger-ink`}><LineIcon name="trash" className="size-5" /></button>
            </span>
          </div>
        </div>
      )}
    </li>
  );
}
