'use client';

import { useEffect, useRef } from 'react';
import type { Jump } from './search-model';

// 검색 결과 「그 줄로 가기」(설계 6장): 갈 곳 하나를 모듈 메모리에 맡겨 두고(Next 안에서 페이지를 옮겨도 남는다) 이벤트를 쏜다.
// 받는 화면(새 홈 · 자금)은 처음 그릴 때와 이벤트가 올 때 한 번씩 꺼내 쓴다 — 이미 그 화면이면 바로, 아니면 옮긴 뒤 그 화면이 꺼낸다.
// 맡긴 지 10초가 지나도록 아무도 안 꺼냈으면(옮기다 만 경우 등) 버린다 — 나중에 그 화면에 갔을 때 엉뚱하게 움직이지 않게.
const EVENT = 'search:jump';
const TTL = 10_000;
let pending: { j: Jump; at: number } | null = null;

export function requestJump(j: Jump) {
  pending = { j, at: Date.now() };
  window.dispatchEvent(new Event(EVENT));
}
/** 옮기기를 그만뒀다(「저장 안 한 내용」 확인에서 계속 편집) — 맡긴 갈 곳을 버린다 */
export function dropJump() { pending = null; }

/** 그 종류의 갈 곳이 맡겨져 있으면 꺼내 fn 에 준다(처음 그릴 때 한 번 + 이벤트마다). fn 은 늘 최신 것을 쓴다 */
export function useJump<K extends Jump['kind']>(kind: K, fn: (j: Extract<Jump, { kind: K }>) => void) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  useEffect(() => {
    const take = () => {
      if (pending && Date.now() - pending.at > TTL) pending = null;
      if (pending?.j.kind !== kind) return;
      const j = pending.j as Extract<Jump, { kind: K }>;
      pending = null;
      ref.current(j);
    };
    take();
    window.addEventListener(EVENT, take);
    return () => window.removeEventListener(EVENT, take);
  }, [kind]);
}

/** 도착한 줄: 가운데로 스크롤하고 잠깐 형광으로 칠한다(.task-flash — 움직임 줄이기면 검정 테두리). 줄이 아직 없으면 몇 프레임 다시 본다 */
export function revealRow(id: string, tries = 40) {
  let n = 0;
  const go = () => {
    const el = document.getElementById(id);
    if (!el) { if (n++ < tries) window.requestAnimationFrame(go); return; }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    el.classList.remove('task-flash');
    void el.offsetWidth; // 같은 줄을 다시 칠할 때 애니메이션을 처음부터
    el.classList.add('task-flash');
    window.setTimeout(() => el.classList.remove('task-flash'), 1900);
  };
  window.requestAnimationFrame(go);
}
