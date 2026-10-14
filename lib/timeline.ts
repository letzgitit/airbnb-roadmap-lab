// 타임라인 막대(시작/끝 Day, 색 종류). 기존 index.html 의 tasks 배열에서 가져온 값. id = 단계 번호(1~14).
export type TimelineType = 'prep' | 'milestone' | 'critical' | 'setup' | 'admin' | 'open';
export const TIMELINE: Record<number, { start: number; end: number; type: TimelineType }> = {
  1: { start: 0, end: 12, type: 'prep' },
  2: { start: 4, end: 12, type: 'prep' },
  3: { start: 12, end: 13, type: 'milestone' },
  4: { start: 13, end: 14, type: 'admin' },
  5: { start: 13, end: 18, type: 'critical' },
  6: { start: 15, end: 30, type: 'setup' },
  7: { start: 20, end: 35, type: 'setup' },
  8: { start: 28, end: 30, type: 'setup' },
  9: { start: 30, end: 32, type: 'admin' },
  10: { start: 32, end: 36, type: 'open' },
  11: { start: 35, end: 40, type: 'open' },
  12: { start: 38, end: 42, type: 'admin' },
  13: { start: 42, end: 44, type: 'open' },
  14: { start: 44, end: 45, type: 'open' },
};
export const DEFAULT_RANGE = { start: 0, end: 45, type: 'prep' as TimelineType };
