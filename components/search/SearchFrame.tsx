'use client';

import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

// 결과 부분(찾기 계산 · 결과 화면 · es-hangul)은 따로 받는 조각 — 홈 첫 로딩에 싣지 않는다. 같은 import() 를 미리 불러 두면 같은 조각을 받아 둔다.
// next/dynamic 대신 React lazy: next/dynamic 은 불러오기 장치(약 2KB gzip)를 홈 첫 로딩에 더 싣는다. 이 창은 누른 뒤에만 그려 서버 그리기가 없으니 lazy 로 충분하다
const loadResults = () => import('./SearchResults');
const SearchResults = lazy(() => loadResults().then((m) => ({ default: m.SearchResults })));
export const preloadResults = () => { void loadResults(); };

// 다시 열면 직전 검색어를 채워 둔다(이 탭 동안만, 메모리 — 주소 · 방문 기록 · 기기 저장소에 남기지 않는다). 로그인이 끊기면 비운다
let lastQuery = '';
export const clearLastQuery = () => { lastQuery = ''; };

/**
 * 검색 창(데일리 .search — 화면 전체를 덮는 흰 면, 각짐): 위 줄 = 입력칸 + 「닫기」, 아래 = 결과(따로 받는 조각, 오기 전엔 빈 자리).
 * 덮는 면 · 입력칸 · 닫기는 첫 로딩 묶음에 있어 누름과 같은 렌더에서 그려진다(입력칸 autoFocus — 아이폰 키보드).
 * 부르는 쪽(SearchButton)이 body 에 포털로 그린다 — 머리 띠 안에 두면 띠가 덮어쓴 색 변수(포커스 고리 · 밑줄을 검정으로)를 물려받아 어두운 화면에서 안 보인다.
 * 열린 동안 뒤 화면은 스크롤 잠금, Tab 은 창 안에서만 돈다. Esc = 닫기, Enter = 키보드 내리기(결과 그대로), ↓ = 첫 결과로.
 */
export function SearchFrame({ onClose }: { onClose: (then?: () => void) => void }) {
  const [q, setQ] = useState(lastQuery);
  // 결과 부분은 한 박자 뒤에(처음 그리기는 덮는 면 · 입력칸만 — 포커스 · 키보드가 찾을 항목 만들기를 기다리지 않게). 결과 조각을 미리 받아 둔 경우에도 같다
  const showResults = useDeferredValue(true, false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // 빈 검색어 화면의 「많이 나온 말」을 누르면 그 말로 찾는다(입력칸에도 채운다)
  const pickWord = useCallback((w: string) => { lastQuery = w; setQ(w); }, []);
  useLayoutEffect(() => {
    const el = input.current;
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    performance.mark?.('search:focused');
  }, []);
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = prev; };
  }, []);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // 한글 조합 중의 Esc · 화살표는 입력기 몫(조합을 끝내거나 고르는 키) — 창을 닫거나 결과로 옮기지 않는다
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    const rows = () => [...(box.current?.querySelectorAll<HTMLElement>('[data-search-row]') ?? [])];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = rows();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const onInput = document.activeElement === input.current;
      if (!onInput && at < 0) return;
      e.preventDefault();
      if (e.key === 'ArrowDown') list[onInput ? 0 : Math.min(at + 1, list.length - 1)]?.focus();
      else if (at <= 0) input.current?.focus(); else list[at - 1]?.focus();
      return;
    }
    if (e.key !== 'Tab' || !box.current) return;
    // 포커스 가두기: 창 안의 첫 · 마지막 누를 것 사이에서만 돈다
    const all = [...box.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')].filter((el) => el.getClientRects().length > 0);
    if (!all.length) return;
    const first = all[0], last = all[all.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div ref={box} role="dialog" aria-modal="true" aria-label="검색" onKeyDown={onKey}
      className="search fixed inset-0 z-[60] flex flex-col bg-surface pt-[env(safe-area-inset-top)] text-ink-soft">
      <form role="search" onSubmit={(e) => { e.preventDefault(); input.current?.blur(); }}
        className="flex w-full items-center gap-1 border-b border-line py-1.5 pl-[max(20px,env(safe-area-inset-left))] pr-[max(6px,env(safe-area-inset-right))] md:mx-auto md:max-w-content md:border-b-0 md:pt-6">
        <input ref={input} type="search" value={q} maxLength={100} autoFocus autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search"
          aria-label="검색어" placeholder="찾을 말을 적어 보세요"
          onChange={(e) => { performance.mark?.('search:key'); lastQuery = e.target.value; setQ(e.target.value); }}
          className="h-11 min-w-0 flex-1 appearance-none rounded-control border border-line-strong bg-surface px-3.5 text-lg font-medium text-ink placeholder:font-normal placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden" />
        <button type="button" onClick={() => onClose()}
          className="inline-flex min-h-11 shrink-0 items-center rounded-control px-3 text-cta font-bold text-ink transition-colors hover:bg-sunken">닫기</button>
      </form>
      <div className="flex-1 overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+32px)]">
        <div className="md:mx-auto md:max-w-content">
          {showResults && <Suspense fallback={null}><SearchResults query={q} onClose={onClose} onQuery={pickWord} /></Suspense>}
        </div>
      </div>
    </div>
  );
}
