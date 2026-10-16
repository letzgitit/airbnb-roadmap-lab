// 사진 줄 세우기(화면 · CLI 공용, 서버 전용 코드를 끌어오지 않는 순수 함수).
// 기본 순서: 단계 → position(있는 것 먼저, 작은 순) → 찍은 시각 → 올린 순서.
// position 이 없는 사진(기존 데이터 · 새로 올린 사진)은 같은 단계의 position 있는 사진 뒤에 찍은 시각 순으로 붙는다.
// 그래서 position 이 하나도 없으면 예전 순서(단계 → 찍은 시각 → 올린 순서) 그대로다.
interface Orderable { stepId: number; takenAt: string; order: number; position?: number | null }

const pos = (p: Orderable) => (typeof p.position === 'number' ? p.position : Number.POSITIVE_INFINITY);

export const byStepPosition = (a: Orderable, b: Orderable) => {
  if (a.stepId !== b.stepId) return a.stepId - b.stepId;
  const pa = pos(a), pb = pos(b);
  if (pa !== pb) return pa < pb ? -1 : 1;
  return a.takenAt.localeCompare(b.takenAt) || a.order - b.order;
};
