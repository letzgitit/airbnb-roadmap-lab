import type { ProgressDoc } from '@/lib/core/types';

// 단계의 실제 기간(로그인 뒤 현황으로만 계산). 홈 타임라인(DateTimeline)과 단계 창 머리(StepModal)가 같이 쓴다.
//   시작 = 그 단계 할 일 중 가장 이른 마감일. 없으면 출발일 + 공개 일정의 시작 날수.
//   끝   = 끝난 단계면 그 단계 할 일을 마지막으로 끝낸 날 → 없으면 아래와 같음. 그 밖엔 단계 목표일
//          → 없으면 출발일 + 끝 날수와 그 단계 마지막 할 일 마감일 중 늦은 날. 시작이 끝보다 늦으면 시작 = 끝.
//   출발일 = fixedDay0(콘텐츠 날수가 정해진 날에서 센 값, 예: 지산 2026-09-01) → 목표일이 있는 첫 단계(보통 1단계)의 목표일 − 그 단계 끝 날수
//          → 가장 이른 할 일 마감일 → 오늘.
export interface TimelineStep { id: number; title: string; start: number; end: number; type: string }
export interface StepRange extends TimelineStep { from: string; to: string; done: boolean }

export const toDate = (iso: string) => new Date(`${iso}T00:00:00`);
export const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (iso: string, n: number) => { const d = toDate(iso); d.setDate(d.getDate() + n); return isoOf(d); };
export const diffDays = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
/** 그 날이 든 주의 월요일 */
export const mondayOf = (iso: string) => { const d = toDate(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoOf(d); };

export function stepRanges(steps: TimelineStep[], doc: ProgressDoc, today: string, fixedDay0?: string): StepRange[] {
  const tasks = Object.values(doc.tasks).filter((t) => !t.deletedAt);
  const targetOf = (id: number) => doc.steps[String(id)]?.targetDate ?? null;
  let day0 = fixedDay0 ?? null;
  if (!day0) {
    const firstSet = steps.find((s) => targetOf(s.id));
    if (firstSet) day0 = addDays(targetOf(firstSet.id)!, -firstSet.end);
  }
  if (!day0) day0 = tasks.map((t) => t.due).filter((d): d is string => !!d).sort()[0] ?? today;
  const base = day0;
  return steps.map((s) => {
    const own = tasks.filter((t) => t.stepId === s.id);
    const dues = own.map((t) => t.due).filter((d): d is string => !!d).sort();
    const lastDone = own.map((t) => (t.done && t.doneAt ? isoOf(new Date(t.doneAt)) : null)).filter((d): d is string => !!d).sort().pop();
    const done = doc.steps[String(s.id)]?.status === 'done';
    const start = dues[0] ?? addDays(base, s.start);
    const fallback = [addDays(base, s.end), dues[dues.length - 1] ?? ''].sort().pop()!;
    const end = (done && lastDone) || targetOf(s.id) || fallback;
    return { ...s, from: end < start ? end : start, to: end, done };
  });
}

// 고정 일정: 현황 집 정보 중 이름이 「고정 · 」으로 시작하고 값이 YYYY-MM-DD 로 시작하는 줄 + marks(예: 지산 만기). 날짜순.
export interface Pin { date: string; label: string }
const PIN_PREFIX = /^고정\s*·\s*/;
export function pinsOf(doc: ProgressDoc | null, marks: Pin[] = []): Pin[] {
  return [
    ...marks,
    ...(doc ? Object.values(doc.property) : [])
      .filter((p) => !p.deletedAt && PIN_PREFIX.test(p.label))
      .map((p) => { const m = p.value.match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/); return m ? { date: m[1], label: m[2] || p.label.replace(PIN_PREFIX, '') } : null; })
      .filter((p): p is Pin => !!p),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

// 날짜 띠의 범위와 날마다의 표시(홈 타임라인과 그날 창이 같이 쓴다).
//   끝 = 단계 목표일 중 가장 늦은 날과 오늘 중 늦은 날이 든 주의 일요일(목표일이 없으면 단계 기간 끝). 그 뒤의 할 일 · 고정 일정은 beyond 로만 센다.
//   시작 = showDone 이 아니면 안 끝난 단계 시작 · 오늘 · 고정 일정 · 안 끝난 할 일 마감 중 가장 이른 날, showDone 이면 전체 — 가 든 주의 월요일.
//   include: 반드시 띠 안에 들어와야 하는 날(그날 창에서 고른 날 등).
export interface DayMark { n: number; late: boolean }
export interface Axis {
  ranges: StepRange[]; pins: Pin[]; first: string; last: string;
  /** 안 끝난 할 일 마감일(정렬 안 함) */
  openDues: string[];
  /** 띠 끝 뒤의 안 끝난 할 일 · 고정 일정 수 */
  beyond: number;
  /** 날짜 → 그날 마감 할 일 수 · 기한 지난 안 끝난 일 있음 */
  dayInfo: Map<string, DayMark>;
  /** 기한 지난 안 끝난 할 일 수 */
  lateCount: number;
}
export function axisOf(steps: TimelineStep[], doc: ProgressDoc, today: string, opts: { fixedDay0?: string; marks?: Pin[]; showDone?: boolean; include?: string } = {}): Axis {
  const ranges = stepRanges(steps, doc, today, opts.fixedDay0);
  const tasks = Object.values(doc.tasks).filter((t) => !t.deletedAt);
  const pins = pinsOf(doc, opts.marks);
  const targets = Object.values(doc.steps).map((s) => s.targetDate).filter((d): d is string => !!d).sort();
  const endBase = [targets[targets.length - 1] ?? ranges.map((r) => r.to).sort().pop() ?? today, today, opts.include ?? today].sort().pop()!;
  const last = addDays(mondayOf(endBase), 6);
  const openDues = tasks.filter((t) => !t.done && t.due).map((t) => t.due!);
  const startSrc = (opts.showDone
    ? [...ranges.map((r) => r.from), ...tasks.map((t) => t.due).filter((d): d is string => !!d), ...pins.map((p) => p.date), today]
    : [...ranges.filter((r) => !r.done).map((r) => r.from), today, ...pins.map((p) => p.date), ...openDues]
  ).concat(opts.include ? [opts.include] : []).filter((d) => d <= last).sort();
  const first = mondayOf(startSrc[0] ?? today);
  const beyond = tasks.filter((t) => !t.done && t.due && t.due > last).length + pins.filter((p) => p.date > last).length;
  const dayInfo = new Map<string, DayMark>();
  tasks.forEach((t) => {
    if (!t.due) return;
    const c = dayInfo.get(t.due) ?? { n: 0, late: false };
    c.n += 1;
    if (!t.done && t.due < today) c.late = true;
    dayInfo.set(t.due, c);
  });
  const lateCount = tasks.filter((t) => !t.done && t.due && t.due < today).length;
  return { ranges, pins, first, last, openDues, beyond, dayInfo, lateCount };
}
