'use client';

import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { TaskItem, UpdateItem } from '@/lib/core/types';
import { dayRangeLabel, shortDate, todayStr } from '@/lib/client/format';
import { manwon, PROJECT_LABEL } from '@/lib/plan';
import { useProgress } from '@/components/progress/ProgressProvider';
import { cardCls } from '@/components/ui/Card';
import type { StepRef } from '@/components/tasks/TaskComposer';
import { TaskRow } from '@/components/tasks/TaskRow';
import { useEditingSet, useStickyDone } from '@/components/tasks/useTaskList';
import { treeRows } from '@/components/tasks/task-view';
import { toDate, type Pin, type TimelineStep } from './step-dates';
import { dLabel, guestFinish, logWhen, summaryOf, type MoneyAccount, type StepStateRow, type Summary } from './summary-data';
import { Chevron, GuestPlan, GuestWeeks, MoneyBar, Ring, StepRoad, TypeDot, TypeLegend, useWidth, WeekChart } from './SummaryViz';

// 홈 「요약」 탭(보기 고르기 [요약 | 단계 | 달력]의 첫 칸). 그림으로 먼저 보고, 아래 줄을 눌러 원래 자리로 간다(DESIGN.md 8.1.1).
//   로그인 = ① 첫 손님까지(청록 카드: 링 + D-day · 첫 손님 날 · 다음 고정 일정) → ② 지금 하는 단계(14단계 길 + 하는 중 단계 줄)
//          → ③ 할 일(날짜별 네모 그림 · 기한 지남 · 오늘 · 다음 7일 펼치기) → ④ 정할 것 → ⑤ 돈(계좌별 남는 돈 막대) → ⑥ 최근 기록
//   로그인 전 = 첫 손님까지(약 n일 · 주 막대) → 14단계 한눈에 → 처음 세 단계(막대 그림 + 줄) → 최근 바뀐 민박업 규정 — 공개 콘텐츠만 쓴다(현황을 받지 않는다)
// 계산은 summary-data.ts, 그림은 SummaryViz.tsx. 편집은 할 일 줄만 공통 줄(TaskRow) 그대로. 나머지는 누르면 원래 자리로 간다.
// 한 할 일은 요약에 한 번만 나온다(③이 먼저, ④는 남은 결정만). 폰은 한 줄로 쌓고, PC(768px 이상)는 ③ | ④⑥ 두 칸, 나머지는 한 줄을 꽉 채운다.
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const DECIDE_SHOWN = 2;
/** 「12월 11일(금)」 */
const longDate = (iso: string) => { const d = toDate(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일(${DOW[d.getDay()]})`; };
/** 링 가운데 · 표의 남은 날: 「D-32」 · 「오늘」 · 「D+3」(지남) */
const ddayText = (n: number) => (n > 0 ? `D-${n}` : n === 0 ? '오늘' : `D+${-n}`);
/** 카드 맨 아래 「… 보기」 줄(강조색 글자 — 누르는 것) */
const moreCls = 'flex min-h-12 w-full items-center justify-between gap-3 border-t border-line px-4 text-left text-base font-bold text-accent-ink transition-colors hover:bg-sunken focus-visible:-outline-offset-2';
/** 카드 안 묶음 이름(기한 지남 · 오늘 · 다음 7일): 13px 700 */
const groupCls = 'flex gap-1.5 border-t border-line px-4 pt-3 pb-1 text-sm font-bold';

export function HomeSummary(props: {
  steps: TimelineStep[]; currentId: number | null;
  /** 단계 창 열기(steps 배열의 순번) */
  onStep: (index: number) => void;
  /** 그날 창 열기(로그인 전엔 없음) */
  onDay?: (date: string) => void;
  /** 「단계 전체 보기」: 단계 탭으로 바꾼다 */
  onShowSteps: () => void;
  marks?: Pin[];
  fixedDay0?: string;
  guest: boolean;
  /** 로그인 전: 최근 바뀐 규정(공개 콘텐츠)과 주의사항 창 열기 */
  updates?: UpdateItem[];
  onNotice?: (idx: number | null) => void;
}) {
  return props.guest || !props.onDay
    ? <GuestSummary steps={props.steps} onStep={props.onStep} onShowSteps={props.onShowSteps} updates={props.updates ?? []} onNotice={props.onNotice} />
    : <MemberSummary {...props} onDay={props.onDay} />;
}

/** 흰 카드 하나: 머리(제목 17px + 오른쪽 보조 글) + 내용 */
function Panel({ id, title, aside, className = '', children }: { id: string; title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`${cardCls} min-w-0 ${className}`}>
      <div className="flex min-h-11 items-center gap-2 px-4 pt-4">
        <h3 id={id} className="text-lg font-bold text-ink">{title}</h3>
        {aside && <span className="ml-auto flex items-center gap-1.5 text-sm font-normal text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function MemberSummary({ steps, currentId, onStep, onDay, onShowSteps, marks = [], fixedDay0 }: {
  steps: TimelineStep[]; currentId: number | null; onStep: (index: number) => void; onDay: (date: string) => void; onShowSteps: () => void; marks?: Pin[]; fixedDay0?: string;
}) {
  const { doc } = useProgress();
  const uid = useId();
  const { editing, reportEdit } = useEditingSet();
  const { isDone, onToggle } = useStickyDone();
  const [today] = useState(todayStr);
  const [moreNext, setMoreNext] = useState(false);
  const [moreDecide, setMoreDecide] = useState(false);
  const todoRef = useRef<HTMLElement>(null);
  // 링 크기: 청록 카드 폭이 넓으면(PC) 키운다
  const [heroRef, heroWidth] = useWidth<HTMLDivElement>();
  // 줄이 사라지면(지움) 「할 일」 카드로 포커스를 돌린다
  const focusTodo = useCallback(() => { window.requestAnimationFrame(() => todoRef.current?.focus()); }, []);
  if (!doc) return null;

  const s = summaryOf(steps, doc, today, { currentId, marks, fixedDay0, isDone, editing });
  const stepRefs: StepRef[] = steps.map((x) => ({ id: x.id, title: x.title }));
  // 세부 항목은 같은 묶음 안에 부모가 있으면 바로 밑에 들여 쓰고, 없으면 맨 위 층 + 「‘부모’의 세부」
  const rows = (list: TaskItem[], late = false) => treeRows(list, doc.tasks).map(({ item: t, depth, parentTitle }) => (
    <TaskRow key={t.id} t={t} steps={stepRefs} listStepId={null} showStep scope="page" inset depth={depth} parentTitle={parentTitle}
      quietLate={late} onEditChange={reportEdit} onToggle={onToggle} onGone={focusTodo} />
  ));
  const nextOpen = moreNext || s.next7.some((t) => editing.has(t.id));
  const decideOpen = moreDecide || s.decide.slice(DECIDE_SHOWN).some((t) => editing.has(t.id));
  const nothingSoon = s.late.length + s.today.length + s.next7.length === 0;
  const showDecide = s.decide.length > 0 || s.questions.open > 0 || s.questions.unread > 0;
  const pin = s.pins[0];
  const now = s.stepStates.find((x) => x.state === 'now');
  const doing = s.stepStates.filter((x) => x.state === 'doing').map((x) => `${x.id}단계`);
  const roadLabel = [
    `${s.stepsTotal}단계 중 ${s.stepsDone}단계 끝`,
    now ? `지금은 ${now.id}단계 ${now.title}${doing.length ? `이고, ${doing.join(', ')}도 같이 하는 중` : ''}` : doing.length ? `${doing.join(', ')} 하는 중` : '',
  ].filter(Boolean).join('. ');

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start">
      {/* ① 첫 손님까지 */}
      <section aria-labelledby={`${uid}-hero`} className="min-w-0 overflow-hidden rounded-panel bg-hero text-on-hero md:col-span-2">
        <div className="px-4 pt-4"><h3 id={`${uid}-hero`} className="text-base font-bold">첫 손님까지</h3></div>
        <div ref={heroRef} className="md:grid md:grid-cols-[auto_1fr] md:items-center">
          <div className="flex items-center gap-4 px-4 pt-3 pb-4 md:gap-7">
            {s.finish && s.dday !== null && (
              <Ring size={heroWidth >= 560 ? 148 : 128} pct={s.span ? s.elapsed / s.span : 0}>
                <span className="text-display font-bold tabular-nums tracking-tight" aria-hidden>{ddayText(s.dday)}</span>
              </Ring>
            )}
            <div className="min-w-0 flex-1">
              {s.finish && s.dday !== null ? (
                <>
                  <p className="sr-only">{s.dday > 0 ? `첫 손님 날까지 ${s.dday}일 남음` : s.dday === 0 ? '오늘이 첫 손님 날' : `첫 손님 날이 ${-s.dday}일 지남`}</p>
                  <p className="text-xs text-hero-sub">첫 손님 날</p>
                  <p className="text-xl font-bold tabular-nums">
                    <span className="whitespace-nowrap">{longDate(s.finish.date)}</span>
                    {s.finish.estimate && <span className="ml-1 text-sm font-normal text-hero-sub">무렵</span>}
                  </p>
                  <p className="mt-3 flex items-center gap-2 text-sm text-hero-sub">
                    <span className="size-2.5 shrink-0 rounded-full bg-hero-2" aria-hidden />
                    <span className="tabular-nums">{s.span}일 중 <b className="font-bold text-on-hero">{s.elapsed}일</b> 지남</span>
                  </p>
                </>
              ) : <p className="text-base">단계에 날짜를 넣으면 첫 손님 날을 계산해요.</p>}
            </div>
          </div>
          {pin && (
            <div className="px-4 md:pr-4 md:pl-0">
            <button type="button" onClick={() => onDay(pin.date)}
              className="flex min-h-16 w-full items-center gap-3 border-t border-hero-track pt-3 pb-3.5 text-left text-on-hero focus-visible:outline-on-hero md:border-t-0 md:border-l md:py-3 md:pl-5">
              <span className="w-10 shrink-0 text-center tabular-nums" aria-hidden>
                <span className="block text-xs text-hero-sub">{toDate(pin.date).getMonth() + 1}월</span>
                <span className="block text-xl leading-6 font-bold">{toDate(pin.date).getDate()}일</span>
                <span className="block text-xs text-hero-sub">({DOW[toDate(pin.date).getDay()]})</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-hero-sub">다음 고정 일정<span className="sr-only"> {longDate(pin.date)}</span></span>
                <span className="line-clamp-2 text-base font-bold">{pin.label}</span>
                {s.pinsTotal > 1 && <span className="block text-xs text-hero-sub">그다음 일정 {s.pinsTotal - 1}개</span>}
              </span>
              <span className="shrink-0 text-xl font-bold tabular-nums">{ddayText(Math.round((toDate(pin.date).getTime() - toDate(today).getTime()) / 86400000))}</span>
              <Chevron className="text-on-hero" />
            </button>
            </div>
          )}
        </div>
      </section>

      {/* ② 지금 하는 단계 */}
      <Panel id={`${uid}-steps`} title="지금 하는 단계" className="md:col-span-2"
        aside={<>{s.stepsTotal}단계 중 <b className="text-base font-bold text-ink tabular-nums">{s.stepsDone}개</b> 끝</>}>
        <StepRoad states={s.stepStates} label={roadLabel} />
        <TypeLegend className="px-4 pt-1 pb-3" />
        {s.active.length === 0 && <p className="border-t border-line px-4 py-3 text-base text-muted">모든 단계를 끝냈어요.</p>}
        <ul>
          {s.active.map((a) => {
            const d = dLabel(a.due, today);
            const late = d.endsWith('지남');
            return (
              <li key={a.id} className="border-t border-line">
                <button type="button" onClick={() => onStep(a.index)} aria-current={a.current ? 'step' : undefined}
                  className="grid min-h-16 w-full grid-cols-[1fr_auto_16px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken focus-visible:-outline-offset-2">
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <TypeDot type={a.type} />
                      <span className="min-w-0 truncate text-base font-semibold text-ink">{a.id}단계 {a.title}</span>
                      {a.current && <span className="shrink-0 text-sm font-bold text-accent-ink">지금</span>}
                    </span>
                    <span className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2 pl-4.5">
                      <span className="block h-2 overflow-hidden rounded-full bg-track" aria-hidden>
                        {a.all > 0 && <span className="block h-full rounded-full" style={{ width: `${(a.done / a.all) * 100}%`, backgroundColor: `var(--type-${a.type})` }} />}
                      </span>
                      <span className="text-sm text-muted tabular-nums">{a.all > 0 ? `할 일 ${a.done}/${a.all} 끝` : '할 일 없음'}</span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={`block text-lg font-bold tabular-nums ${late ? 'text-danger-ink' : 'text-ink'}`}>{d}</span>
                    <span className="block text-sm text-muted tabular-nums">{shortDate(a.due)}</span>
                  </span>
                  <Chevron />
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={onShowSteps} className={moreCls}>단계 전체 보기<Chevron className="text-accent-ink" /></button>
      </Panel>

      {/* ③ 할 일 */}
      <section ref={todoRef} tabIndex={-1} aria-labelledby={`${uid}-todo`} className={`${cardCls} min-w-0 outline-none`}>
        <div className="flex min-h-11 items-center gap-2 px-4 pt-4"><h3 id={`${uid}-todo`} className="text-lg font-bold text-ink">할 일</h3></div>
        <WeekChart late={s.week.late} days={s.week.days} today={today} />
        {nothingSoon && <p className="border-t border-line px-4 py-3 text-base text-muted">기한 지난 일도, 7일 안에 할 일도 없어요.</p>}
        {s.late.length > 0 && (
          <section aria-labelledby={`${uid}-late`}>
            <h4 id={`${uid}-late`} className={`${groupCls} text-danger-ink`}>기한 지남<span className="tabular-nums">{s.late.length}</span></h4>
            <ul>{rows(s.late, true)}</ul>
          </section>
        )}
        {/* 「오늘」은 비어도 남긴다(다른 묶음이 하나라도 있을 때) — 오늘 마감이 없다는 것도 알릴 거리 */}
        {!nothingSoon && (
          <section aria-labelledby={`${uid}-today`}>
            <h4 id={`${uid}-today`} className={`${groupCls} text-accent-ink`}>오늘{s.today.length > 0 && <span className="tabular-nums">{s.today.length}</span>}</h4>
            {s.today.length > 0
              ? <ul>{rows(s.today)}</ul>
              : <p className="px-4 pt-1 pb-3 text-base text-muted">오늘 마감인 할 일이 없어요.</p>}
          </section>
        )}
        {s.next7.length > 0 && (
          <>
            {nextOpen && (
              <section id={`${uid}-next`} aria-labelledby={`${uid}-next-h`}>
                <h4 id={`${uid}-next-h`} className={`${groupCls} text-ink-soft`}>다음 7일<span className="tabular-nums">{s.next7.length}</span></h4>
                <ul>{rows(s.next7)}</ul>
              </section>
            )}
            <button type="button" aria-expanded={nextOpen} aria-controls={`${uid}-next`} onClick={() => setMoreNext((v) => !v)} className={moreCls}>
              {nextOpen ? '다음 7일 할 일 접기' : `다음 7일 할 일 ${s.next7.length}개 보기`}
              <Chevron className={`text-accent-ink transition-transform ${nextOpen ? '-rotate-90' : 'rotate-90'}`} />
            </button>
          </>
        )}
      </section>

      <div className="flex min-w-0 flex-col gap-4">
        {/* ④ 정할 것 */}
        {showDecide && (
          <Panel id={`${uid}-decide`} title="정할 것">
            <p className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-2 pb-3 text-sm text-muted">
              {s.decide.length > 0 && <span>정할 것 <b className="text-base font-bold text-ink tabular-nums">{s.decide.length}</b></span>}
              {s.questions.open > 0 && <span>답 기다리는 질문 <b className="text-base font-bold text-ink tabular-nums">{s.questions.open}</b></span>}
              {s.questions.unread > 0 && (
                <span className="inline-flex items-center gap-1.5">새 답 <b className="text-base font-bold text-accent-ink tabular-nums">{s.questions.unread}</b>
                  <span className="size-2 rounded-full bg-accent-ink" aria-hidden /></span>
              )}
            </p>
            {s.decide.length > 0 && (
              <div className="border-t border-line">
                <ul>{rows(s.decide.slice(0, DECIDE_SHOWN))}</ul>
                {decideOpen && <ul id={`${uid}-decide-more`} className="border-t border-line">{rows(s.decide.slice(DECIDE_SHOWN))}</ul>}
              </div>
            )}
            {s.decide.length > DECIDE_SHOWN && (
              <button type="button" aria-expanded={decideOpen} aria-controls={`${uid}-decide-more`} onClick={() => setMoreDecide((v) => !v)} className={moreCls}>
                {decideOpen ? '접기' : `정할 것 ${s.decide.length - DECIDE_SHOWN}개 더 보기`}
                <Chevron className={`text-accent-ink transition-transform ${decideOpen ? '-rotate-90' : 'rotate-90'}`} />
              </button>
            )}
            {(s.questions.open > 0 || s.questions.unread > 0) && (
              <Link href="/house/questions" className={moreCls}>질문 보기<Chevron className="text-accent-ink" /></Link>
            )}
          </Panel>
        )}

        {/* ⑥ 최근 기록(PC 에서는 정할 것 아래 같은 칸) */}
        <LogPanel id={`${uid}-log`} logs={s.recentLog} today={today} className="hidden md:block" />
      </div>

      {/* ⑤ 돈 */}
      {s.money && <MoneyPanel id={`${uid}-money`} money={s.money} />}

      {/* ⑥ 최근 기록(폰: 맨 아래) */}
      <LogPanel id={`${uid}-log-m`} logs={s.recentLog} today={today} className="md:hidden" />
    </div>
  );
}

function MoneyPanel({ id, money }: { id: string; money: NonNullable<Summary['money']> }) {
  const known = money.next.filter((r) => r.item.amount !== null);
  const allOut = known.length > 0 && known.every((r) => r.item.amount! < 0);
  const aside = money.next.length === 0 ? '예정된 돈 흐름 없음' : allOut && known.length === money.next.length ? `나갈 돈 ${money.next.length}건을 뺀 뒤` : `들어오고 나갈 돈 ${money.next.length}건을 반영하면`;
  const maxNow = Math.max(1, ...money.after.map((a) => a.now));
  return (
    <Panel id={id} title="돈" aside={aside} className="md:col-span-2">
      {money.after.length === 0 && <p className="px-4 pt-2 pb-3 text-base text-muted">지금 남은 돈을 아직 안 적었어요.</p>}
      {money.after.map((a, i) => <Account key={a.via} a={a} first={i === 0} widthPct={(a.now / maxNow) * 100} />)}
      <div className="h-3" />
      <Link href="/money" className={moreCls}>돈 흐름 전체 보기<Chevron className="text-accent-ink" /></Link>
    </Panel>
  );
}

function Account({ a, first, widthPct }: { a: MoneyAccount; first: boolean; widthPct: number }) {
  const short = a.after < 0;
  return (
    <div className={`px-4 pb-1 ${first ? 'pt-3' : 'pt-4'}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-ink-soft">{a.via === 'cash' ? '현금' : '마이너스 통장 여유'}</span>
        <span className={`ml-auto text-2xl font-bold tabular-nums tracking-tight ${short ? 'text-danger-ink' : 'text-ink'}`}>
          {manwon(a.after)}<span className="ml-1 text-sm font-normal tracking-normal text-muted">{short ? '모자람' : '남음'}</span>
        </span>
      </div>
      <MoneyBar now={a.now} after={a.after} out={a.out} widthPct={widthPct} />
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-sm text-muted">
        <span className="tabular-nums">지금 <b className="font-bold text-ink">{a.now < 0 ? '−' : ''}{manwon(a.now)}</b> 중</span>
        {a.rows.length === 0 && <span>예정된 건 없음</span>}
        {a.rows.map(({ item }) => (
          <span key={item.id} className="tabular-nums">
            {item.date ? shortDate(item.date) : '미정'} {item.project === 'jisan' ? `${PROJECT_LABEL.jisan} ` : ''}{item.text}{' '}
            {item.amount === null
              ? <span>금액 미정</span>
              : <b className={`font-bold ${item.amount < 0 ? 'text-ink' : 'text-plus'}`}>{item.amount < 0 ? '−' : '+'}{manwon(item.amount)}</b>}
            {item.estimate && ' 추정'}
          </span>
        ))}
      </div>
    </div>
  );
}

function LogPanel({ id, logs, today, className }: { id: string; logs: Summary['recentLog']; today: string; className: string }) {
  return (
    <Panel id={id} title="최근 기록" className={className}>
      {logs.length === 0
        ? <p className="px-4 pt-2 pb-3 text-base text-muted">아직 기록이 없어요.</p>
        : (
          <ol className="px-4 pt-2 pb-1">
            {logs.map((l, i) => (
              <li key={l.id} className="relative">
                {i < logs.length - 1 && <span className="absolute top-6 -bottom-2 left-[7px] w-0.5 bg-line" aria-hidden />}
                <Link href="/house/log" className="grid min-h-11 grid-cols-[16px_1fr_16px] items-start gap-3 py-2 pb-3 transition-colors hover:bg-sunken focus-visible:-outline-offset-2">
                  <span className="relative z-10 mt-1.5 ml-0.5 size-3 rounded-full bg-muted ring-3 ring-surface" aria-hidden />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-base font-semibold text-ink">{l.text}</span>
                    <span className="mt-0.5 flex flex-wrap gap-x-2.5 text-sm text-muted tabular-nums"><span>{logWhen(l.at, today)}</span><span>{l.kind}</span></span>
                  </span>
                  <span className="pt-1"><Chevron /></span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      <Link href="/house/log" className={moreCls}>기록 전체 보기<Chevron className="text-accent-ink" /></Link>
    </Panel>
  );
}

// 로그인 전: 공개 콘텐츠(단계 이름 · 공개 일정 날수 · 바뀐 규정)만 쓴다. 현황(할 일 · 기록 · 돈 · 고정 일정 · 단계 진행)은 받지도 않는다.
function GuestSummary({ steps, onStep, onShowSteps, updates, onNotice }: {
  steps: TimelineStep[]; onStep: (index: number) => void; onShowSteps: () => void; updates: UpdateItem[]; onNotice?: (idx: number | null) => void;
}) {
  const uid = useId();
  const [today] = useState(todayStr);
  const finish = guestFinish(steps, today);
  const firstSteps = steps.slice(0, 3);
  const firstEnd = firstSteps.reduce((n, s) => Math.max(n, s.end), 0);
  const recent = updates.map((u, idx) => ({ u, idx })).sort((a, b) => b.u.date.localeCompare(a.u.date) || a.idx - b.idx).slice(0, 3);
  const states: StepStateRow[] = steps.map((s, index) => ({ id: s.id, title: s.title, type: s.type, index, state: 'todo' }));

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby={`${uid}-finish`} className="overflow-hidden rounded-panel bg-hero text-on-hero">
        <div className="px-4 pt-4"><h3 id={`${uid}-finish`} className="text-base font-bold">첫 손님까지</h3></div>
        <div className="px-4 pt-2 pb-4">
          <p className="text-display font-bold tabular-nums tracking-tight">약 {finish.days}<span className="ml-0.5 text-lg font-bold">일</span></p>
          <p className="mt-0.5 text-base text-hero-sub">오늘 시작하면 <b className="font-bold whitespace-nowrap text-on-hero">{longDate(finish.date)}</b> 무렵</p>
          <GuestWeeks days={finish.days} endDate={finish.date} />
        </div>
      </section>

      <Panel id={`${uid}-road`} title={`${steps.length}단계 한눈에`}>
        <StepRoad states={states} label={`${steps.length}단계를 차례로 거쳐 첫 손님을 받아요`} />
        <TypeLegend className="px-4 pt-1 pb-3" />
      </Panel>

      <Panel id={`${uid}-first`} title="처음 세 단계" aside={<span className="tabular-nums">{dayRangeLabel(0, firstEnd)}</span>}>
        <GuestPlan first={firstSteps} total={finish.days} restCount={Math.max(0, steps.length - firstSteps.length)} />
        <ul>
          {firstSteps.map((st, i) => (
            <li key={st.id} className="border-t border-line">
              <button type="button" onClick={() => onStep(i)}
                className="grid min-h-14 w-full grid-cols-[1fr_auto_16px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken focus-visible:-outline-offset-2">
                <span className="flex min-w-0 items-center gap-2"><TypeDot type={st.type} /><span className="min-w-0 text-base font-semibold text-ink">{st.id}단계 {st.title}</span></span>
                <span className="text-sm text-muted tabular-nums">{dayRangeLabel(st.start, st.end)}</span>
                <Chevron />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onShowSteps} className={moreCls}>단계 전체 보기<Chevron className="text-accent-ink" /></button>
      </Panel>

      {recent.length > 0 && onNotice && (
        <Panel id={`${uid}-rules`} title="최근 바뀐 민박업 규정">
          <ul className="mt-2">
            {recent.map(({ u, idx }) => {
              const m = u.date.match(/^(\d{4})-(\d{1,2})/);
              return (
                <li key={idx} className="border-t border-line">
                  <button type="button" onClick={() => onNotice(idx)}
                    className="grid min-h-18 w-full grid-cols-[52px_1fr_16px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken focus-visible:-outline-offset-2">
                    <span className="rounded-control bg-sunken py-1.5 text-center" aria-hidden>
                      <b className="block text-xl leading-6 font-bold text-ink tabular-nums">{m ? `${Number(m[2])}월` : u.date}</b>
                      {u.dateWord && <span className="block text-xs text-ink-soft">{u.dateWord}</span>}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-semibold text-ink">{u.title}</span>
                      <span className="block text-sm text-muted tabular-nums">
                        {m ? `${m[1]}년` : ''}
                        <span className="sr-only">{m ? ` ${Number(m[2])}월` : u.date} {u.dateWord ?? ''}</span>
                      </span>
                    </span>
                    <Chevron />
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={() => onNotice(null)} className={moreCls}>주의사항 전체 보기<Chevron className="text-accent-ink" /></button>
        </Panel>
      )}
    </div>
  );
}
