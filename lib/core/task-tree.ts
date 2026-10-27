// 할 일 시작일 · 세부 항목(한 층) 공용 규칙. 엔진 · Todoist 반영 · 내보내기 · CLI · 화면이 같이 쓴다.
// 엔진과 같이 Node 에서 바로 읽히도록 지우기만 하면 되는 TS 문법만 쓴다. 엔진을 import 하지 않는다.
//
// - start(선택): 시작일. 없으면 마감일 하루짜리로 본다(taskStart). 둘 다 있으면 시작일 ≤ 마감일.
// - parentId(선택): 세부 항목이면 부모 할 일 id. 한 층만(세부 항목의 세부 항목 없음). 부모와 같은 단계.
// 옛 할 일(두 키가 없음)은 그대로 읽힌다 — 옮기는 작업 없음.
import type { ProgressDoc, TaskItem } from './types.ts';

type TaskLike = Pick<TaskItem, 'id' | 'stepId' | 'deletedAt'> & { parentId?: string | null };

/** 간트 막대의 시작: 시작일, 없으면 마감일. 둘 다 없으면 null */
export function taskStart(t: { start?: string | null; due: string | null }): string | null {
  return t.start ?? t.due ?? null;
}

/** 시작일이 마감일보다 늦으면 오류 문장, 괜찮으면 null(어느 한쪽이 없으면 따지지 않는다) */
export function spanError(start: string | null | undefined, due: string | null | undefined): string | null {
  return start && due && start > due ? '시작일은 마감일보다 늦을 수 없습니다.' : null;
}

/** 이 할 일의 세부 항목(지운 것 포함) */
export function childrenOf<T extends TaskLike>(doc: { tasks: Record<string, T> }, id: string): T[] {
  return Object.values(doc.tasks).filter((t) => t.parentId === id);
}
export function liveChildrenOf<T extends TaskLike>(doc: { tasks: Record<string, T> }, id: string): T[] {
  return childrenOf(doc, id).filter((t) => !t.deletedAt);
}

export type ParentProblem = 'parent_self' | 'parent_not_found' | 'parent_deleted' | 'parent_is_child';
export const PARENT_PROBLEM_MESSAGE: Record<ParentProblem | 'has_children' | 'step_mismatch', string> = {
  parent_self: '자기 자신을 부모로 지정할 수 없습니다.',
  parent_not_found: '부모 할 일을 찾을 수 없습니다.',
  parent_deleted: '부모 할 일이 지워져 있습니다. 부모 할 일을 먼저 되살리세요.',
  parent_is_child: '세부 항목 밑에는 세부 항목을 넣을 수 없습니다(한 층만).',
  has_children: '세부 항목이 있는 할 일은 다른 할 일 밑으로 넣을 수 없습니다.',
  step_mismatch: '세부 항목은 부모와 같은 단계여야 합니다. 부모 할 일의 단계를 옮기세요.',
};

/** parentId 가 부모가 될 수 있는가. 문제 없으면 { parent } */
export function checkParent<T extends TaskLike>(doc: { tasks: Record<string, T> }, parentId: string, selfId: string | null):
  { problem: ParentProblem; parent?: T } | { problem: null; parent: T } {
  if (selfId && parentId === selfId) return { problem: 'parent_self' };
  const parent = Object.hasOwn(doc.tasks, parentId) ? doc.tasks[parentId] : undefined;
  if (!parent) return { problem: 'parent_not_found' };
  if (parent.deletedAt) return { problem: 'parent_deleted', parent };
  if (parent.parentId) return { problem: 'parent_is_child', parent };
  return { problem: null, parent };
}

/**
 * 목록(이미 원하는 순서로 정렬됨)을 트리 순서로: 부모 바로 뒤에 그 세부 항목(목록 순서 그대로).
 * 부모가 목록에 없는 세부 항목(부모만 끝났거나 다른 목록에 있음)은 맨 위 층에 두고 orphanOf 에 부모 id 를 적는다.
 */
export function treeOrder<T extends { id: string; parentId?: string | null }>(list: T[]): { item: T; depth: 0 | 1; orphanOf?: string }[] {
  const ids = new Set(list.map((t) => t.id));
  const kids = new Map<string, T[]>();
  for (const t of list) if (t.parentId && ids.has(t.parentId)) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);
  const out: { item: T; depth: 0 | 1; orphanOf?: string }[] = [];
  for (const t of list) {
    if (t.parentId && ids.has(t.parentId)) continue;
    out.push(t.parentId ? { item: t, depth: 0, orphanOf: t.parentId } : { item: t, depth: 0 });
    for (const c of kids.get(t.id) ?? []) out.push({ item: c, depth: 1 });
  }
  return out;
}

/** 부모가 없어진(정리된) 세부 항목의 parentId 를 지운다. 바꾼 개수 */
export function dropDanglingParents(doc: Pick<ProgressDoc, 'tasks'>): number {
  let n = 0;
  for (const t of Object.values(doc.tasks)) {
    if (t.parentId && !Object.hasOwn(doc.tasks, t.parentId)) { delete t.parentId; n++; }
  }
  return n;
}
