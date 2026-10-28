'use client';
// 좌우로 쓸어 넘기기 — 주money 데일리 components/daily/islands/Swipe.tsx 를 옮겨 두 군데에 쓴다(판정은 swipe.ts).
//   useTabSwipe: 폰에서 본문을 왼쪽으로 쓸면 다음 분야 탭, 오른쪽으로 쓸면 이전 탭(TABS 순서, 양 끝에서는 멈춤).
//     데일리와 다른 점: 탭 바꾸기가 주소 이동이 아니라 SimpleHome 의 pick(상태)이고, 손가락을 따라 움직이는 것은 본문 전체(#main)가 아니라
//     탭 줄 아래 본문(data-tab-swipe 를 단 div)이다 — 위에 붙는 탭 줄은 제자리에 둔다.
//     본문 밑 빈 자리(내용이 짧은 탭에서 화면 아래쪽)도 쓸 수 있게 듣는 곳은 document 이고, 머리 띠 위에서 시작한 터치는 받지 않는다.
//     데일리는 단추 위에서 시작한 터치도 무시하지만, 여기서는 할 일 줄 · 블록 머리가 통째로 단추라 단추를 빼면 쓸 자리가 거의 없어
//     단추는 받는다(가로로 움직인 터치는 누름으로 치지 않고, 아래 click 막기가 한 번 더 막는다).
//   useMonthSwipe(CalendarTab): 달력 판 위에서 쓸면 달을 넘긴다(판에는 data-noswipe 가 있어 탭 넘기기는 그 터치를 받지 않는다).
// 공통(useSwipeNav): 손가락(touch)에서만. 세로 스크롤은 건드리지 않는다 — 첫 움직임이 가로로 확실할 때(lockAxis)만 잡는다.
//   화면 양 끝 20px(브라우저 뒤로 · 앞으로 제스처), 확대해 둔 화면, 열린 창(시트 · 사진 크게 보기)이 있을 때는 받지 않는다.
//   가로로 잡힌 쓸기가 끝난 직후의 click 하나는 먹는다(손을 뗀 자리의 단추 · 날짜 칸이 눌리지 않게). 그냥 톡 누르기는 그대로.
//   움직임 줄이기면 따라 움직이는 모습 없이 이동만 한다.
import { useEffect, useRef } from 'react';
import { followOffset, lockAxis, neighborKey, shouldCommit } from './swipe';

const EDGE = 20; // 화면 왼쪽 · 오른쪽 끝 이만큼은 브라우저의 뒤로 · 앞으로 제스처에 둔다
const OUT_MS = 160; // 탭을 넘길 때 본문이 밀려 나가는 시간 — 끝난 뒤 탭을 바꾼다
const CLICK_EAT_MS = 450; // 가로 쓸기가 끝난 뒤 이 안에 오는 click 하나는 먹는다
type Dir = -1 | 1; // -1 = 왼쪽으로 쓸기(다음), +1 = 오른쪽으로 쓸기(이전)

/** 시작한 자리에서 위로 올라가며, 가로로 실제 넘치는(스크롤되는) 요소가 있으면 참 */
function inHScroll(el: Element | null): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const ox = getComputedStyle(n).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth - n.clientWidth > 1) return true;
  }
  return false;
}
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clear = (m: HTMLElement | null, animate: boolean) => {
  if (!m) return;
  m.style.transition = animate && !reduce() ? 'transform .2s ease-out' : '';
  m.style.transform = '';
  m.style.opacity = '';
  m.style.willChange = '';
};

interface SwipeNav {
  /** 이 요소에서 시작한 터치를 받을지 */
  accept: (el: Element) => boolean;
  /** 손가락을 따라 움직일 요소 */
  moving: () => HTMLElement | null;
  /** 그쪽으로 넘어갈 곳이 있는지 */
  has: (dir: Dir) => boolean;
  go: (dir: Dir) => void;
  /** slide = 밀려 나간 뒤 넘김(탭), snap = 바로 넘기고 새 내용이 제자리에(달력) */
  out: 'slide' | 'snap';
}

/** 쓸어 넘기기 한 벌. resetKey(지금 탭 · 지금 달)가 바뀌면 움직이던 요소를 제자리로 */
function useSwipeNav(nav: SwipeNav, resetKey: string) {
  const now = useRef(nav);
  useEffect(() => { now.current = nav; });
  const settling = useRef(false); // 넘기는 중 — 다음 쓸기를 받지 않는다
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    settling.current = false;
    window.clearTimeout(timer.current);
    clear(now.current.moving(), false);
  }, [resetKey]);

  useEffect(() => {
    let g: { x: number; y: number; t: number; lock: 'x' | 'y' | null } | null = null;
    let eatUntil = 0;

    const start = (e: TouchEvent) => {
      if (g?.lock === 'x') clear(now.current.moving(), true); // 끄는 도중 두 번째 손가락(핀치) — 끌려 나간 것을 제자리로
      g = null;
      if (settling.current || e.touches.length !== 1) return;
      // 확대해 둔 화면에서 가로로 미는 것은 확대한 화면 둘러보기다 — 넘기지 않는다
      if ((window.visualViewport?.scale ?? 1) > 1.01) return;
      if (document.querySelector('[role=dialog]')) return;
      const t = e.touches[0];
      if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;
      const el = e.target instanceof Element ? e.target : null;
      if (!el || !now.current.accept(el)) return;
      g = { x: t.clientX, y: t.clientY, t: e.timeStamp, lock: null };
    };

    const move = (e: TouchEvent) => {
      if (!g || g.lock === 'y') return;
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      const m = now.current.moving();
      if (!g.lock) {
        g.lock = lockAxis(dx, dy);
        if (g.lock !== 'x') return;
        if (m && !reduce()) m.style.willChange = 'transform';
      }
      if (e.cancelable) e.preventDefault();
      if (reduce() || !m) return;
      m.style.transition = '';
      m.style.transform = `translate3d(${followOffset(dx, now.current.has(dx < 0 ? -1 : 1))}px,0,0)`;
    };

    const end = (e: TouchEvent) => {
      const s = g;
      g = null;
      if (!s || s.lock !== 'x') return;
      eatUntil = e.timeStamp + CLICK_EAT_MS;
      const dx = e.changedTouches[0].clientX - s.x;
      const dir: Dir = dx < 0 ? -1 : 1;
      const { has, go, moving, out } = now.current;
      const m = moving();
      const w = window.innerWidth;
      if (!(has(dir) && shouldCommit(dx, w, e.timeStamp - s.t, true))) { clear(m, true); return; }
      if (out === 'snap' || !m || reduce()) { go(dir); return; }
      settling.current = true;
      window.clearTimeout(timer.current);
      m.style.transition = `transform ${OUT_MS / 1000}s ease-in, opacity ${OUT_MS / 1000}s ease-in`;
      m.style.transform = `translate3d(${dir < 0 ? -w * 0.5 : w * 0.5}px,0,0)`;
      m.style.opacity = '0.2';
      timer.current = window.setTimeout(() => go(dir), OUT_MS);
    };
    const cancel = () => {
      if (g?.lock === 'x') clear(now.current.moving(), true);
      g = null;
    };
    // 쓸기 끝에 손을 뗀 자리의 click 이 오면 먹는다(쓸기는 누르기가 아니다)
    const eat = (e: MouseEvent) => {
      if (e.timeStamp > eatUntil) return;
      eatUntil = 0;
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', cancel, { passive: true });
    document.addEventListener('click', eat, true);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', cancel);
      document.removeEventListener('click', eat, true);
    };
  }, []);
}

// 탭 넘기기에서 빼는 터치: 입력칸 · 고치는 폼(그 안 단추 포함) · 열린 창 · 달력 판처럼 따로 쓰는 곳(data-noswipe) · 영상
const TAB_SKIP = 'input, textarea, select, form, [contenteditable], [role=dialog], [role=slider], video, iframe, [data-noswipe]';
/** 손가락을 따라 움직일 본문(탭 줄 아래) — SimpleHome 이 그 div 에 data-tab-swipe 를 단다 */
const tabBody = () => document.querySelector<HTMLElement>('[data-tab-swipe]');

export function useTabSwipe<K extends string>({ keys, current, onPick, enabled }: {
  keys: readonly K[]; current: K; onPick: (k: K) => void;
  /** 지금 쓸기를 받을지(쓰다 만 폼이 있으면 거짓) */
  enabled: () => boolean;
}) {
  useSwipeNav({
    accept: (el) => {
      const main = document.getElementById('main');
      // 본문 안이거나, 본문이 짧아 화면 아래가 빈 자리(html · body)
      const inside = !!main && (main.contains(el) || el === document.documentElement || el === document.body);
      return inside && !el.closest(TAB_SKIP) && !inHScroll(el) && keys.length > 1 && enabled();
    },
    moving: tabBody,
    has: (dir) => !!neighborKey(keys, current, dir),
    go: (dir) => { const to = neighborKey(keys, current, dir); if (to) onPick(to); },
    out: 'slide',
  }, current);
}

/** 달력 판(날짜 칸 격자) 쓸기: 왼쪽 = 다음 달, 오른쪽 = 이전 달(끝 없음). 판이 손가락을 살짝 따라오고, 넘기면 새 달이 제자리에 그려진다 */
export function useMonthSwipe(board: { current: HTMLElement | null }, month: string, onMonth: (step: 1 | -1) => void) {
  useSwipeNav({
    accept: (el) => !!board.current?.contains(el) && !el.closest('input, textarea, select, form, [contenteditable]'),
    moving: () => board.current,
    has: () => true,
    go: (dir) => onMonth(dir === -1 ? 1 : -1),
    out: 'snap',
  }, month);
}
