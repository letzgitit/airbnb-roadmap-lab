// 분야 탭 좌우 쓸어 넘기기의 순수 판정 — 브라우저 API 없이 돈다(화면은 TabSwipe.tsx, swipe.test.ts 가 node --test 로 확인).
// 주money 데일리 src/lib/view/swipe.ts 를 그대로 옮겼다(기준값 · 판정 같음). 방향 잠그기 · 이웃 탭 계산 · 넘길지 말지 · 끝에서의 저항을 여기서만 정한다.

/** 처음 움직임이 가로로 확실한가의 기준 — 이만큼(px) 움직이고 |dx| 가 |dy| 의 이 배수를 넘어야 가로 제스처로 잡는다 */
export const SWIPE_LOCK_MIN = 10;
export const SWIPE_LOCK_RATIO = 1.5;
/** 화면 폭의 이만큼 넘게 끌면 이동 */
export const SWIPE_DIST_RATIO = 0.25;
/** 이 속도(px/ms)를 넘는 플릭이면 짧아도 이동 — 단, 최소 거리는 있다 */
export const SWIPE_FLICK_V = 0.5;
export const SWIPE_FLICK_MIN = 40;
/** 맨 끝에서 끌릴 수 있는 최대 폭(px)과 저항 */
export const SWIPE_EDGE_MAX = 36;

export type SwipeLock = 'x' | 'y' | null;

/** 첫 움직임(dx, dy)으로 방향을 잠근다. 아직 모르면 null, 세로가 분명하면 'y'(이 터치는 놓아 준다) */
export function lockAxis(dx: number, dy: number): SwipeLock {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax >= SWIPE_LOCK_MIN && ax > ay * SWIPE_LOCK_RATIO) return 'x';
  if (ay >= SWIPE_LOCK_MIN && ay * SWIPE_LOCK_RATIO >= ax) return 'y'; // 세로 쪽이 더 크거나 비슷하면 세로
  return null;
}

/** swipe: -1 = 왼쪽으로 쓸기(다음 탭), +1 = 오른쪽으로 쓸기(이전 탭). 현재가 없거나 끝이면 null */
export function neighborKey<K extends string>(keys: readonly K[], current: K | null | undefined, swipe: -1 | 1): K | null {
  if (!current) return null;
  const i = keys.indexOf(current);
  if (i < 0) return null;
  const j = swipe === -1 ? i + 1 : i - 1;
  return j >= 0 && j < keys.length ? keys[j] : null;
}

/** 손가락을 따라가는 거리 — 이웃이 있으면 그대로, 없으면(끝) 살짝만 */
export function followOffset(dx: number, hasNeighbor: boolean): number {
  if (hasNeighbor) return dx;
  return Math.sign(dx) * Math.min(SWIPE_EDGE_MAX, Math.abs(dx) * 0.25);
}

/** 놓았을 때 넘길지 — 폭의 25% 이상이거나 빠른 플릭 */
export function shouldCommit(dx: number, width: number, ms: number, hasNeighbor: boolean): boolean {
  if (!hasNeighbor || width <= 0) return false;
  const d = Math.abs(dx);
  if (d >= width * SWIPE_DIST_RATIO) return true;
  return d >= SWIPE_FLICK_MIN && d / Math.max(ms, 1) >= SWIPE_FLICK_V;
}
