import { useSyncExternalStore } from 'react';

// 홈 보기: 「간단히 보기」(새 홈 /) · 「자세히 보기」(예전 화면 /classic). 기본 = 간단히. 고른 값은 이 기기에만(localStorage 'home:look').
// 'home:view' 는 예전 화면이 요약 · 단계 · 달력 탭 기억에 이미 쓰므로 다른 이름을 쓴다.
export type ViewMode = 'simple' | 'detail';
export const VIEW_KEY = 'home:look';
export const VIEW_HREF: Record<ViewMode, string> = { simple: '/', detail: '/classic' };

const listeners = new Set<() => void>();

export function readViewMode(): ViewMode {
  try { return localStorage.getItem(VIEW_KEY) === 'detail' ? 'detail' : 'simple'; } catch { return 'simple'; }
}

export function setViewMode(mode: ViewMode) {
  try { localStorage.setItem(VIEW_KEY, mode); } catch { /* 저장이 막혀도 이번 이동은 한다 */ }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === VIEW_KEY) cb(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
}

/** 지금 고른 보기(서버 그리기 · 첫 그리기는 'simple') */
export function useViewMode(): ViewMode {
  return useSyncExternalStore(subscribe, readViewMode, () => 'simple');
}
