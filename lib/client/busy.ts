import { useSyncExternalStore } from 'react';

// 진행 중인 요청 수를 세는 작은 전역 저장소. 화면 맨 위 로딩 막대(TopLoader)가 이걸 읽는다.
// slow = 사진 올리기처럼 오래 걸리는 요청(막대가 끝까지 가지 않고 천천히 찬다).
export interface BusyState { active: number; slow: number }

let state: BusyState = { active: 0, slow: 0 };
const listeners = new Set<() => void>();
const set = (next: BusyState) => { state = next; listeners.forEach((l) => l()); };

/** 요청 하나가 시작됐음을 알리고, 끝날 때 부를 함수를 돌려준다(두 번 불러도 한 번만 센다). */
export function beginBusy(opts?: { slow?: boolean }): () => void {
  const slow = opts?.slow ? 1 : 0;
  set({ active: state.active + 1, slow: state.slow + slow });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    set({ active: Math.max(0, state.active - 1), slow: Math.max(0, state.slow - slow) });
  };
}

/** fetch 와 같은 인자. 응답을 받을 때까지(성공 · 실패 모두) 막대를 켜 둔다. */
export async function busyFetch(input: RequestInfo | URL, init?: RequestInit, opts?: { slow?: boolean }): Promise<Response> {
  const end = beginBusy(opts);
  try { return await fetch(input, init); } finally { end(); }
}

export function useNetworkBusy(): BusyState {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state, () => state);
}
