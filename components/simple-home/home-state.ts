// 새 홈이 기억하는 화면 상태(고른 탭 · 펼친 블록 · 달력 탭에서 접은 묶음 · 갤러리 보조 탭 · 스크롤 위치) — 2026-10-29 사이트 주인이 정한 시작 규칙:
//   새로 들어올 때(새 창 · 새 탭 · 폰 홈 화면 아이콘) = 달력 탭(「오늘」 · 「다가오는 일정」 묶음 펼침) + 모든 단계 블록 접힘 + 갤러리 「사진」 + 맨 위.
//   들어온 뒤 새로고침 · 같은 탭에서 시안 · 자금에 갔다 돌아오기 = 그대로(탭 · 펼친 블록 · 보조 탭 · 스크롤 위치).
// 그래서 sessionStorage(브라우저 탭이 살아 있는 동안만 — 새로고침엔 남고 새 창엔 비어 있음)에 둔다. 이 기기 · 이 탭에만 있어 두 사람 화면이 서로 바뀌지 않는다.
// 읽기 · 쓰기는 늘 try/catch — 막혀 있으면 이번 화면에만 적용되고 새로 들어온 것처럼 시작한다.
import { TABS, type TabId } from './home-model';
import type { PhotoSub } from './PhotosTab';

export const TAB_KEY = 'home:sheet';
export const PHOTO_SUB_KEY = 'home:photos-sub';
/** 펼친 단계 블록 id 목록(행정 · 설비 · 운영 모두 한 목록 — 블록 id 가 「분야.블록」이라 겹치지 않는다) */
export const OPEN_KEY = 'home:open-blocks';
const SCROLL_KEY = 'home:scroll';
/** 달력 탭에서 접은 묶음 — 'day'(「오늘」 · 고른 날, 날을 바꿔도 하나) · 'upcoming'(「다가오는 일정」). 새로 들어오면 비어 있어 둘 다 펼침 */
export const CAL_FOLD_KEY = 'home:cal-folded';
export type CalGroup = 'day' | 'upcoming';
/** 새로 들어왔을 때 여는 탭 */
export const START_TAB: TabId = 'calendar';

export const read = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
export const write = (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* 저장이 막혀도 이번 화면에는 적용 */ } };

/** 2026-10-29 전에는 같은 이름을 localStorage 에 두었다 — 남은 값은 한 번 지운다(이제 읽지 않는다) */
export function dropOldLocal() {
  try { for (const k of [TAB_KEY, PHOTO_SUB_KEY, OPEN_KEY]) localStorage.removeItem(k); } catch { /* 못 지워도 읽지 않으니 그만 */ }
}

/** 처음 그릴 탭 — 이 탭에서 고른 적이 있으면 그 탭, 아니면(새로 들어옴) 달력. 뼈대 화면(HomeSwitch)도 같은 값을 쓴다 */
export const startTab = (): TabId => {
  const v = read(TAB_KEY) ?? '';
  return TABS.some((t) => t.id === v) ? (v as TabId) : START_TAB;
};
export const savedOpen = (): Set<string> => {
  try {
    const v: unknown = JSON.parse(read(OPEN_KEY) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch { return new Set(); }
};
export const savedCalFolded = (): Set<CalGroup> => {
  try {
    const v: unknown = JSON.parse(read(CAL_FOLD_KEY) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is CalGroup => x === 'day' || x === 'upcoming') : []);
  } catch { return new Set(); }
};
export const savedSub =(): PhotoSub => { const v = read(PHOTO_SUB_KEY); return v === 'docs' || v === 'etc' ? v : 'photos'; };

/** 홈 스크롤 위치를 적어 둔다(스크롤이 멈출 때 — 0.15초 쉬면). 돌려주는 함수로 그만 듣는다 */
export function trackScroll(): () => void {
  let t = 0;
  const save = () => { window.clearTimeout(t); t = window.setTimeout(() => write(SCROLL_KEY, String(Math.round(window.scrollY))), 150); };
  window.addEventListener('scroll', save, { passive: true });
  return () => { window.clearTimeout(t); window.removeEventListener('scroll', save); };
}

/**
 * 적어 둔 스크롤 위치로 한 번 되돌린다(데이터가 늦게 그려져 브라우저 자동 복원이 안 먹으므로). 새로 들어왔으면(적어 둔 값 없음) 아무것도 안 한다.
 * 사진처럼 늦게 커지는 내용이 있어, 그 자리까지 내려갈 수 있을 만큼 화면이 길어질 때까지 잠깐(1.5초까지) 다시 해 본다. 그 사이 사람이 스크롤하면 그만.
 */
export function restoreScroll(): () => void {
  const y = Number(read(SCROLL_KEY));
  if (!Number.isFinite(y) || y <= 0) return () => undefined;
  let raf = 0;
  let stop = false;
  const until = performance.now() + 1500;
  const quit = () => { stop = true; };
  window.addEventListener('touchstart', quit, { passive: true, once: true });
  window.addEventListener('wheel', quit, { passive: true, once: true });
  const go = () => {
    if (stop) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: Math.min(y, Math.max(0, max)) });
    if (max < y && performance.now() < until) raf = window.requestAnimationFrame(go);
  };
  raf = window.requestAnimationFrame(go);
  return () => {
    stop = true;
    window.cancelAnimationFrame(raf);
    window.removeEventListener('touchstart', quit);
    window.removeEventListener('wheel', quit);
  };
}
