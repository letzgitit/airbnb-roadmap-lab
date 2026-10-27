'use client';

import { useRef, useSyncExternalStore, type MouseEvent, type PointerEvent } from 'react';

// 가로로 넘겨 보는 상자 공용(날짜 띠 DateStrip · 단계 탭 간트 StepGantt).
//   useDragScroll: 손가락은 기본 가로 스크롤 그대로, PC 마우스는 끌어서 넘긴다(6px 넘게 움직여야 끌기로 본다).
//     끈 뒤 손을 놓아도 누른 것으로 치지 않는다(창이 열리지 않게). 간트 막대 끌기처럼 안쪽에서 따로 끄는 것은 pointerdown 을 멈추면 된다.
//   useMedia: 화면 폭 같은 미디어 조건(바뀌면 다시 그린다). 서버에서는 false.
export function useDragScroll() {
  const drag = useRef<{ x: number; left: number; id: number; moved: boolean } | null>(null);
  const suppress = useRef(false);
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, id: e.pointerId, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const delta = e.clientX - d.x;
    if (!d.moved && Math.abs(delta) > 6) { d.moved = true; e.currentTarget.setPointerCapture(e.pointerId); }
    if (d.moved) e.currentTarget.scrollLeft = d.left - delta;
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.moved) return;
    suppress.current = true;
    window.setTimeout(() => { suppress.current = false; }, 0);
  };
  const onClickCapture = (e: MouseEvent<HTMLElement>) => { if (suppress.current) { e.preventDefault(); e.stopPropagation(); } };
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture };
}

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
