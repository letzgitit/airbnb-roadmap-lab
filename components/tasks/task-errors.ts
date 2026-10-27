import type { SendResult } from '@/components/progress/ProgressProvider';

// 할 일 저장이 거절됐을 때 폼 안에 적는 말(서버 거절 코드 → 사람 말). 간트 편집 폼 · 할 일 줄 폼 · 새 할 일 폼이 같이 쓴다.
// 서버 문구(lib/core/task-tree.ts PARENT_PROBLEM_MESSAGE)는 CLI · 알림용이라 「~습니다」체 — 화면에서는 이 말로 바꿔 보인다.
const TASK_ERROR: Record<string, string> = {
  start_after_due: '시작일이 마감일보다 늦어요. 날짜를 다시 골라 주세요.',
  step_mismatch: '세부 항목은 그 항목을 달 할 일과 같은 단계에만 둘 수 있어요.',
  has_children: '세부 항목이 달린 할 일은 다른 할 일 밑에 넣을 수 없어요.',
  parent_self: '자기 자신 밑에는 넣을 수 없어요.',
  parent_not_found: '고른 할 일(이 항목을 달 곳)을 찾지 못했어요. 화면을 새로 고친 뒤 다시 해 주세요.',
  parent_deleted: '고른 할 일이 지워져서 그 밑에 넣을 수 없어요.',
  parent_is_child: '세부 항목 밑에는 세부 항목을 또 달 수 없어요.',
};

/** 시작일 > 마감일이면 보낼 필요 없이 바로 이 말 */
export const START_AFTER_DUE = TASK_ERROR.start_after_due;

/** 거절된 저장의 까닭(폼에 적을 말). 거절 코드를 모르면 서버 문구, 그것도 없으면 null(충돌 창 · 알림이 따로 뜬 경우) */
export function taskErrorMessage(r: SendResult): string | null {
  if (r.ok) return null;
  const code = typeof r.body?.error === 'string' ? r.body.error : '';
  if (code && TASK_ERROR[code]) return TASK_ERROR[code];
  if (r.status === 400 && typeof r.body?.message === 'string') return r.body.message;
  return null;
}
