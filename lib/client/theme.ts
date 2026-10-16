import { useSyncExternalStore } from 'react';
import { DEFAULT_THEME_MODE } from './theme-default';

// 화면 모드: 시스템 / 라이트 / 다크(저장값이 없을 때는 DEFAULT_THEME_MODE). 고른 값은 localStorage('theme')에
// 'system' | 'light' | 'dark' 로 저장한다. 첫 그리기 전에 <html class="dark"> 를 붙이는 일은 layout.tsx 의 인라인 스크립트가 한다.
export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_KEY = 'theme';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : DEFAULT_THEME_MODE;
  } catch { return DEFAULT_THEME_MODE; }
}

function systemDark(): boolean {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}

/** 모드를 <html> 에 반영한다(class="dark" + color-scheme). */
export function applyMode(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && systemDark());
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export function setMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch { /* 저장이 막혀도 이번 화면에는 적용한다 */ }
  applyMode(mode);
  emit();
}

function subscribeMode(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY || e.key === null) { applyMode(readMode()); cb(); } };
  window.addEventListener('storage', onStorage);
  // 시스템 모드일 때 OS 설정이 바뀌면 바로 따라간다
  let mq: MediaQueryList | null = null;
  const onSystem = () => { if (readMode() === 'system') { applyMode('system'); cb(); } };
  try { mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', onSystem); } catch { /* 지원 안 함 */ }
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); mq?.removeEventListener('change', onSystem); };
}

/** 고른 모드(서버·첫 그리기에서는 'system'). */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeMode, readMode, () => DEFAULT_THEME_MODE);
}

function subscribeDark(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => mo.disconnect();
}

/** 지금 실제로 어두운 화면인가(캔버스 차트처럼 CSS 를 못 쓰는 곳용). */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribeDark, () => document.documentElement.classList.contains('dark'), () => false);
}
