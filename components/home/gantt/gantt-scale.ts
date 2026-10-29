import { addDays, diffDays, toDate } from '../step-dates.ts';

// 간트 가로 축(화면 없이 계산). StepGantt 가 그리고 gantt-scale.test.ts 가 node --test 로 확인한다.
//   지우기만 하면 되는 TS 문법만 쓰고 import 에 .ts 를 붙여 Node 에서 바로 돈다.
//
// 하루 폭(px): 일 · 주 · 달 세 단위. 폰(768px 미만)과 PC 는 모양이 같고 폭만 다르다.
//   일 = 폰 30 · PC 40, 주 = 폰 12 · PC 16, 달 = 폰 4 · PC 7. 보이는 폭보다 축이 짧으면 보이는 폭을 다 채우게 늘린다.
// 날짜 머리(52px, 위에 붙음): 윗줄 = 달 이름, 아랫줄 = 일 단위는 날마다 숫자, 주 · 달 단위는 월요일 숫자.
//   본문과 같은 칸 선을 머리 높이까지 이어 그어 숫자가 어느 칸인지 줄과 맞게 보인다.
//   고정 일정(집 정보 「고정 · 」)은 간트에 그리지 않는다(2026-10-29 「복잡해, 없애」 — 날짜 띠 · 그날 창 · 달력 · 요약에는 그대로).
// 오늘: 일 단위 = 그날 칸의 숫자 하나를 오늘 색 700 으로(바탕 없이 — 옆 칸 숫자 · 선을 덮지 않는다),
//   주 · 달 단위 = 「오늘 27」 글자(바탕 있음), 그 글자와 실제로 겹치는 월요일 숫자만 뺀다.
// 칸 선: 달이 바뀌는 선 = 진한 선(line-strong) — 일 단위는 그달 1일, 주 · 달 단위는 그달 첫 월요일(월요일 선과 두 줄로 겹치지 않게).
//   그 밖의 월요일 = 선(달 단위는 흐리게), 일 단위의 나머지 날 = 흐린 선. 주말 면은 없다(칸 선이 날짜를 맡는다).
//   달 이름 = 달마다 그달 폭만큼의 칸(달이 바뀌는 선 ~ 다음 선) 안에서 왼쪽에 붙는 글자(CSS sticky) — 옆으로 넘겨 1일이 화면 밖으로 나가도
//   보이는 맨 왼쪽 날의 달 이름이 머리 윗줄 왼쪽에 남고, 다음 달 선이 왼쪽 끝에 다가오면 다음 달 이름이 밀어내며 바뀐다(첫 칸은 40px 넘을 때만).
// 날짜 고르기: 숫자 = 단추(days 의 iso). 일 단위 = 그날 하루, 주 · 달 단위 = 그 월요일부터 7일(오늘 글자에 가려 숫자를 뺀 월요일도 단추는 있다 — hidden).
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

export interface AxisLabel { x: number; text: string }
/** 달 이름 칸: x ~ x + w 가 그달(달이 바뀌는 선 ~ 다음 선). 글자는 칸 안에서 왼쪽에 붙는다 */
export interface MonthSpan extends AxisLabel { w: number }
/** 날짜 숫자 = 고르는 단추. iso = 그날(주 · 달 단위는 그 월요일) */
export interface DayLabel extends AxisLabel { iso: string; today?: boolean; hidden?: boolean }
export interface GridLine { x: number; kind: 'month' | 'week' | 'faint' }
export interface Axis {
  /** 달 이름 칸(윗줄, 달이 바뀌는 선부터 다음 선까지) */
  months: MonthSpan[];
  /** 날짜 숫자(아랫줄). 일 단위 = 칸 가운데(오늘 = today), 주 · 달 단위 = 월요일 칸 왼쪽(「오늘 27」 글자와 겹치면 hidden) */
  days: DayLabel[];
  lines: GridLine[];
  /** 오늘 칸 가운데 x(오늘 선 자리, 축 밖이면 null) */
  todayX: number | null;
  /** 오늘 글자 가운데 x(주 · 달 단위는 첫머리에서 잘리지 않게 안쪽으로 민 값) */
  labelX: number | null;
  /** 일 단위 = 「29」, 주 · 달 단위 = 「오늘 27」 — 글자가 달이 바뀌는 선을 넘거나 그달 이름이 머리에 없으면 「오늘 10/27」 */
  todayText: string;
}

/** 「오늘 27」 글자 반폭(12px 굵게 ≈ 44px + 좌우 4px = 52px → 26, 「오늘 10/27」 ≈ 68px → 34). labelX 를 안쪽으로 밀 때는 2px 더 */
const HALF_SHORT = 26;
const HALF_LONG = 34;
/** 날짜 숫자 폭(12px, 한 글자 ≈ 7.5px) */
const numW = (t: string) => t.length * 7.5;

export function axisOf(first: string, last: string, dw: number, zoom: Zoom, today: string): Axis {
  const total = diffDays(first, last) + 1;
  const inAxis = today >= first && today <= last;
  const todayX = inAxis ? diffDays(first, today) * dw + dw / 2 : null;
  const td = toDate(today);
  // 달이 바뀌는 자리: 일 단위 = 1일, 주 · 달 단위 = 그달 첫 월요일(1~7일인 월요일)
  const monthStart = (d: Date) => (zoom === 'day' ? d.getDate() === 1 : d.getDay() === 1 && d.getDate() <= 7);
  const monthXs = Array.from({ length: total }, (_, i) => i).filter((i) => i > 0 && monthStart(toDate(addDays(first, i)))).map((i) => i * dw);
  let labelX: number | null = null;
  let todayText = `${td.getDate()}`;
  let half = HALF_SHORT;
  if (todayX != null && zoom !== 'day') {
    // 「오늘 27」: 글자 상자 안으로 달이 바뀌는 선이 지나가거나 오늘이 든 달의 이름이 머리에 없으면(첫 칸이 좁아 뺐음) 「오늘 10/27」
    const shortX = Math.max(todayX, HALF_SHORT + 2);
    const nextMonth = monthXs.find((mx) => mx > todayX);
    const prevMonth = [...monthXs].reverse().find((mx) => mx <= todayX);
    const monthShown = prevMonth != null || ((nextMonth ?? Infinity) > 40);
    const long = monthXs.some((mx) => Math.abs(mx - shortX) < HALF_SHORT) || !monthShown;
    half = long ? HALF_LONG : HALF_SHORT;
    labelX = Math.max(todayX, half + 2);
    todayText = long ? `오늘 ${td.getMonth() + 1}/${td.getDate()}` : `오늘 ${td.getDate()}`;
  } else if (todayX != null) labelX = todayX;
  const months: MonthSpan[] = [];
  const days: DayLabel[] = [];
  const lines: GridLine[] = [];
  const firstNext = monthXs[0] ?? Infinity;
  for (let i = 0; i < total; i++) {
    const iso = addDays(first, i);
    const d = toDate(iso);
    const date = d.getDate();
    const dow = d.getDay();
    const x = i * dw;
    const ms = monthStart(d);
    if ((ms && i > 0) || (i === 0 && firstNext - x > 40)) {
      const next = monthXs.find((mx) => mx > x) ?? total * dw;
      months.push({ x, w: next - x, text: `${d.getMonth() + 1}월` });
    }
    if (ms && i > 0) lines.push({ x, kind: 'month' });
    if (zoom === 'day') {
      if (!ms && i > 0) lines.push({ x, kind: dow === 1 ? 'week' : 'faint' });
      days.push({ x: x + dw / 2, text: String(date), iso, ...(iso === today ? { today: true } : {}) });
    } else if (dow === 1) {
      if (!ms && i > 0) lines.push({ x, kind: zoom === 'month' ? 'faint' : 'week' });
      // 월요일 숫자(왼쪽 5px 안쪽)가 「오늘 27」 글자 상자와 실제로 겹칠 때만 뺀다(3px 띄움)
      const a = x + 5;
      const b = a + numW(String(date));
      const clear = labelX == null || b + 3 <= labelX - half || a >= labelX + half + 3;
      days.push({ x, text: String(date), iso, ...(clear ? {} : { hidden: true }) });
    }
  }
  return { months, days, lines, todayX, labelX, todayText };
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
