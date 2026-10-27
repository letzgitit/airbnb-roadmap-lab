'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { shortDate } from '@/lib/client/format';
import { TYPE_COLOR, TYPE_LABEL, TYPE_ORDER } from '@/components/TimelineChart';
import { toDate } from './step-dates';
import type { StepStateRow, WeekDay, WeekItem } from './summary-data';

// 홈 「요약」 탭의 그림(라이브러리 없이 SVG · CSS). 계산은 summary-data.ts, 배치는 HomeSummary.tsx.
// - 그림은 칸의 실제 폭(useWidth)으로 그린다 — viewBox 로 늘이거나 줄이지 않아 글자가 늘 12px 이상이다.
// - 그림마다 화면 읽기용 문장(role="img" + aria-label)을 붙이고, 그림 안 글자는 읽지 않는다.
// - 색: 단계 종류 색은 분류에만(점 · 길 위 원 · 막대 · 할 일 네모), 기한 지남 = late(빨강), 지금 · 오늘 = accent-ink, 진행 채움 = progress.

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const known = (k: string) => (k in TYPE_COLOR ? k : 'prep');
/** 종류색 토큰: tone 없음 = 진한 색, 'ink' = 옅은 면 · 흰 면 위 글자 */
export const typeVar = (k: string, tone?: 'ink' | 'soft') => `var(--type-${known(k)}${tone ? `-${tone}` : ''})`;

/** 칸의 안쪽 폭(여백 뺀 값). 처음 그릴 때는 0 — 재고 나서 그림을 그린다 */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** 줄 끝 화살표(16px) */
export function Chevron({ className = 'text-muted' }: { className?: string }) {
  return (
    <svg className={`size-4 shrink-0 ${className}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

/** 종류색 점(10px, small = 8px) */
export function TypeDot({ type, small = false }: { type: string; small?: boolean }) {
  return <span className={`inline-block shrink-0 rounded-full ${small ? 'size-2' : 'size-2.5'}`} style={{ backgroundColor: typeVar(type) }} aria-hidden />;
}

/** 종류 여섯 색의 이름표(12px muted) */
export function TypeLegend({ className = '' }: { className?: string }) {
  return (
    <p className={`flex flex-wrap gap-x-3 gap-y-1 text-xs font-normal text-muted ${className}`}>
      <span className="sr-only">단계 종류 색:</span>
      {TYPE_ORDER.map((k) => (
        <span key={k} className="inline-flex items-center gap-1 whitespace-nowrap"><TypeDot type={k} small />{TYPE_LABEL[k]}</span>
      ))}
    </p>
  );
}

/** 맨 위 청록 카드의 링: 흰 채움 = 지난 날 비율. 가운데는 children(D-day). 그림 자체는 화면 읽기에서 뺀다(카드 문장이 같은 말을 한다) */
export function Ring({ size, pct, children }: { size: number; pct: number; children: ReactNode }) {
  const c = size / 2;
  const r = c - 8;
  const len = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="block">
        <circle cx={c} cy={c} r={r} fill="none" strokeWidth={14} style={{ stroke: 'var(--color-hero-track)' }} />
        {p > 0 && (
          <circle cx={c} cy={c} r={r} fill="none" strokeWidth={14} strokeLinecap="round" strokeDasharray={`${(len * p).toFixed(1)} ${len.toFixed(1)}`}
            transform={`rotate(-90 ${c} ${c})`} style={{ stroke: 'var(--color-hero-2)' }} />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

// ── 14단계 길 ──
// 상태 = 모양, 색 = 종류만: 끝 = 회색 원 + 체크, 하는 중 = 종류색 꽉 찬 원(진한 숫자), 지금 = 같은 원 + 강조색 고리, 남음 = 종류색 테두리 원.
// 좁은 칸(560px 아래)은 두 줄(첫 줄 왼→오, 오른쪽 끝에서 돌아 가운데 줄로 왼쪽까지, 다시 내려와 둘째 줄 왼→오), 넓은 칸은 한 줄. 끝에 깃발 + 「첫 손님」.
export function StepRoad({ states, label }: { states: StepStateRow[]; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  return (
    <div ref={ref} role="img" aria-label={label} className="px-4 pt-2">
      {width > 0 && states.length > 0 && <RoadSvg states={states} width={width} />}
    </div>
  );
}

function RoadSvg({ states, width }: { states: StepStateRow[]; width: number }) {
  const one = width >= 560;
  const n = states.length;
  const perRow = one ? n : Math.ceil(n / 2);
  let pts: { x: number; y: number }[];
  let path: string;
  let progTo: (i: number) => string;
  let end: { x: number; y: number };
  let H: number;
  let step: number;
  if (one) {
    const x0 = 24, x1 = width - 64, y = 44;
    step = n > 1 ? (x1 - x0) / (n - 1) : 0;
    pts = states.map((_, i) => ({ x: x0 + i * step, y }));
    end = { x: width - 26, y };
    path = `M${x0},${y} H${end.x}`;
    progTo = (i) => `M${x0},${y} H${pts[i].x}`;
    H = 86;
  } else {
    const x0 = 28, x1 = width - 56, y1 = 44, gap = 80, y2 = y1 + gap, ym = y1 + gap / 2, r = gap / 4;
    step = perRow > 1 ? (x1 - x0) / (perRow - 1) : 0;
    pts = states.map((_, i) => ({ x: x0 + (i % perRow) * step, y: i < perRow ? y1 : y2 }));
    const xr = x1 + 14, xl = x0 - 4;
    end = { x: width - 26, y: y2 };
    const turn = `M${x0},${y1} H${xr} A${r},${r} 0 0 1 ${xr},${ym} H${xl} A${r},${r} 0 0 0 ${xl},${y2}`;
    path = `${turn} H${end.x}`;
    progTo = (i) => (i < perRow ? `M${x0},${y1} H${pts[i].x}` : `${turn} H${pts[i].x}`);
    H = y2 + 40;
  }
  // 원 크기: 지금 고리(R + 6)와 옆 원(R + 2) 사이가 2px 넘게 비도록 칸 사이 폭에 맞춰 11 ~ 14
  const R = Math.max(11, Math.min(14, (step - 10) / 2));
  const nowIdx = states.findIndex((s) => s.state === 'now');
  const lastDone = states.map((s) => s.state).lastIndexOf('done');
  const progIdx = nowIdx >= 0 ? nowIdx : lastDone;

  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden className="block">
      <path d={path} fill="none" strokeWidth={3} strokeDasharray="1 7" strokeLinecap="round" style={{ stroke: 'var(--color-line-strong)' }} />
      {progIdx > 0 && <path d={progTo(progIdx)} fill="none" strokeWidth={4} strokeLinecap="round" style={{ stroke: 'var(--color-progress)' }} />}
      {/* 깃발 + 첫 손님 */}
      <g transform={`translate(${end.x},${end.y})`} style={{ fill: 'var(--color-ink)', stroke: 'var(--color-ink)' }}>
        <circle r={5} stroke="none" />
        <path d="M0 -4 V-30" strokeWidth={2} fill="none" />
        <path d="M1 -30 H17 L13 -24.5 17 -19 H1z" stroke="none" />
      </g>
      <text x={width - 2} y={end.y + 30} textAnchor="end" fontSize={13} fontWeight={700} style={{ fill: 'var(--color-ink)' }}>첫 손님</text>
      {states.map((s, i) => {
        const { x, y } = pts[i];
        const k = s.type;
        if (s.state === 'done') {
          return (
            <g key={s.id} transform={`translate(${x},${y})`}>
              <circle r={R} strokeWidth={1} style={{ fill: 'var(--color-sunken)', stroke: 'var(--color-line-strong)' }} />
              <path d="M-4.5 0.2 -1.4 3.2 4.6 -3" fill="none" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--color-muted)' }} />
            </g>
          );
        }
        if (s.state === 'todo') {
          return (
            <g key={s.id} transform={`translate(${x},${y})`}>
              <circle r={R - 1} strokeWidth={2} style={{ fill: 'var(--color-surface)', stroke: typeVar(k) }} />
              <text y={4.5} textAnchor="middle" fontSize={12} fontWeight={700} className="tabular-nums" style={{ fill: typeVar(k, 'ink') }}>{s.id}</text>
            </g>
          );
        }
        return (
          <g key={s.id} transform={`translate(${x},${y})`}>
            {s.state === 'now' && <circle r={R + 6} fill="none" strokeWidth={2} style={{ stroke: 'var(--color-accent-ink)' }} />}
            <circle r={R + 2} style={{ fill: typeVar(k) }} />
            <text y={R >= 13 ? 6 : 5} textAnchor="middle" fontSize={R >= 13 ? 17 : 15} fontWeight={700} className="tabular-nums" data-onfill="1" style={{ fill: 'var(--color-on-type)' }}>{s.id}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── 할 일 그림: 「지남」 칸 + 오늘 ~ 6일 뒤. 그날 마감인 할 일 = 네모 하나(색 = 단계 종류, 지남 칸은 빨강). 5개 넘으면 4개 + 「+n」 ──
const MAX_STACK = 5;
export function WeekChart({ late, days, today }: { late: WeekItem[]; days: WeekDay[]; today: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const md = (iso: string) => { const d = toDate(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`; };
  const parts = [
    late.length > 0 ? `기한 지난 할 일 ${late.length}개` : '',
    ...days.filter((d) => d.items.length > 0).map((d) => `${d.date === today ? '오늘' : md(d.date)} 할 일 ${d.items.length}개`),
  ].filter(Boolean);
  const label = parts.length ? parts.join(', ') : '기한 지난 일도, 7일 안에 할 일도 없어요';
  return (
    <div ref={ref} role="img" aria-label={label} className="px-4 pt-3 pb-3">
      {width > 0 && <WeekSvg late={late} days={days} today={today} width={width} />}
    </div>
  );
}

function WeekSvg({ late, days, today, width }: { late: WeekItem[]; days: WeekDay[]; today: string; width: number }) {
  const cols = [{ key: 'late', items: late, date: '' }, ...days.map((d) => ({ key: d.date, items: d.items, date: d.date }))];
  const cw = width / cols.length;
  const sq = 14, gap = 4;
  const most = Math.max(2, Math.min(MAX_STACK, ...cols.map((c) => c.items.length)));
  const base = 6 + most * (sq + gap);
  const H = base + 40;
  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden className="block">
      <line x1={cw} y1={6} x2={cw} y2={base} strokeWidth={1.5} strokeDasharray="3 3" style={{ stroke: 'var(--color-line-strong)' }} />
      {cols.map((c, i) => {
        const cx = i * cw + cw / 2;
        const isLate = c.key === 'late';
        const isToday = c.date === today;
        const over = c.items.length > MAX_STACK;
        const shown = over ? c.items.slice(0, MAX_STACK - 1) : c.items;
        const top = base - shown.length * (sq + gap) + gap;
        const head = isLate ? '지남' : isToday ? '오늘' : DOW[toDate(c.date).getDay()];
        const tone = isLate ? 'var(--color-danger-ink)' : isToday ? 'var(--color-accent-ink)' : 'var(--color-muted)';
        return (
          <g key={c.key}>
            {shown.map((it, j) => (
              <rect key={it.id} x={cx - sq / 2} y={base - (j + 1) * (sq + gap) + gap} width={sq} height={sq} rx={3}
                style={{ fill: isLate ? 'var(--color-late)' : typeVar(it.type) }} />
            ))}
            {over && <text x={cx} y={top - 4} textAnchor="middle" fontSize={12} fontWeight={700} className="tabular-nums" style={{ fill: 'var(--color-ink-soft)' }}>+{c.items.length - shown.length}</text>}
            <text x={cx} y={base + 20} textAnchor="middle" fontSize={13} fontWeight={isLate || isToday ? 700 : 400} style={{ fill: tone }}>{head}</text>
            {c.date && (
              <text x={cx} y={base + 36} textAnchor="middle" fontSize={12} fontWeight={isToday ? 700 : 400} className="tabular-nums"
                style={{ fill: isToday ? 'var(--color-accent-ink)' : 'var(--color-muted)' }}>{toDate(c.date).getDate()}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── 로그인 전 「첫 손님까지」의 주 막대: 하루 = 칸 하나, 주마다 묶음. 첫 칸(오늘)과 끝 칸(첫 손님)만 흰색 ──
export function GuestWeeks({ days, endDate }: { days: number; endDate: string }) {
  const weeks = Math.max(1, Math.ceil(days / 7));
  const [ref, width] = useWidth<HTMLDivElement>();
  // 이름표: 오늘 · 1주 · 2주 … · 끝 날. 겹치면(44px 안) 가운데 것을 건너뛴다
  const marks: { x: number; text: string; align: 'start' | 'middle' | 'end' }[] = [{ x: 0, text: '오늘', align: 'start' }];
  for (let w = 1; w < weeks; w++) marks.push({ x: (w * 7) / days, text: `${w}주`, align: 'middle' });
  const endMark = { x: 1, text: shortDate(endDate), align: 'end' as const };
  const shown: typeof marks = [];
  marks.forEach((m) => {
    const prev = shown[shown.length - 1];
    if (!prev || (m.x - prev.x) * width >= 44) shown.push(m);
  });
  while (shown.length > 1 && (1 - shown[shown.length - 1].x) * width < 52) shown.pop();
  shown.push(endMark);
  return (
    <div role="img" aria-label={`오늘부터 약 ${days}일, ${days % 7 ? `${Math.floor(days / 7)}주 남짓` : `${days / 7}주`}`}>
      <div className="mt-4 flex gap-1.5" aria-hidden>
        {Array.from({ length: weeks }, (_, w) => {
          const n = Math.min(7, days - w * 7);
          return (
            <span key={w} className="flex gap-0.5" style={{ flex: n }}>
              {Array.from({ length: n }, (__, d) => {
                const first = w === 0 && d === 0;
                const last = w === weeks - 1 && d === n - 1;
                return <i key={d} className="block h-5 flex-1 rounded-full" style={{ backgroundColor: first || last ? 'var(--color-hero-2)' : 'var(--color-hero-track)' }} />;
              })}
            </span>
          );
        })}
      </div>
      <div ref={ref} className="relative mt-1.5 h-4 text-xs text-hero-sub" aria-hidden>
        {width > 0 && shown.map((m) => (
          <span key={m.text} className="absolute top-0 whitespace-nowrap tabular-nums"
            style={{ left: m.align === 'end' ? undefined : m.x * width, right: m.align === 'end' ? 0 : undefined, transform: m.align === 'middle' ? 'translateX(-50%)' : undefined }}>
            {m.text}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── 로그인 전 「처음 세 단계」: 전체 날수 눈금 위에 처음 세 단계만 종류색 막대, 그 뒤는 점선 + 「그 뒤 n단계」 ──
export function GuestPlan({ first, total, restCount }: { first: { id: number; type: string; start: number; end: number }[]; total: number; restCount: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const lastEnd = first.reduce((n, s) => Math.max(n, s.end), 0);
  return (
    <div ref={ref} role="img" aria-label={`1~${lastEnd}일째에 처음 세 단계, 그 뒤 ${restCount}단계, ${total}일째에 첫 손님`} className="px-4 pt-2 pb-3">
      {width > 0 && <GuestPlanSvg first={first} total={total} restCount={restCount} lastEnd={lastEnd} width={width} />}
    </div>
  );
}

function GuestPlanSvg({ first, total, restCount, lastEnd, width }: { first: { id: number; type: string; start: number; end: number }[]; total: number; restCount: number; lastEnd: number; width: number }) {
  const rowH = 24, top = 24;
  const H = top + first.length * rowH + 4;
  const x = (d: number) => (d / Math.max(1, total)) * width;
  const restY = top + 1.5 * rowH - 4;
  const restX = x(lastEnd) + 20;
  const ticks: { d: number; text: string; anchor: 'start' | 'middle' | 'end' }[] = [{ d: 0, text: '1일째', anchor: 'start' }];
  if (x(lastEnd) > 60 && x(lastEnd) < width - 60) ticks.push({ d: lastEnd, text: `${lastEnd}일째`, anchor: 'middle' });
  ticks.push({ d: total, text: `${total}일째`, anchor: 'end' });
  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden className="block">
      {restX < width - 8 && (
        <line x1={restX} y1={restY} x2={width} y2={restY} strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" style={{ stroke: 'var(--color-line-strong)' }} />
      )}
      {restCount > 0 && width - restX > 96 && (
        <text x={(restX + width) / 2} y={restY - 8} textAnchor="middle" fontSize={13} style={{ fill: 'var(--color-muted)' }}>그 뒤 {restCount}단계</text>
      )}
      {ticks.map((t) => <text key={t.text} x={x(t.d)} y={12} textAnchor={t.anchor} fontSize={12} className="tabular-nums" style={{ fill: 'var(--color-muted)' }}>{t.text}</text>)}
      {first.map((s, i) => (
        <rect key={s.id} x={x(s.start)} y={top + i * rowH + 4} width={Math.max(14, x(s.end) - x(s.start))} height={14} rx={7} style={{ fill: typeVar(s.type) }} />
      ))}
    </svg>
  );
}

/** 돈 막대: 전체 폭 = 지금 남은 돈(계좌끼리 비율), 진한 칸 = 그 뒤 남는 돈, 빗금 칸 = 나갈 돈 */
export function MoneyBar({ now, after, out, widthPct }: { now: number; after: number; out: number; widthPct: number }) {
  if (now <= 0) return <div className="mt-2.5 h-2 rounded-full bg-track" aria-hidden />;
  const keep = Math.max(0, Math.min(now, after)) / now;
  const gone = Math.min(1 - keep, out / now);
  return (
    <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-track" style={{ width: `${Math.max(8, widthPct)}%` }} aria-hidden>
      <span className="h-full rounded-l-full" style={{ width: `${keep * 100}%`, backgroundColor: 'var(--color-progress)' }} />
      <span className="h-full" style={{ width: `${gone * 100}%`, background: 'repeating-linear-gradient(135deg, var(--color-progress) 0 2px, transparent 2px 5px)' }} />
    </div>
  );
}
