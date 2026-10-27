// 할 일 줄 · 폼이 쓰는 순수 계산(화면 없이). task-view.test.ts 가 node --test 로 확인한다.
//   지우기만 하면 되는 TS 문법만 쓰고 import 에 .ts 를 붙여 Node 에서 바로 돈다(@/ 경로는 type import 에만).
import type { TaskItem } from '@/lib/core/types';
import { treeOrder } from '../../lib/core/task-tree.ts';

type TreeTask = Pick<TaskItem, 'id' | 'text'> & { parentId?: string | null };

const md = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}`; };

const dayDiff = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000);
/** 「곧 마감」이 붙는 남은 날(오늘 포함 0 ~ 3일) */
export const SOON_DAYS = 3;

/**
 * 할 일 줄의 때(새 홈 쉬운 모양): 안 끝난 일만.
 *  late = 마감 지남 · soon = 마감까지 0~3일(「곧 마감」) · prep = 준비 시작일 ≤ 오늘 < 마감(「지금 할 때」) · null = 그 밖
 */
export function taskPhase(t: Pick<TaskItem, 'done' | 'due'> & { start?: string | null }, today: string): 'late' | 'soon' | 'prep' | null {
  if (t.done) return null;
  if (t.due) {
    const n = dayDiff(today, t.due);
    if (n < 0) return 'late';
    if (n <= SOON_DAYS) return 'soon';
  }
  if (t.start && t.start <= today && (!t.due || today <= t.due)) return 'prep';
  return null;
}
export const PHASE_WORD = { soon: '곧 마감', prep: '지금 하면 돼요' } as const;

const WD = ['일', '월', '화', '수', '목', '금', '토'];
/** 긴 날짜(새 홈 쉬운 모양 · 시안 B): 「10월 27일(화)」 */
export function longDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}월 ${Number(d)}일(${WD[new Date(`${iso}T00:00:00`).getDay()]})`;
}

/** 보조 줄 날짜: 시작일이 마감일과 다르면 「10/28~10/30」, 시작일만 있으면 「10/28~」. 그 밖은 null(기존 마감일 표시 그대로) */
export function spanDate(start: string | null | undefined, due: string | null | undefined): string | null {
  if (!start || start === due) return null;
  return due ? `${md(start)}~${md(due)}` : `${md(start)}~`;
}

/**
 * 목록(이미 정렬됨)을 부모 바로 뒤에 세부 항목이 오게. 부모가 이 목록에 없는 세부 항목은 맨 위 층에 두고
 * parentTitle 에 부모 제목을 적는다(보조 줄 「‘부모 제목’의 세부 항목」). tasks = 전체 할 일(부모 제목 찾기용).
 */
export function treeRows<T extends TreeTask>(list: T[], tasks: Record<string, TreeTask>): { item: T; depth: 0 | 1; parentTitle?: string }[] {
  return treeOrder(list).map(({ item, depth, orphanOf }) => {
    const parentTitle = orphanOf ? (Object.hasOwn(tasks, orphanOf) ? tasks[orphanOf].text : undefined) : undefined;
    return parentTitle ? { item, depth, parentTitle } : { item, depth };
  });
}

/** 넣을 곳 값: 단계 = 's:3', 세부 항목 = 'p:<부모 id>' */
export const placeOf = (t: { stepId: number; parentId?: string | null }) => (t.parentId ? `p:${t.parentId}` : `s:${t.stepId}`);

/**
 * 넣을 곳을 바꿀 때 보낼 패치. 그대로면 빈 객체.
 * 세부로 넣기 { parentId } · 세부에서 떼기 { parentId: null, stepId } · 단계만 바꾸기 { stepId }
 */
export function placePatch(orig: string, next: string): { parentId?: string | null; stepId?: number } {
  if (orig === next) return {};
  if (next.startsWith('p:')) return { parentId: next.slice(2) };
  const stepId = Number(next.slice(2));
  return orig.startsWith('p:') ? { parentId: null, stepId } : { stepId };
}

/** 넣을 곳 값이 가리키는 단계(세부 항목이면 부모의 단계, 부모를 모르면 null) */
export function placeStep(place: string, tasks: Record<string, { stepId: number }>): number | null {
  if (place.startsWith('s:')) return Number(place.slice(2));
  const id = place.slice(2);
  return Object.hasOwn(tasks, id) ? tasks[id].stepId : null;
}

const toDate = (iso: string) => new Date(`${iso}T00:00:00`);
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (iso: string, n: number) => { const d = toDate(iso); d.setDate(d.getDate() + n); return isoOf(d); };

/** 일정 옮기기: 마감일과 (있으면) 시작일을 같은 날수만큼. 마감일이 없으면 null */
export function shiftPatch(t: { due: string | null; start?: string | null }, days: number): { due: string; start?: string } | null {
  if (!t.due) return null;
  return t.start ? { due: addDays(t.due, days), start: addDays(t.start, days) } : { due: addDays(t.due, days) };
}

/** 미리 보기 한 칸: 「10/28 → 11/4」, 시작일이 있으면 「10/28~10/30 → 11/4~11/6」 */
export function shiftLabel(t: { due: string; start?: string | null }, days: number): string {
  const p = shiftPatch(t, days);
  if (!p) return '';
  const before = spanDate(t.start, t.due) ?? md(t.due);
  const after = spanDate(p.start, p.due) ?? md(p.due);
  return `${before} → ${after}`;
}
