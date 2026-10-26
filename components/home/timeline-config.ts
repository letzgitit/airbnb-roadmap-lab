import type { Step } from '@/lib/core/types';
import { DEFAULT_RANGE, TIMELINE } from '@/lib/timeline';
import type { TimelineStep } from './step-dates';

// 사이트마다 다른 타임라인 재료(외도민판). DateTimeline · step-dates 는 지산판과 같은 파일이고, 이 파일만 다르다.
// 공개 일정의 날수(lib/timeline)는 「시작한 날부터 센 날」이라 정해진 출발일이 없다 → 현황에서 찾는다(step-dates).
export const FIXED_DAY0: string | undefined = undefined;
/** 단계 창 머리의 공개 일정 앞말(「보통 13~18일째 · 우리 일정 10/13~11/3」) */
export const PLAN_WORD = '보통';
/** 고정 일정에 늘 더할 표시(지산판의 만기 같은 것). 외도민은 현황의 「고정 · 」 줄만 쓴다 */
export const FIXED_MARKS: { date: string; label: string }[] = [];
export const toTimelineSteps = (steps: Step[]): TimelineStep[] =>
  steps.map((s) => { const r = TIMELINE[s.id] ?? DEFAULT_RANGE; return { id: s.id, title: s.title, start: r.start, end: r.end, type: r.type }; });
