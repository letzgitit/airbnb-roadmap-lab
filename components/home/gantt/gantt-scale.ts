import { addDays, diffDays, toDate } from '../step-dates.ts';

// 간트 가로 축(화면 없이 계산). StepGantt 가 그리고 gantt-scale.test.ts 가 node --test 로 확인한다.
//   지우기만 하면 되는 TS 문법만 쓰고 import 에 .ts 를 붙여 Node 에서 바로 돈다.
//
// 하루 폭(px): 일 · 주 · 달 세 단위. 폰(768px 미만)과 PC 는 모양이 같고 폭만 다르다.
//   일 = 폰 30 · PC 40, 주 = 폰 12 · PC 16, 달 = 폰 4 · PC 7. 보이는 폭보다 축이 짧으면 보이는 폭을 다 채우게 늘린다.
// 날짜 머리(52px, 위에 붙음): 윗줄 = 달 이름(그달 1일 자리, 첫 칸은 다음 달까지 40px 넘게 남을 때만) · 고정 일정 핀 이름,
//   아랫줄 = 일 단위는 날마다 숫자, 주 · 달 단위는 월요일 숫자. 「오늘 27」 글자와 겹치는 숫자는 뺀다.
// 칸 선: 그달 1일 = 진한 선(line-strong), 월요일 = 선(달 단위는 흐리게), 일 단위의 나머지 날 = 흐린 선, 일 단위 주말 = 옅은 면.
export type Zoom = 'day' | 'week' | 'month';
export const ZOOMS: Zoom[] = ['day', 'week', 'month'];
export const ZOOM_LABEL: Record<Zoom, string> = { day: '일', week: '주', month: '달' };
export const isZoom = (v: unknown): v is Zoom => v === 'day' || v === 'week' || v === 'month';

const BASE: Record<Zoom, { phone: number; pc: number }> = { day: { phone: 30, pc: 40 }, week: { phone: 12, pc: 16 }, month: { phone: 4, pc: 7 } };

/** 하루 폭(px). viewW = 보이는 폭, days = 축 날수 */
export function dayWidth(zoom: Zoom, phone: boolean, viewW: number, days: number): number {
  const base = BASE[zoom][phone ? 'phone' : 'pc'];
  return days > 0 && viewW > 0 ? Math.max(base, viewW / days) : base;
}

export interface AxisLabel { x: number; text: string; weekend?: boolean }
export interface GridLine { x: number; kind: 'month' | 'week' | 'faint' }
export interface Axis {
  /** 달 이름(윗줄) */
  months: AxisLabel[];
  /** 날짜 숫자(아랫줄). 일 단위 = 칸 가운데, 주 · 달 단위 = 월요일 칸 왼쪽 */
  days: AxisLabel[];
  lines: GridLine[];
  /** 일 단위 주말 칸(왼쪽 x) */
  weekends: number[];
  /** 오늘 칸 가운데 x(오늘 선 자리, 축 밖이면 null) */
  todayX: number | null;
  /** 「오늘 27」 글자 가운데 x(첫머리에서 잘리지 않게 안쪽으로 민 값) */
  labelX: number | null;
  /** 「오늘 27」, 글자가 달이 바뀌는 선을 넘거나 그달 이름이 머리에 없으면 「오늘 10/27」(다음 달 날로 잘못 읽지 않게) */
  todayText: string;
}

/** 오늘 글자 반폭(「오늘 27」 12px 굵게 ≈ 52px + 좌우 4px = 60px, 「오늘 10/27」 ≈ 76px) */
const HALF_SHORT = 30;
const HALF_LONG = 38;

export function axisOf(first: string, last: string, dw: number, zoom: Zoom, today: string): Axis {
  const total = diffDays(first, last) + 1;
  const inAxis = today >= first && today <= last;
  const todayX = inAxis ? diffDays(first, today) * dw + dw / 2 : null;
  // 「오늘 27」 글자: 축 첫머리에서 잘리지 않게 반폭만큼 안쪽으로. 글자 상자 안으로 달이 바뀌는 선이 지나가거나
  // 오늘이 든 달의 이름이 머리에 없으면(첫 칸이 좁아 뺐음) 「오늘 10/27」 — 바로 옆 「11월」 밑에서 11월 27일로 읽히지 않게
  const td = toDate(today);
  const firstOfMonths = Array.from({ length: total }, (_, i) => i).filter((i) => i > 0 && toDate(addDays(first, i)).getDate() === 1).map((i) => i * dw);
  const shortX = todayX == null ? null : Math.max(todayX, HALF_SHORT + 2);
  const toNext0 = (new Date(toDate(first).getFullYear(), toDate(first).getMonth() + 1, 1).getTime() - toDate(first).getTime()) / 86400000;
  const monthShown = td.getDate() >= diffDays(first, today) + 1 ? toNext0 * dw > 40 : true; // 오늘이 첫 달이면 첫 칸 달 이름이 있어야
  const long = shortX != null && (firstOfMonths.some((mx) => Math.abs(mx - shortX) < HALF_SHORT) || !monthShown);
  const half = long ? HALF_LONG : HALF_SHORT;
  const labelX = todayX == null ? null : Math.max(todayX, half + 2);
  const todayText = long ? `오늘 ${td.getMonth() + 1}/${td.getDate()}` : `오늘 ${td.getDate()}`;
  const TODAY_HALF = half + 4;
  const months: AxisLabel[] = [];
  const days: AxisLabel[] = [];
  const lines: GridLine[] = [];
  const weekends: number[] = [];
  for (let i = 0; i < total; i++) {
    const iso = addDays(first, i);
    const d = toDate(iso);
    const date = d.getDate();
    const dow = d.getDay();
    const x = i * dw;
    // 첫 칸: 다음 달 1일까지 40px 넘게 남을 때만 달 이름(바로 뒤 1일 이름과 겹치지 않게)
    const toNext = (new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - d.getTime()) / 86400000;
    if (date === 1 || (i === 0 && toNext * dw > 40)) months.push({ x, text: `${d.getMonth() + 1}월` });
    if (date === 1 && i > 0) lines.push({ x, kind: 'month' });
    const weekend = dow === 0 || dow === 6;
    if (zoom === 'day') {
      if (weekend) weekends.push(x);
      if (date !== 1 && i > 0) lines.push({ x, kind: dow === 1 ? 'week' : 'faint' });
      const cx = x + dw / 2;
      if (labelX == null || Math.abs(cx - labelX) > TODAY_HALF) days.push({ x: cx, text: String(date), weekend });
    } else if (dow === 1) {
      if (date !== 1 && i > 0) lines.push({ x, kind: zoom === 'month' ? 'faint' : 'week' });
      // 월요일 숫자(왼쪽 5px 안쪽, 두 자리 ≈ 16px)가 오늘 글자와 겹치거나(8px 띄움), 그 글자 자리 안으로 달이 바뀌는 선이 지나가면 뺀다
      const firstIn = Array.from({ length: 7 }, (_, k) => k).some((k) => k > 0 && toDate(addDays(iso, k)).getDate() === 1 && k * dw < 26);
      const clear = labelX == null || x + 5 + 16 < labelX - TODAY_HALF - 4 || x + 5 > labelX + TODAY_HALF + 4;
      if (clear && !firstIn) days.push({ x, text: String(date) });
    }
  }
  return { months, days, lines, weekends, todayX, labelX, todayText };
}

/** 날짜 → 칸 왼쪽 x · 칸 가운데 x */
export const xOf = (first: string, dw: number) => (iso: string) => diffDays(first, iso) * dw;
export const cxOf = (first: string, dw: number) => (iso: string) => diffDays(first, iso) * dw + dw / 2;

/** 처음 · 「오늘」 단추의 가로 자리: 오늘을 보이는 폭의 30% 자리에(앞 며칠도 보이게). 0 보다 작아지지 않는다 */
export function todayScroll(first: string, dw: number, today: string, viewW: number): number {
  return Math.max(0, diffDays(first, today) * dw + dw / 2 - viewW * 0.3);
}

/** 끌어 옮긴 픽셀 → 날수(반올림) */
export const daysFromPx = (px: number, dw: number) => Math.round(px / dw);
