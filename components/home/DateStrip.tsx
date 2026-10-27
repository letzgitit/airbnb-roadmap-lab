'use client';

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { shortDate } from '@/lib/client/format';
import { addDays, diffDays, toDate, type DayMark, type Pin } from './step-dates';

// 가로로 넘겨 보는 날짜 띠(홈 타임라인과 그날 창이 같이 쓴다). 하루 한 칸 30px.
//   주 줄: 「10월 4주」(그 주 목요일이 든 달의 몇째 주), 주가 바뀌는 자리에 line-strong 세로 선
//   날짜 줄: 요일 첫 글자(오늘은 「오늘」, 고정 일정 날은 핀) · 날짜 숫자 · 그날 할 일 점(ink-soft, 기한 지난 안 끝난 일이 있으면 빨강)
//     오늘 = 강조색 글자, 고른 날 = ink 2px 테두리. 누르면 onPick(없으면 — 로그인 전 공개 화면 — 누를 수 없는 칸).
//   오늘 = 청록 2px · 고정 일정 = ink-soft 1px 세로선이 띠 위부터 children(홈의 막대) 끝까지 같은 x 로 지난다.
//     글자 · 숫자는 선 위에 면 바탕으로 깔려 가려지지 않는다(children 쪽 글자도 z-20 + 면 바탕을 쓴다).
//   손가락은 기본 가로 스크롤, PC 는 마우스로 끌어 넘긴다(끈 뒤에 놓아도 누른 것으로 치지 않는다).
//   처음 자리: align = 'lead'(startAt 을 왼쪽 끝 한두 칸 안쪽에) · 'center'(startAt 을 가운데). 처음 폭을 잰 뒤 한 번만.
export const DAY = 30;
const LEAD_DAYS = 1.5;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** 그 주(월요일)의 이름: 목요일이 든 달의 몇째 주 */
function weekName(monday: string): string {
  const thu = toDate(addDays(monday, 3));
  return `${thu.getMonth() + 1}월 ${Math.ceil(thu.getDate() / 7)}주`;
}

export interface StripCtx {
  /** 그날 칸의 왼쪽 x(px) */
  x: (iso: string) => number;
  /** 지금 가로로 넘어간 만큼(px)과 보이는 폭 — 화면 밖 안내 자리를 정할 때 */
  sl: number; viewW: number;
}

export function DateStrip({ first, last, today, picked, pins, dayInfo, beyond = 0, onPick, startAt, align = 'lead', children, className = '' }: {
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
  /** 띠 아래, 같은 상자 · 같은 배율로 같이 넘어가는 내용(홈의 단계 막대) */
  children?: (ctx: StripCtx) => ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(0);
  const [sl, setSl] = useState(0);
  const drag = useRef<{ x: number; left: number; id: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = diffDays(first, last) + 1;
  const x = (iso: string) => diffDays(first, iso) * DAY;
  // 처음 자리(폭을 처음 잰 뒤 한 번)
  const scrolled = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !viewW || scrolled.current) return;
    scrolled.current = true;
    const at = diffDays(first, startAt) * DAY;
    el.scrollLeft = Math.max(0, align === 'center' ? at - el.clientWidth / 2 + DAY / 2 : at - LEAD_DAYS * DAY);
  }, [viewW, first, startAt, align]);

  const days = Array.from({ length: total }, (_, i) => addDays(first, i));
  const weeks = days.filter((_, i) => i % 7 === 0);
  const inAxis = (d: string) => d >= first && d <= last;
  const axisPins = pins.filter((p) => inAxis(p.date));
  const pinsOn = (d: string) => pins.filter((p) => p.date === d);

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

  return (
    <div ref={scrollRef} onScroll={(e) => setSl(e.currentTarget.scrollLeft)}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onClickCapture={(e) => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); } }}
      className={`overflow-x-auto overscroll-x-contain select-none ${className}`}>
      <div className="relative" style={{ width: total * DAY, minWidth: '100%' }}>
        {axisPins.map((p) => <span key={`l${p.date}${p.label}`} className="pointer-events-none absolute inset-y-0 z-10 block w-px bg-ink-soft" style={{ left: x(p.date) + DAY / 2 }} aria-hidden />)}
        {inAxis(today) && <span className="pointer-events-none absolute inset-y-0 z-10 block w-0.5 -translate-x-1/2 bg-accent-ink" style={{ left: x(today) + DAY / 2 }} aria-hidden />}
        {/* 주 줄 */}
        <div className="relative flex h-6 border-b border-line" aria-hidden>
          {weeks.map((m, i) => (
            <span key={m} className={`relative z-20 shrink-0 truncate px-1.5 pt-1 text-xs font-bold text-ink-soft ${i > 0 ? 'border-l border-line-strong' : ''}`} style={{ width: DAY * 7 }}>
              {weekName(m)}
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
            return (
              <DayCell key={d} onPick={onPick ? () => onPick(d) : undefined} pressed={on}
                label={`${dt.getMonth() + 1}월 ${dt.getDate()}일 ${DOW[dt.getDay()]}요일${isToday ? ' 오늘' : ''}${pin.length ? `, 고정 일정 ${pin.map((p) => p.label).join(', ')}` : ''}${c ? `, 마감 할 일 ${c.n}개` : ''}${c?.late ? ', 기한 지난 일 있음' : ''}`}
                className={`flex min-h-11 shrink-0 flex-col items-center pt-0.5 pb-1 focus-visible:-outline-offset-2 ${i % 7 === 0 && i > 0 ? 'border-l border-line-strong' : ''}`}>
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
              </DayCell>
            );
          })}
        </div>
        {beyond > 0 && (
          <span className="pointer-events-none absolute top-1 right-1 z-20 whitespace-nowrap bg-surface px-1 text-xs font-normal text-muted">
            {shortDate(addDays(last, 1))} 이후 {beyond}개<i className="fas fa-chevron-right ml-1 text-xs" aria-hidden />
          </span>
        )}
        {children?.({ x, sl, viewW })}
      </div>
    </div>
  );
}

// 날짜 한 칸: 누를 수 있으면 단추, 아니면(로그인 전) 그냥 칸. 모양은 같다
function DayCell({ onPick, pressed, label, className, children }: { onPick?: () => void; pressed: boolean; label: string; className: string; children: ReactNode }) {
  return onPick
    ? <button type="button" aria-pressed={pressed} onClick={onPick} aria-label={label} className={className} style={{ width: DAY }}>{children}</button>
    : <div role="img" aria-label={label} className={className} style={{ width: DAY }}>{children}</div>;
}
