'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { shortDate } from '@/lib/client/format';
import { addDays, diffDays, toDate, type DayMark, type Pin } from './step-dates';
import { useDragScroll, useMedia } from './use-drag-scroll';

// 가로로 넘겨 보는 날짜 띠(지금은 그날 창 머리에서 쓴다 — 홈 「단계」 탭은 2026-10-27 트리 간트 components/home/gantt/ 로 바뀜). 하루 한 칸 30px.
//   dense · fit 은 옛 홈 「단계」 탭용(지산판이 아직 쓸 수 있어 남겨 둠).
//   dense: 폰(640px 미만)에서는 하루 14px — 한 화면에 약 4주가 보인다. 칸이 좁아 요일 글자는 빼고(오늘은 선과 강조색 숫자,
//     고정 일정 날은 핀), 날짜 숫자는 주 첫날(월요일) · 오늘 · 고른 날에만 적는다(오늘 · 고른 날 바로 옆 월요일 숫자는 겹치지 않게 뺀다).
//     날짜 칸은 띠 높이 전체(44px 넘게)를 누르는 칸으로 쓰고, 칸 사이가 붙어 있어 누른 자리에서 가장 가까운 날이 골린다.
//   fit(로그인 전 단계 탭): 처음부터 끝까지 한 화면에 들게 하루 폭을 상자 폭 ÷ 날수로(4~30px, 폰은 약 7px) — 막대가 화면 밖으로 나가지 않는다.
//     좁은 띠와 같은 모양이고, 한 주 폭이 주 이름보다 좁으면 달이 바뀌는 주에만 「11월」.
//   주 줄: 「10월 4주」(그 주 목요일이 든 달의 몇째 주), 주가 바뀌는 자리에 line-strong 세로 선. 이름 글자는 면 바탕을 깔아 세로선이 가로지르지 않는다
//   날짜 줄: 요일 첫 글자(오늘은 「오늘」, 고정 일정 날은 핀) · 날짜 숫자 · 그날 할 일 점(ink-soft, 기한 지난 안 끝난 일이 있으면 빨강)
//     오늘 = 강조색 글자, 고른 날 = ink 2px 테두리. 누르면 onPick(없으면 — 로그인 전 공개 화면 — 누를 수 없는 칸).
//   오늘 = 청록 2px · 고정 일정 = ink-soft 1px 세로선이 띠 위부터 children(홈의 막대) 끝까지 같은 x 로 지난다.
//     글자 · 숫자는 선 위에 면 바탕으로 깔려 가려지지 않는다(children 쪽 글자도 z-20 + 면 바탕을 쓴다).
//   손가락은 기본 가로 스크롤, PC 는 마우스로 끌어 넘긴다(끈 뒤에 놓아도 누른 것으로 치지 않는다).
//   처음 자리: align = 'lead'(startAt 을 왼쪽 끝 한두 칸 안쪽에) · 'center'(startAt 을 가운데). 처음 폭을 잰 뒤 한 번만.
export const DAY = 30;
/** 폰에서 dense 띠의 하루 폭 */
export const DENSE_DAY = 14;
const LEAD_DAYS = 1.5;
// 640px 미만(폰)인가 — 화면 폭이 바뀌면 다시 그린다
const NARROW_Q = '(max-width: 639.98px)';
export function useNarrow(): boolean {
  return useMedia(NARROW_Q);
}
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** 그 주(월요일)의 이름: 목요일이 든 달의 몇째 주 */
function weekName(monday: string): string {
  const thu = toDate(addDays(monday, 3));
  return `${thu.getMonth() + 1}월 ${Math.ceil(thu.getDate() / 7)}주`;
}

/** 좁은 띠의 주 이름: 그 주(목요일 기준) 달이 앞 주와 다르면(또는 첫 주) 「11월」, 아니면 없음 */
function monthChange(monday: string, prev: string | null): string | null {
  const m = toDate(addDays(monday, 3)).getMonth();
  if (prev && toDate(addDays(prev, 3)).getMonth() === m) return null;
  return `${m + 1}월`;
}

export interface StripCtx {
  /** 그날 칸의 왼쪽 x(px) */
  x: (iso: string) => number;
  /** 하루 폭(px) */
  day: number;
  /** 지금 가로로 넘어간 만큼(px)과 보이는 폭 — 화면 밖 안내 자리를 정할 때 */
  sl: number; viewW: number;
}

export function DateStrip({ first, last, today, picked, pins, dayInfo, beyond = 0, onPick, startAt, align = 'lead', dense = false, fit = false, children, className = '' }: {
  first: string; last: string; today: string;
  /** 고른 날(진한 테두리) */
  picked: string | null;
  pins: Pin[];
  dayInfo: Map<string, DayMark>;
  /** 띠 끝 뒤의 할 일 · 고정 일정 수(띠 오른쪽 위에 「12/14 이후 n개」) */
  beyond?: number;
  /** 날짜를 눌렀을 때. 없으면 날짜 칸은 단추가 아니다(로그인 전) */
  onPick?: (date: string) => void;
  /** 처음 보일 날 */
  startAt: string;
  align?: 'lead' | 'center';
  /** 폰에서 하루 폭을 줄여 몇 주를 한 번에(홈 「단계」 탭) */
  dense?: boolean;
  /** 처음부터 끝까지 한 화면에 들게 하루 폭을 줄인다(로그인 전 단계 탭) */
  fit?: boolean;
  /** 띠 아래, 같은 상자 · 같은 배율로 같이 넘어가는 내용(홈의 단계 막대) */
  children?: (ctx: StripCtx) => ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(0);
  const [sl, setSl] = useState(0);
  const dragScroll = useDragScroll();
  const isPhone = useNarrow();
  const total = diffDays(first, last) + 1;
  const fitW = fit && viewW > 0 ? Math.max(4, Math.min(DAY, Math.floor(viewW / total))) : null;
  const dayW = fitW ?? (isPhone && dense ? DENSE_DAY : DAY);
  // 좁은 칸 모양(요일 글자 없음, 숫자는 주 첫날 · 오늘 · 고른 날만)
  const narrow = dayW < 20;
  // 한 주 폭이 「10월 4주」보다 좁으면 달이 바뀌는 주에만 「11월」
  const monthOnly = dayW * 7 < 60;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const x = (iso: string) => diffDays(first, iso) * dayW;
  // 처음 자리(폭을 처음 잰 뒤 한 번)
  const scrolled = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !viewW || scrolled.current) return;
    scrolled.current = true;
    const at = diffDays(first, startAt) * dayW;
    el.scrollLeft = Math.max(0, align === 'center' ? at - el.clientWidth / 2 + dayW / 2 : at - LEAD_DAYS * dayW);
  }, [viewW, first, startAt, align, dayW]);

  const days = Array.from({ length: total }, (_, i) => addDays(first, i));
  const weeks = days.filter((_, i) => i % 7 === 0);
  const inAxis = (d: string) => d >= first && d <= last;
  const axisPins = pins.filter((p) => inAxis(p.date));
  const pinsOn = (d: string) => pins.filter((p) => p.date === d);
  // 좁은 띠에서 숫자를 적는 날: 오늘 · 고른 날 · 월요일(오늘 · 고른 날 바로 옆이면 빼서 숫자끼리 겹치지 않게)
  const special = [today, picked].filter((d): d is string => !!d);
  const showNum = (d: string, i: number) => !narrow || special.includes(d)
    || (i % 7 === 0 && !special.some((s) => s !== d && Math.abs(diffDays(d, s)) * dayW < 22));

  return (
    <div ref={scrollRef} onScroll={(e) => setSl(e.currentTarget.scrollLeft)}
      {...dragScroll}
      className={`overflow-x-auto overscroll-x-contain select-none ${className}`}>
      <div className="relative" style={{ width: total * dayW, minWidth: '100%' }}>
        {axisPins.map((p) => <span key={`l${p.date}${p.label}`} className="pointer-events-none absolute inset-y-0 z-10 block w-px bg-ink-soft" style={{ left: x(p.date) + dayW / 2 }} aria-hidden />)}
        {inAxis(today) && <span className="pointer-events-none absolute inset-y-0 z-10 block w-0.5 -translate-x-1/2 bg-accent-ink" style={{ left: x(today) + dayW / 2 }} aria-hidden />}
        {/* 주 줄 */}
        <div className="relative flex h-6 border-b border-line" aria-hidden>
          {weeks.map((m, i) => (
            <span key={m} className={`relative z-20 flex shrink-0 overflow-hidden px-1 pt-1 ${i > 0 ? 'border-l border-line-strong' : ''}`} style={{ width: dayW * 7 }}>
              {(() => {
                const name = monthOnly ? monthChange(m, i === 0 ? null : weeks[i - 1]) : weekName(m);
                return name ? <span className="min-w-0 truncate bg-surface px-0.5 text-xs font-bold text-ink-soft">{name}</span> : null;
              })()}
            </span>
          ))}
        </div>
        {/* 날짜 줄 */}
        <div role="group" aria-label={onPick ? '날짜 고르기' : '날짜'} className="relative flex border-b border-line">
          {days.map((d, i) => {
            const dt = toDate(d);
            const isToday = d === today;
            const on = d === picked;
            const c = dayInfo.get(d);
            const pin = pinsOn(d);
            const num = showNum(d, i);
            return (
              <DayCell key={d} width={dayW} onPick={onPick ? () => onPick(d) : undefined} pressed={on}
                label={`${dt.getMonth() + 1}월 ${dt.getDate()}일 ${DOW[dt.getDay()]}요일${isToday ? ' 오늘' : ''}${pin.length ? `, 고정 일정 ${pin.map((p) => p.label).join(', ')}` : ''}${c ? `, 마감 할 일 ${c.n}개` : ''}${c?.late ? ', 기한 지난 일 있음' : ''}`}
                className={`flex min-h-11 shrink-0 flex-col items-center pt-0.5 pb-1 focus-visible:-outline-offset-2 ${i % 7 === 0 && i > 0 ? 'border-l border-line-strong' : ''}`}>
                {narrow
                  ? <span className="relative z-20 flex h-4 items-center">{pin.length > 0 && <i className="fas fa-thumbtack bg-surface text-xs text-ink-soft" aria-hidden />}</span>
                  : (
                    <span className={`relative z-20 flex h-4 items-center bg-surface px-0.5 text-xs ${isToday ? 'font-bold text-accent-ink' : 'font-normal text-muted'}`}>
                      {pin.length > 0 ? <i className="fas fa-thumbtack text-ink-soft" aria-hidden /> : isToday ? '오늘' : DOW[dt.getDay()]}
                    </span>
                  )}
                {narrow
                  // 좁은 띠: 칸(14px)보다 넓은 숫자는 가운데 맞춰 양옆으로 넘치게 둔다(옆 칸은 숫자가 없어 겹치지 않는다)
                  ? (
                    <span className="relative z-20 flex h-7 w-full items-center justify-center">
                      {num && (
                        <span className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-surface px-0.5 text-xs tabular-nums ${on ? 'font-bold ring-2 ring-inset ring-ink' : isToday ? 'font-bold' : 'font-semibold'} ${isToday ? 'text-accent-ink' : 'text-ink'}`}>
                          {dt.getDate()}
                        </span>
                      )}
                    </span>
                  )
                  : (
                    <span className={`relative z-20 flex size-7 items-center justify-center rounded-full bg-surface text-sm tabular-nums ${on ? 'font-bold ring-2 ring-inset ring-ink' : isToday ? 'font-bold' : 'font-semibold'} ${isToday ? 'text-accent-ink' : 'text-ink'}`}>
                      {dt.getDate()}
                    </span>
                  )}
                {/* 그날 할 일 점(기한 지난 안 끝난 일이 있으면 빨강) */}
                <span className="relative z-20 mt-0.5 flex h-1.5 items-center">
                  {c && <span className={`block size-1.5 rounded-full ${c.late ? 'bg-danger-ink' : 'bg-ink-soft'}`} aria-hidden />}
                </span>
              </DayCell>
            );
          })}
        </div>
        {beyond > 0 && (
          <span className="pointer-events-none absolute top-1 right-1 z-20 whitespace-nowrap bg-surface px-1 text-xs font-normal text-muted">
            {shortDate(addDays(last, 1))} 이후 {beyond}개<i className="fas fa-chevron-right ml-1 text-xs" aria-hidden />
          </span>
        )}
        {children?.({ x, day: dayW, sl, viewW })}
      </div>
    </div>
  );
}

// 날짜 한 칸: 누를 수 있으면 단추, 아니면(로그인 전) 그냥 칸. 모양은 같다
function DayCell({ width, onPick, pressed, label, className, children }: { width: number; onPick?: () => void; pressed: boolean; label: string; className: string; children: ReactNode }) {
  return onPick
    ? <button type="button" aria-pressed={pressed} onClick={onPick} aria-label={label} className={className} style={{ width }}>{children}</button>
    : <div role="img" aria-label={label} className={className} style={{ width }}>{children}</div>;
}
