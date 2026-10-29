'use client';

import type { GuideBodies } from './search-model';

// 검색용 도움말 본문(설계 5.4): 검색 단추에 손이 닿는 순간 GET /api/guides?body=1 을 한 번 받아 모듈 메모리에 둔다(홈을 열 때마다 받지는 않는다 — 커질 수 있어서).
// 응답 = { bodies: { [할 일 id]: { text, version } } }(지운 할 일 뺌, 마크다운 기호를 뺀 글). 도움말을 저장하면 그 항목만 바로 바꾼다(guides-client 의 saveGuide).
// version 이 도움말 목록(useGuideIds)과 어긋나면 결과 화면이 뒤에서 다시 받는다(SearchResults).
export type GuideBodiesState = { status: 'idle' | 'loading' | 'ready' | 'error'; bodies: GuideBodies };
let state: GuideBodiesState = { status: 'idle', bodies: {} };
let inflight: Promise<void> | null = null;
let ctrl: AbortController | null = null;
const subs = new Set<() => void>();
const set = (s: GuideBodiesState) => { state = s; subs.forEach((f) => f()); };

export const getGuideBodies = () => state;
export function subscribeGuideBodies(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

/** 받아 둔다. force = 이미 받았어도 다시(목록과 version 이 어긋날 때). 받는 동안은 전에 받은 본문으로 찾는다 */
export function prefetchGuideBodies(force = false): void {
  if (inflight || (!force && (state.status === 'ready' || state.status === 'loading'))) return;
  if (state.status !== 'ready') set({ ...state, status: 'loading' });
  const mine = new AbortController();
  ctrl = mine;
  const p: Promise<void> = fetch('/api/guides?body=1', { cache: 'no-store', signal: mine.signal })
    .then((r) => {
      // 로그인이 끊겼다(401 · 403): 받아 둔 본문을 메모리에서 지우고(현황 문서를 지우는 것과 같은 원칙) 「찾는 중…」이 남지 않게 실패로 둔다
      if (r.status === 401 || r.status === 403) { set({ status: 'error', bodies: {} }); return null; }
      return r.ok ? r.json() : Promise.reject(new Error(String(r.status)));
    })
    .then((j: { bodies?: GuideBodies } | null) => { if (j && !mine.signal.aborted) set({ status: 'ready', bodies: j.bodies ?? {} }); })
    .catch(() => { if (!mine.signal.aborted) set({ ...state, status: state.status === 'ready' ? 'ready' : 'error' }); })
    .finally(() => { if (inflight === p) { inflight = null; ctrl = null; } });
  inflight = p;
}
/** 로그아웃 · 로그인 끊김: 받는 중인 요청은 취소하고(늦게 온 응답이 다시 채우지 않게) 받아 둔 본문을 비운다 */
export function clearGuideBodies() {
  ctrl?.abort();
  ctrl = null;
  inflight = null;
  if (state.status !== 'idle' || Object.keys(state.bodies).length) set({ status: 'idle', bodies: {} });
}

/** 도움말을 저장했다(빈 글 = 지움): 받아 둔 본문이 있으면 그 항목만 바꾼다. 기호는 찾을 때 뺀다(md) */
export function noteGuideSaved(id: string, md: string | null, version: number) {
  if (state.status !== 'ready') return;
  const bodies = { ...state.bodies };
  if (md) bodies[id] = { md, version }; else delete bodies[id];
  set({ ...state, bodies });
}
