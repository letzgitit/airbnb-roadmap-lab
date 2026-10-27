'use client';

import { useState } from 'react';
import { dayRangeLabel, shortDate } from '@/lib/client/format';
import type { TaskItem } from '@/lib/core/types';
import { textBtn } from '@/components/ui/buttonCls';
import { IconButton } from '@/components/ui/IconButton';
import { TYPE_COLOR, TYPE_LABEL } from '@/components/TimelineChart';
import { addDays, diffDays, isoOf, mondayOf, pinsOf, stepRanges, toDate, typeFilter, type DocLike, type Pin, type StepRange, type TimelineStep } from './step-dates';

// 홈 「달력」 탭: 한 달을 월요일부터 일요일까지 주 단위로(날짜 띠의 주와 같은 기준).
//   한 주 줄 = 날짜 숫자(오늘 = 강조색, 마지막으로 연 날 = ink 2px 테두리, 고정 일정 날은 숫자 옆 핀)
//            → 단계 기간 띠(16px, 종류 색을 옅게 깐 면 + 시작하는 날에 진한 색 점, 이름은 띠 안에 12px. 주마다 겹치지 않게 줄을 나눈다)
//              띠가 한 칸뿐이면 「5단계」(안 들어가면 「5.」, 말줄임표 없이). 여러 칸이 좁으면 「~10/30」을 먼저 빼고 이름만 말줄임.
//            → 그날 고정 일정 이름(폰은 핀 + 앞 토막만) → 그날 마감 할 일
//              넓은 화면(640px 이상): 할 일 글자 세 개까지(기한 지난 안 끝난 일 = 빨강 글자, 끝낸 일 = 흐린 글자 + 가운데 줄), 나머지는 「+n」.
//              폰: 칸이 좁아 글자가 잘리므로 「할 일 2」처럼 개수 한 줄(기한 지난 안 끝난 일이 있으면 빨강).
//   아무것도 없는 주(단계 띠 · 고정 일정 · 할 일 없음)는 줄 높이 44px. 단계 종류로 걸렀는데 그 달에 해당 단계가 없으면 「이번 달엔 ○○ 할 일이 없어요.」
//   날을 누르면 그날 창(DaySheet — 할 일 추가 · 고치기 · 날짜 바꾸기 · 지우기는 그 창이 맡는다). 로그인 전(onPick 없음)은 누를 수 없다.
//   위 줄: ‹ 2026년 10월 › + 「오늘」(이번 달로).
const DOW = ['월', '화', '수', '목', '금', '토', '일'];
const DOW_FULL = ['일', '월', '화', '수', '목', '금', '토'];
const LANE = 18; // 단계 띠 한 줄(16px + 2px 틈)
/** 폰 달력 칸의 고정 일정 이름: 「잔금 · 전입 · 신청」 → 「잔금」 */
const shortPin = (label: string) => label.split(/\s*·\s*/)[0];
// 한 칸 띠의 글자: 「5단계」가 들어가는 폭(띠 안쪽, 점이 있으면 점 12px 포함)부터 「5단계」, 아니면 「5.」 — 컨테이너 쿼리(띠 = @container)
const ONE_CELL: Record<string, string> = { h1: '@min-[44px]:hidden', h2: '@min-[52px]:hidden', n1: '@min-[32px]:hidden', n2: '@min-[40px]:hidden' };
const ONE_CELL_WIDE: Record<string, string> = { h1: '@min-[44px]:inline', h2: '@min-[52px]:inline', n1: '@min-[32px]:inline', n2: '@min-[40px]:inline' };
const colorOf = (type: string) => (TYPE_COLOR as Record<string, string>)[type] ?? 'var(--type-prep)';
/** 단계 띠 바탕: 종류색 옅은 면(--type-*-soft — 위 ink 글자 4.5:1 이상) */
const softOf = (type: string) => (type in TYPE_COLOR ? `var(--type-${type}-soft)` : 'var(--type-prep-soft)');
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const addMonths = (first: string, n: number) => { const d = toDate(first); d.setMonth(d.getMonth() + n, 1); return isoOf(d); };

/** 그 주에 걸친 단계 기간을 겹치지 않게 줄(lane)에 나눈다 */
function lanesOf(ranges: StepRange[], mon: string, sun: string) {
  const inWeek = ranges.filter((r) => r.from <= sun && r.to >= mon).sort((a, b) => a.from.localeCompare(b.from) || a.id - b.id);
  const ends: string[] = [];
  return inWeek.map((r) => {
    const from = r.from < mon ? mon : r.from;
    const to = r.to > sun ? sun : r.to;
    let lane = ends.findIndex((e) => e < from);
    if (lane < 0) { lane = ends.length; ends.push(to); } else ends[lane] = to;
    return { r, lane, col: diffDays(mon, from), span: diffDays(from, to) + 1, head: r.from >= mon, tail: r.to <= sun };
  });
}

export function MonthCalendar({ steps, doc, today, types, picked, onPick, fixedDay0, marks, guest }: {
  steps: TimelineStep[]; doc: DocLike; today: string; types: string[]; picked: string | null;
  onPick?: (date: string) => void; fixedDay0?: string; marks: Pin[]; guest: boolean;
}) {
  const [month, setMonth] = useState(() => monthStart(picked ?? today));
  const keep = typeFilter(steps, types);
  const ranges = stepRanges(steps, doc, today, fixedDay0).filter((r) => keep(r.id));
  const tasks = Object.values(doc.tasks).filter((t) => !t.deletedAt && t.due && keep(t.stepId));
  const pins = pinsOf(doc, marks);

  const m = toDate(month);
  const lastOfMonth = isoOf(new Date(m.getFullYear(), m.getMonth() + 1, 0));
  const weeks: string[] = [];
  for (let w = mondayOf(month); w <= lastOfMonth; w = addDays(w, 7)) weeks.push(w);
  const thisMonth = monthStart(today);
  const inMonthRanges = ranges.filter((r) => r.from <= lastOfMonth && r.to >= month);
  const monthWord = month === thisMonth ? '이번 달' : `${m.getMonth() + 1}월`;
  const dayTasks = (d: string) => tasks.filter((t) => t.due === d)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.stepId - b.stepId || a.createdAt.localeCompare(b.createdAt));

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-line px-2">
        <IconButton label="이전 달" icon="fa-chevron-left" onClick={() => setMonth((v) => addMonths(v, -1))} />
        <h3 className="min-w-0 flex-1 text-center text-base font-bold text-ink" aria-live="polite">{m.getFullYear()}년 {m.getMonth() + 1}월</h3>
        <IconButton label="다음 달" icon="fa-chevron-right" onClick={() => setMonth((v) => addMonths(v, 1))} />
        <button type="button" className={`${textBtn} mx-0 px-3 ${month === thisMonth ? 'invisible' : ''}`} onClick={() => setMonth(thisMonth)}>오늘</button>
      </div>
      <div className="grid grid-cols-7 border-b border-line" aria-hidden>
        {DOW.map((d) => <span key={d} className="py-1 text-center text-xs font-normal text-muted">{d}</span>)}
      </div>
      {types.length > 0 && inMonthRanges.length === 0 && (
        <p className="border-b border-line px-4 py-3 text-base text-muted">{monthWord}엔 {types.map((t) => (TYPE_LABEL as Record<string, string>)[t] ?? t).join(' · ')} 할 일이 없어요.</p>
      )}
      <div role="group" aria-label={`${m.getMonth() + 1}월 달력`}>
        {weeks.map((mon) => {
          const sun = addDays(mon, 6);
          const lanes = lanesOf(ranges, mon, sun);
          const laneH = lanes.length ? (Math.max(...lanes.map((l) => l.lane)) + 1) * LANE : 0;
          const empty = lanes.length === 0 && !tasks.some((t) => t.due! >= mon && t.due! <= sun) && !pins.some((p) => p.date >= mon && p.date <= sun);
          return (
            <div key={mon} className="relative border-b border-line last:border-b-0">
              <div className="grid grid-cols-7">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = addDays(mon, i);
                  const dt = toDate(d);
                  const inMonth = d.slice(0, 7) === month.slice(0, 7);
                  const isToday = d === today;
                  const on = d === picked;
                  const list = dayTasks(d);
                  const dayPins = pins.filter((p) => p.date === d);
                  const late = list.some((t) => !t.done && d < today);
                  const active = ranges.filter((r) => r.from <= d && d <= r.to);
                  const label = `${dt.getMonth() + 1}월 ${dt.getDate()}일 ${DOW_FULL[dt.getDay()]}요일${isToday ? ' 오늘' : ''}`
                    + `${dayPins.length ? `, 고정 일정 ${dayPins.map((p) => p.label).join(', ')}` : ''}`
                    + `${list.length ? `, 마감 할 일 ${list.length}개` : ''}${late ? ', 기한 지난 일 있음' : ''}`
                    + `${active.length ? `, 단계 ${active.map((r) => `${r.id}. ${r.title}`).join(', ')}` : ''}`;
                  const body = (
                    <>
                      <span className="flex h-8 items-center justify-center gap-0.5">
                        <span className={`flex size-7 items-center justify-center rounded-full text-sm tabular-nums ${on ? 'ring-2 ring-inset ring-ink' : ''} ${isToday ? 'font-bold text-accent-ink' : inMonth ? 'font-semibold text-ink' : 'font-normal text-muted'}`}>
                          {dt.getDate()}
                        </span>
                      </span>
                      <span className="block shrink-0" style={{ height: laneH }} />
                      <span className="flex min-w-0 flex-col gap-0.5 px-0.5 pb-1.5">
                        {dayPins.map((p) => (
                          <span key={p.label} className="block overflow-hidden text-xs font-bold whitespace-nowrap text-ink-soft sm:truncate">
                            <i className="fas fa-thumbtack mr-0.5" aria-hidden /><span className="sm:hidden">{shortPin(p.label)}</span><span className="hidden sm:inline">{p.label}</span>
                          </span>
                        ))}
                        {/* 폰: 개수 한 줄 / 넓은 화면: 할 일 글자 세 개까지 */}
                        {list.length > 0 && <span className={`block text-xs whitespace-nowrap sm:hidden ${late ? 'font-bold text-danger-ink' : 'font-normal text-ink-soft'}`}>할 일 {list.length}</span>}
                        {list.slice(0, 3).map((t) => <TaskLine key={t.id} t={t} late={!t.done && d < today} />)}
                        {list.length > 3 && <span className="hidden text-xs font-normal text-muted sm:block">+{list.length - 3}</span>}
                      </span>
                    </>
                  );
                  const cls = `flex ${empty ? 'min-h-11' : 'min-h-16'} min-w-0 flex-col text-left ${i > 0 ? 'border-l border-line' : ''} ${inMonth ? '' : 'bg-page/50'}`;
                  return onPick
                    ? <button key={d} type="button" aria-pressed={on} aria-label={label} onClick={() => onPick(d)}
                        className={`${cls} transition-colors hover:bg-sunken focus-visible:-outline-offset-2`}>{body}</button>
                    : <div key={d} className={cls}><span className="sr-only">{label}</span><span aria-hidden className="contents">{body}</span></div>;
                })}
              </div>
              {/* 단계 기간 띠: 날짜 숫자 아래, 주마다 겹치지 않게 줄을 나눈다(누르는 건 그 아래 날 칸) */}
              <div className="pointer-events-none absolute inset-x-0 top-8" aria-hidden>
                {lanes.map(({ r, lane, col, span, head, tail }) => (
                  <span key={r.id} title={`${r.id}. ${r.title}`}
                    className={`@container absolute flex h-4 items-center overflow-hidden px-1 text-xs font-normal whitespace-nowrap text-ink ${head ? 'rounded-l-control' : ''} ${tail ? 'rounded-r-control' : ''}`}
                    style={{
                      top: lane * LANE, left: `calc(${(col / 7) * 100}% + ${head ? 2 : 0}px)`, width: `calc(${(span / 7) * 100}% - ${(head ? 2 : 0) + (tail ? 2 : 0)}px)`,
                      backgroundColor: softOf(r.type),
                      opacity: r.done ? 0.55 : 1,
                    }}>
                    {head && <span className="mr-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(r.type) }} />}
                    {span < 2
                      // 한 칸: 「5단계」, 칸이 그보다 좁으면 「5.」(말줄임표 없이)
                      ? <><span className={ONE_CELL[`${head ? 'h' : 'n'}${r.id >= 10 ? 2 : 1}`]}>{r.id}.</span><span className={`hidden ${ONE_CELL_WIDE[`${head ? 'h' : 'n'}${r.id >= 10 ? 2 : 1}`]}`}>{r.id}단계</span></>
                      // 여러 칸: 이름 + 기간. 좁으면 기간을 먼저 뺀다 — 다음 줄로 밀려 잘려 나가고(반만 남지 않게), 이름만 말줄임
                      : (
                        <span className="flex h-4 min-w-0 flex-1 flex-wrap content-start items-center overflow-hidden">
                          <span className="min-w-0 max-w-full truncate">{r.id}. {r.title}</span>
                          {head && span >= 3 && <span className="ml-1 shrink-0 text-ink-soft">{guest ? dayRangeLabel(r.start, r.end) : `~${shortDate(r.to)}`}</span>}
                        </span>
                      )}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskLine({ t, late }: { t: TaskItem; late: boolean }) {
  const tone = t.done ? 'text-muted line-through' : late ? 'text-danger-ink' : 'text-ink';
  return <span className={`hidden truncate text-xs font-normal sm:block ${tone}`}>{t.text}</span>;
}
