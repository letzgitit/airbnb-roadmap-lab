'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '@/components/ui/IconButton';
import { clearGuideBodies, prefetchGuideBodies } from './guide-bodies';
import { clearLastQuery, preloadResults, SearchFrame } from './SearchFrame';

/**
 * 머리 띠 돋보기(로그인한 두 사람만 — 부르는 쪽이 정한다, DESIGN.md 8장 「검색」): 톱니와 같은 44px band 아이콘 단추 + 키보드 「/」.
 * 누르면 같은 렌더에서 검색 창(덮는 면 · 입력칸)을 그려 입력칸에 포커스한다 — 아이폰은 누른 그 순간 안에서 포커스해야 키보드가 뜬다.
 * 미리 받기(설계 5.4): 결과 조각 JS 는 홈이 한가해지면 한 번, 도움말 본문은 단추에 손이 닿는 순간(올림 · 포커스 · 누르기 시작 · 「/」).
 * 열고 닫기(5.3): 열 때 기록 한 칸을 쌓아(주소는 그대로) 폰 뒤로 가기가 창을 닫는다. 「닫기」 · Esc 는 쌓은 칸이면 뒤로 한 번(popstate 가 닫는다),
 * 600ms 안에 popstate 가 안 오면 직접 닫는다. after = 닫힌 뒤 할 일(결과 줄로 가기 — 기록이 꼬이지 않게 뒤로 간 다음에 옮긴다).
 */
export function SearchButton() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pushed = useRef(false);
  const after = useRef<(() => void) | null>(null);
  const timer = useRef(0);

  const warm = useCallback(() => { prefetchGuideBodies(); preloadResults(); }, []);
  const show = useCallback(() => {
    performance.mark?.('search:tap');
    warm();
    if (pushed.current) { setOpen(true); return; }
    try {
      // Next 가 쓰는 기록 값은 그대로 두고 표시만 더한다(도움말 시트와 같은 방식)
      window.history.pushState({ ...(window.history.state ?? {}), search: 1 }, '');
      pushed.current = true;
    } catch { pushed.current = false; }
    setOpen(true);
  }, [warm]);
  const finish = useCallback(() => {
    window.clearTimeout(timer.current);
    pushed.current = false;
    setOpen(false);
    const run = after.current;
    after.current = null;
    btn.current?.focus({ preventScroll: true });
    // Next 가 popstate 를 마저 처리한 뒤에 옮긴다
    if (run) window.setTimeout(run, 0);
  }, []);
  const close = useCallback((then?: () => void) => {
    after.current = then ?? null;
    if (pushed.current && window.history.state?.search) {
      window.history.back();
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { if (pushed.current) finish(); }, 600);
    } else finish();
  }, [finish]);

  useEffect(() => {
    if (!open) return;
    const onPop = () => { if (pushed.current) finish(); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open, finish]);
  // 돋보기는 로그인한 동안만 있다 — 사라지면(로그아웃 · 401 · 403) 받아 둔 도움말 본문과 직전 검색어를 메모리에서 지운다
  useEffect(() => () => { window.clearTimeout(timer.current); clearGuideBodies(); clearLastQuery(); }, []);

  // 결과 조각 JS: 홈이 한가해지면 한 번(없으면 3초 뒤). 그 전에 누르면 그때 받는다
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) { const id = w.requestIdleCallback(preloadResults, { timeout: 6000 }); return () => w.cancelIdleCallback?.(id); }
    const t = window.setTimeout(preloadResults, 3000);
    return () => window.clearTimeout(t);
  }, []);

  // 「/」: 입력칸 · 글 상자 · 고치는 글에 있거나, ⌘ · Ctrl · Alt 와 같이 눌렀거나, 한글 조합 중이거나, 다른 창(시트 · 확인 창 · 사진 크게 보기)이 떠 있으면 무시
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.defaultPrevented) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      show();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show]);

  return (
    <>
      <IconButton buttonRef={btn} label="검색" icon="search" variant="band" aria-haspopup="dialog" aria-expanded={open} onClick={show}
        onPointerEnter={warm} onFocus={warm} onPointerDown={warm} onTouchStart={warm} />
      {/* body 에 포털로: 머리 띠의 색 변수(띠 위 포커스 고리 = 검정)를 물려받지 않게 */}
      {open && createPortal(<SearchFrame onClose={close} />, document.body)}
    </>
  );
}
