'use client';

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { shortDate, todayStr } from '@/lib/client/format';
import { useProgress } from '@/components/progress/ProgressProvider';
import { Card, cardRowCls } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { TYPE_COLOR } from '@/components/TimelineChart';
import { addDays, diffDays, mondayOf, pinsOf, stepRanges, toDate, type Pin, type TimelineStep } from './step-dates';

export type { TimelineStep } from './step-dates';

// 홈 「단계」의 로그인 화면: 실제 날짜 위의 단계 타임라인. 고른 날의 할 일은 날짜를 누르면 뜨는 창(DaySheet, #day-YYYY-MM-DD)에 있다.
//
// ┌ 단계 상자 ─────────────────────────────────────────
// │ 단계 종류 범례(한 줄) / 「고정 일정」 줄(핀 + 날짜 · 이름 글자 단추, 누르면 그날 창)
// │ ┌ 가로로 넘겨 보는 한 상자(날짜 띠와 막대가 같은 배율 — 하루 30px) ─────────
// │ │ 주 줄: 「10월 4주」(그 주 목요일이 든 달의 몇째 주), 주가 바뀌는 자리에 세로 선
// │ │ 날짜 줄: 하루 한 칸 — 요일 첫 글자(고정 일정 날은 핀) · 날짜 숫자 · 그날 할 일 점(기한 지난 안 끝난 일이 있으면 빨간 점).
// │ │   오늘 = 강조색 글자, 마지막으로 연 날 = ink 2px 테두리. 누르면 그날 창.
// │ │ 「끝난 단계 n개」(접음) → 단계 줄: 이름(+ 「지금」 · 완료 체크)이 막대 왼쪽 끝 위에 붙어 다니고, 막대는 16px 색면(최소 14px).
// │ │   막대가 화면 밖이면 보이는 쪽 끝에 「‹ 10/20까지」 「11/10부터 ›」. 줄을 누르면 단계 창.
// │ │ 오늘 = 청록 2px 선, 고정 일정 = ink-soft 1px 선: 날짜 줄 위부터 막대 끝까지 같은 x(이름 · 날짜 숫자는 선 위에 면 바탕으로 깔린다).
// │ └ 처음엔 남아 있는 일(안 끝난 할 일 마감일 중 가장 이른 날, 없으면 오늘)이 왼쪽 끝 한두 칸 안쪽에 오게 넘겨 둔다. 손가락은 기본 가로 스크롤, PC 는 마우스로 끌어 넘긴다(끈 뒤에 놓아도 창이 열리지 않는다).
// │ 기한 지난 안 끝난 할 일이 있으면 맨 아래 「기한 지남 n개」 한 줄(누르면 오늘 창).
// └──────────────────────────────────────────────
// 축 범위: 끝 = 단계 목표일 중 가장 늦은 날과 오늘 중 늦은 날이 든 주의 일요일(목표일이 없으면 단계 기간 끝). 그 뒤의 할 일 · 고정 일정은
//   띠에 넣지 않고 띠 오른쪽 끝에 「12/14 이후 n개」로만. 시작 = 끝난 단계를 접어 두면 보이는 단계 · 오늘 · 고정 일정 · 안 끝난 할 일 마감 중
//   가장 이른 날이 든 주의 월요일(펼치면 전체).
// 실제 날짜는 로그인 뒤 /api/progress 로 받은 현황에서만 계산한다(공개 HTML 에는 없다).

const DAY = 30; // 하루 한 칸 폭(px)
const MIN_BAR = 14; // 막대 최소 폭(px)
const LEAD_DAYS = 1.5; // 처음 열 때 시작 날 왼쪽에 남길 칸 수
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const colorOf = (type: string) => (TYPE_COLOR as Record<string, string>)[type] ?? 'var(--prep-bar)';
/** 그 주(월요일)의 이름: 목요일이 든 달의 몇째 주 */
function weekName(monday: string): string {
  const thu = toDate(addDays(monday, 3));
  return `${thu.getMonth() + 1}월 ${Math.ceil(thu.getDate() / 7)}주`;
}

export function DateTimeline({ steps, currentId, onStep, onDay, fixedDay0, marks = [], legend }: {
  steps: TimelineStep[];
  currentId: number | null;
  /** 단계 창 열기(steps 배열의 순번) */
  onStep: (index: number) => void;
  /** 그날 할 일 창 열기 */
  onDay: (date: string) => void;
  /** 콘텐츠의 날수가 이미 정해진 날에서 센 값이면 그 날(예: 지산 2026-09-01) */
  fixedDay0?: string;
  /** 고정 일정에 더할 표시(예: 지산 만기) */
  marks?: Pin[];
  /** 단계 종류 범례(상자 맨 위) */
  legend?: ReactNode;
}) {
  const { doc } = useProgress();
  const [today] = useState(todayStr);
  const [picked, setPicked] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(0);
  const [sl, setSl] = useState(0);
  // PC 마우스 끌기
  const drag = useRef<{ x: number; left: number; id: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const hasDoc = !!doc;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasDoc]);

  // 축 범위(아래 렌더와 같은 계산) — 처음 넘겨 둘 자리를 정하려고 효과 앞에서 구한다
  const ranges = doc ? stepRanges(steps, doc, today, fixedDay0) : [];
  const tasks = doc ? Object.values(doc.tasks).filter((t) => !t.deletedAt) : [];
  const pins = pinsOf(doc, marks);
  const targets = doc ? Object.values(doc.steps).map((s) => s.targetDate).filter((d): d is string => !!d).sort() : [];
  const endBase = [targets[targets.length - 1] ?? ranges.map((r) => r.to).sort().pop() ?? today, today].sort().pop()!;
  const last = addDays(mondayOf(endBase), 6);
  const openDues = tasks.filter((t) => !t.done && t.due).map((t) => t.due!);
  const startSrc = (showDone
    ? [...ranges.map((r) => r.from), ...tasks.map((t) => t.due).filter((d): d is string => !!d), ...pins.map((p) => p.date), today]
    : [...ranges.filter((r) => !r.done).map((r) => r.from), today, ...pins.map((p) => p.date), ...openDues]
  ).filter((d) => d <= last).sort();
  const first = mondayOf(startSrc[0] ?? today);
  const total = diffDays(first, last) + 1;
  const x = (iso: string) => diffDays(first, iso) * DAY;

  // 처음엔 「남아 있는 일」부터: 안 끝난 할 일 마감일 중 가장 이른 날(없으면 오늘)을 왼쪽 끝 한두 칸 안쪽에(폭을 처음 잰 뒤 한 번)
  const anchor = openDues.filter((d) => d >= first && d <= last).sort()[0] ?? today;
  const scrolled = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !viewW || scrolled.current) return;
    scrolled.current = true;
    el.scrollLeft = Math.max(0, diffDays(first, anchor) * DAY - LEAD_DAYS * DAY);
  }, [viewW, first, anchor]);

  if (!doc) return null;

  const width = total * DAY;
  const days = Array.from({ length: total }, (_, i) => addDays(first, i));
  const weeks = days.filter((_, i) => i % 7 === 0);
  const inAxis = (d: string) => d >= first && d <= last;
  const axisPins = pins.filter((p) => inAxis(p.date));
  const pinsOn = (d: string) => pins.filter((p) => p.date === d);
  const beyond = tasks.filter((t) => !t.done && t.due && t.due > last).length + pins.filter((p) => p.date > last).length;

  const dayInfo = new Map<string, { n: number; late: boolean }>();
  tasks.forEach((t) => {
    if (!t.due) return;
    const c = dayInfo.get(t.due) ?? { n: 0, late: false };
    c.n += 1;
    if (!t.done && t.due < today) c.late = true;
    dayInfo.set(t.due, c);
  });
  const lateCount = tasks.filter((t) => !t.done && t.due && t.due < today).length;
  const doneRanges = ranges.filter((r) => r.done);
  const shownRanges = ranges.filter((r) => !r.done || showDone);
  const vw = viewW || 360;
  const leftEdge = sl + 16;
  const rightEdge = sl + vw - 16;
  const openDay = (d: string) => { setPicked(d); onDay(d); };

  // PC 마우스로 끌어 넘기기(손가락은 기본 가로 스크롤). 끈 뒤의 클릭은 먹는다
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, id: e.pointerId, moved: false };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const delta = e.clientX - d.x;
    if (!d.moved && Math.abs(delta) > 6) { d.moved = true; e.currentTarget.setPointerCapture(e.pointerId); }
    if (d.moved) e.currentTarget.scrollLeft = d.left - delta;
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
  };

  // 오늘 · 고정 일정 세로선: 날짜 줄 위부터 막대 끝까지 같은 x
  const vLines = (
    <>
      {axisPins.map((p) => <span key={`l${p.date}${p.label}`} className="pointer-events-none absolute inset-y-0 z-10 block w-px bg-ink-soft" style={{ left: x(p.date) + DAY / 2 }} aria-hidden />)}
      {inAxis(today) && <span className="pointer-events-none absolute inset-y-0 z-10 block w-0.5 -translate-x-1/2 bg-accent-ink" style={{ left: x(today) + DAY / 2 }} aria-hidden />}
    </>
  );

  return (
    <Card>
      {legend && <div className="border-b border-line px-4 py-2">{legend}</div>}
      {pins.length > 0 && (
        <div className="flex items-center gap-x-4 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="고정 일정">
          <span className="shrink-0 whitespace-nowrap text-sm font-normal text-ink-soft"><i className="fas fa-thumbtack mr-1.5" aria-hidden />고정 일정</span>
          {pins.map((p) => (
            <button key={`${p.date}${p.label}`} type="button" onClick={() => openDay(p.date)}
              className="inline-flex min-h-11 shrink-0 items-center gap-x-1.5 whitespace-nowrap text-sm text-ink-soft hover:underline">
              <span className="font-bold">{shortDate(p.date)}</span><span className="font-normal">{p.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 날짜 띠 + 막대: 한 상자에서 같이 가로로 넘긴다 */}
      <div ref={scrollRef} onScroll={(e) => setSl(e.currentTarget.scrollLeft)}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onClickCapture={(e) => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); } }}
        className="overflow-x-auto overscroll-x-contain select-none">
        <div className="relative" style={{ width, minWidth: '100%' }}>
          {vLines}
          {/* 주 줄 */}
          <div className="relative flex h-6 border-b border-line" aria-hidden>
            {weeks.map((m, i) => (
              <span key={m} className={`relative z-20 shrink-0 truncate px-1.5 pt-1 text-xs font-bold text-ink-soft ${i > 0 ? 'border-l border-line-strong' : ''}`} style={{ width: DAY * 7 }}>
                {weekName(m)}
              </span>
            ))}
          </div>
          {/* 날짜 줄 */}
          <div role="group" aria-label="날짜 고르기" className="relative flex border-b border-line">
            {days.map((d, i) => {
              const dt = toDate(d);
              const isToday = d === today;
              const on = d === picked;
              const c = dayInfo.get(d);
              const pin = pinsOn(d);
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => openDay(d)}
                  aria-label={`${dt.getMonth() + 1}월 ${dt.getDate()}일 ${DOW[dt.getDay()]}요일${isToday ? ' 오늘' : ''}${pin.length ? `, 고정 일정 ${pin.map((p) => p.label).join(', ')}` : ''}${c ? `, 마감 할 일 ${c.n}개` : ''}${c?.late ? ', 기한 지난 일 있음' : ''}`}
                  className={`flex min-h-11 shrink-0 flex-col items-center pt-0.5 pb-1 focus-visible:-outline-offset-2 ${i % 7 === 0 && i > 0 ? 'border-l border-line-strong' : ''}`}
                  style={{ width: DAY }}>
                  <span className={`relative z-20 flex h-4 items-center bg-surface px-0.5 text-xs ${isToday ? 'font-bold text-accent-ink' : 'font-normal text-muted'}`}>
                    {pin.length > 0 ? <i className="fas fa-thumbtack text-ink-soft" aria-hidden /> : isToday ? '오늘' : DOW[dt.getDay()]}
                  </span>
                  <span className={`relative z-20 flex size-7 items-center justify-center rounded-full bg-surface text-sm tabular-nums ${on ? 'font-bold ring-2 ring-inset ring-ink' : isToday ? 'font-bold' : 'font-semibold'} ${isToday ? 'text-accent-ink' : 'text-ink'}`}>
                    {dt.getDate()}
                  </span>
                  {/* 그날 할 일 점(기한 지난 안 끝난 일이 있으면 빨강) */}
                  <span className="relative z-20 mt-0.5 flex h-1.5 items-center">
                    {c && <span className={`block size-1.5 rounded-full ${c.late ? 'bg-danger-ink' : 'bg-ink-soft'}`} aria-hidden />}
                  </span>
                </button>
              );
            })}
          </div>
          {beyond > 0 && (
            <span className="pointer-events-none absolute top-1 right-1 z-20 whitespace-nowrap bg-surface px-1 text-xs font-normal text-muted">
              {shortDate(addDays(last, 1))} 이후 {beyond}개<i className="fas fa-chevron-right ml-1 text-xs" aria-hidden />
            </span>
          )}

          {/* 단계 막대 */}
          <ol aria-label="단계별 기간">
            {doneRanges.length > 0 && (
              <li className={`${cardRowCls} relative z-20 bg-surface`}>
                <div className="sticky left-0" style={{ width: vw }}>
                  <FoldRow label="끝난 단계" count={doneRanges.length} open={showDone} onToggle={() => setShowDone((v) => !v)} />
                </div>
              </li>
            )}
            {shownRanges.map((r) => {
              const cur = currentId === r.id;
              const barL = x(r.from);
              const barR = x(r.to) + DAY;
              const after = barL > rightEdge; // 막대가 오른쪽 화면 밖
              const before = barR < leftEdge; // 막대가 왼쪽 화면 밖
              // 이름 자리: 막대 왼쪽 끝 위. 화면 오른쪽 끝을 넘으면 넘지 않을 만큼 왼쪽으로 당긴다(글자 폭은 13px 글자로 어림)
              const nameW = (`${r.id}. ${r.title}`.length + (cur ? 4 : 0)) * 13;
              const nameL = after || before ? leftEdge : Math.max(leftEdge, Math.min(barL, rightEdge - nameW));
              return (
                // 띠 끝(축 끝) 뒤로 늘어난 막대는 줄 안에서 잘라 상자 폭을 늘리지 않는다
                <li key={r.id} className={`${cardRowCls} relative h-12 overflow-hidden`}>
                  <button type="button" onClick={() => onStep(steps.findIndex((s) => s.id === r.id))} aria-current={cur ? 'step' : undefined}
                    aria-label={`${r.id}. ${r.title}, ${shortDate(r.from)}부터 ${shortDate(r.to)}까지${cur ? ', 지금' : ''}${r.done ? ', 완료' : ''}`}
                    className={`group absolute inset-0 block text-left transition-colors focus-visible:-outline-offset-2 ${cur ? 'bg-accent-soft' : 'hover:bg-sunken'}`}>
                    {/* 이름: 막대 왼쪽 끝 바로 위. 세로선보다 위에 면 바탕으로 깔아 선이 글자를 가리지 않게 */}
                    <span className={`absolute top-1 z-20 -mx-1 flex items-baseline gap-x-2 whitespace-nowrap px-1 transition-colors ${cur ? 'bg-accent-soft' : 'bg-surface group-hover:bg-sunken'}`}
                      style={{ left: nameL, maxWidth: Math.max(rightEdge - nameL, 80) }}>
                      <span className={`min-w-0 truncate text-sm ${r.done ? 'font-normal text-muted' : cur ? 'font-bold text-ink' : 'font-semibold text-ink'}`}>{r.id}. {r.title}</span>
                      <span className="shrink-0 text-xs font-normal tabular-nums text-muted">{shortDate(r.from)}~{shortDate(r.to)}</span>
                      {cur && <span className="shrink-0 text-xs font-bold text-accent-ink">지금</span>}
                      {r.done && <span className="shrink-0 text-xs text-muted"><i className="fas fa-check" aria-hidden /></span>}
                    </span>
                    <span className="absolute top-7 block h-4 rounded-control" aria-hidden
                      style={{ left: barL, width: Math.max(barR - barL, MIN_BAR), backgroundColor: colorOf(r.type), opacity: r.done ? 0.4 : 1 }} />
                    {after && (
                      <span className="absolute top-7 z-20 flex h-4 -translate-x-full items-center gap-1.5 whitespace-nowrap bg-surface px-1 text-sm font-normal text-muted" style={{ left: rightEdge }}>
                        {shortDate(r.from)}부터<i className="fas fa-chevron-right text-xs" aria-hidden />
                      </span>
                    )}
                    {before && (
                      <span className="absolute top-7 z-20 flex h-4 items-center gap-1.5 whitespace-nowrap bg-surface px-1 text-sm font-normal text-muted" style={{ left: leftEdge }}>
                        <i className="fas fa-chevron-left text-xs" aria-hidden />{shortDate(r.to)}까지
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {lateCount > 0 && (
        <button type="button" onClick={() => openDay(today)}
          className="flex min-h-11 w-full items-center gap-2 border-t border-line px-4 text-left text-base font-semibold text-danger-ink transition-colors hover:bg-sunken">
          <span className="min-w-0 flex-1">기한 지남<span className="ml-1.5 font-normal">{lateCount}개</span></span>
          <i className="fas fa-chevron-right text-xs text-muted" aria-hidden />
        </button>
      )}
    </Card>
  );
}
