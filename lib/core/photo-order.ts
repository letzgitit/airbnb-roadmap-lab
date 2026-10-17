// 사진 줄 세우기(화면 · CLI 공용, 서버 전용 코드를 끌어오지 않는 순수 함수).
// 기본 순서: 단계 → position(있는 것 먼저, 작은 순) → 찍은 시각 → 올린 순서.
// position 이 없는 사진(기존 데이터 · 새로 올린 사진)은 같은 단계의 position 있는 사진 뒤에 찍은 시각 순으로 붙는다.
// 그래서 position 이 하나도 없으면 예전 순서(단계 → 찍은 시각 → 올린 순서) 그대로다.
// 참고 사진(stepId 0 = REF_STEP, 다른 집 현장 같은 우리 집이 아닌 사진)은 모든 단계 뒤(맨 끝)에 온다.

/** 단계와 따로 두는 「참고 사진」 칸의 stepId. 타임라인 단계(1~)에 섞이지 않는다 */
export const REF_STEP = 0;
export const REF_LABEL = '참고 사진 (우리 집 아님)';

interface Orderable { stepId: number; takenAt: string; order: number; position?: number | null }

const pos = (p: Orderable) => (typeof p.position === 'number' ? p.position : Number.POSITIVE_INFINITY);
const rank = (stepId: number) => (stepId === REF_STEP ? Number.POSITIVE_INFINITY : stepId);

export const byStepPosition = (a: Orderable, b: Orderable) => {
  if (a.stepId !== b.stepId) return rank(a.stepId) < rank(b.stepId) ? -1 : 1;
  const pa = pos(a), pb = pos(b);
  if (pa !== pb) return pa < pb ? -1 : 1;
  return a.takenAt.localeCompare(b.takenAt) || a.order - b.order;
};
