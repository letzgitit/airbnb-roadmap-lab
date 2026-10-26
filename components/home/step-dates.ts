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
