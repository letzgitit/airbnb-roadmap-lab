'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StepSection } from '@/lib/client/step-sections';

// 한 번에 하나만 열리는 시트(단계 · 최근 바뀐 규정 · 집 정보·기록 · 멘트함)와 주소 해시를 맞춘다.
//   #step-3 · #notice · #records(로그인 때만) · #scripts
// - UI 로 열면 항목을 쌓는다(pushState) → 폰의 뒤로 가기가 시트를 닫는다.
// - UI 로 닫을 때 그 항목을 우리가 쌓았으면 뒤로 가기 한 번, 아니면 해시만 지운다(replaceState).
// - 뒤로 가기·앞으로 가기·주소 직접 수정(popstate/hashchange)도 같은 시트 상태로 이어진다.
// - 탭·아코디언 상태는 해시에 넣지 않는다.

export type SheetState =
  | { kind: 'step'; index: number; section: StepSection | null }
  | { kind: 'notice'; initialIndex: number | null }
  | { kind: 'records' }
  | { kind: 'scripts' };
export type SheetKind = SheetState['kind'];
type Want = { kind: 'step'; id: number } | { kind: 'notice' | 'records' | 'scripts' } | null;
type ProgressStatus = 'loading' | 'anon' | 'forbidden' | 'ready';

const SIMPLE_KINDS = ['notice', 'records', 'scripts'] as const;

function parseHash(raw: string): Want {
  const h = raw.replace(/^#/, '');
  const m = /^step-(\d{1,3})$/.exec(h);
  if (m) return { kind: 'step', id: Number(m[1]) };
  const k = SIMPLE_KINDS.find((x) => x === h);
  return k ? { kind: k } : null;
}

const SHEET_MARK = () => ({ sheet: 1 });
const ownEntry = () => !!(window.history.state && window.history.state.sheet);
const bareUrl = () => `${window.location.pathname}${window.location.search}`;

export function useSheetRouter({ stepIds, loggedIn, status, guard }: {
  stepIds: number[];
  loggedIn: boolean;
  status: ProgressStatus;
  /** 시트를 떠나기 전 확인(저장 안 한 편집). false 면 머문다. */
  guard: (kind: SheetKind) => Promise<boolean>;
}) {
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [shown, setShown] = useState(false);
  const live = useRef<SheetState | null>(null);      // 논리적으로 열려 있는 시트(닫는 애니메이션 중이면 null)
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backing = useRef(false);                     // 우리가 history.back() 을 불렀고 popstate 를 기다리는 중
  const asking = useRef(false);                      // 「저장 안 한 내용」 확인 창 응답을 기다리는 중
  const wantRecords = useRef(false);                 // #records 로 들어왔고 로그인 여부를 기다리는 중
  const latest = useRef({ stepIds, loggedIn, status, guard });
  useEffect(() => { latest.current = { stepIds, loggedIn, status, guard }; });

  const show = useCallback((s: SheetState) => {
    if (animTimer.current) clearTimeout(animTimer.current);
    live.current = s;
    setSheet(s);
    animTimer.current = setTimeout(() => setShown(true), 10);
  }, []);
  const hide = useCallback(() => {
    live.current = null;
    setShown(false);
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => setSheet(null), 300);
  }, []);

  const hashFor = useCallback((s: SheetState) => (s.kind === 'step' ? `#step-${latest.current.stepIds[s.index]}` : `#${s.kind}`), []);
  const stateFor = useCallback((w: NonNullable<Want>): SheetState | null => {
    if (w.kind === 'step') {
      const index = latest.current.stepIds.indexOf(w.id);
      return index >= 0 ? { kind: 'step', index, section: null } : null;
    }
    return w.kind === 'notice' ? { kind: 'notice', initialIndex: null } : { kind: w.kind };
  }, []);
  const clearHash = useCallback(() => {
    if (window.location.hash) window.history.replaceState(null, '', bareUrl());
  }, []);

  // 주소로 들어온 시트(공유 링크·새로고침)는 앞 항목이 이 사이트가 아닐 수 있다.
  // 그 항목을 홈으로 바꾸고 시트 항목을 한 칸 쌓아, 뒤로 가기·✕ 가 사이트 밖으로 나가지 않게 한다.
  // (Next 가 history 를 덧씌운 뒤에 써야 해서 한 틱 미룬다)
  const settleDeepLink = useCallback(() => {
    window.setTimeout(() => {
      if (ownEntry() || !window.location.hash) return;
      const hash = window.location.hash;
      window.history.replaceState(null, '', bareUrl());
      window.history.pushState(SHEET_MARK(), '', hash);
    }, 0);
  }, []);

  // ── UI 에서 열기 ──
  const open = useCallback((s: SheetState) => {
    if (live.current) return;                         // 한 번에 하나
    if (s.kind === 'records' && !latest.current.loggedIn) return;
    window.history.pushState(SHEET_MARK(), '', hashFor(s));
    show(s);
  }, [hashFor, show]);

  // ── UI 에서 닫기(✕ · 바깥 · Esc — 저장 안 한 편집 확인은 이미 끝난 뒤) ──
  const close = useCallback(() => {
    if (!live.current) return;
    if (ownEntry()) {
      backing.current = true;
      window.history.back();
      window.setTimeout(() => {                       // popstate 가 안 오면 직접 닫는다
        if (!backing.current) return;
        backing.current = false;
        clearHash();
        hide();
      }, 600);
    } else {
      clearHash();
      hide();
    }
  }, [clearHash, hide]);

  // ── 단계 이전/다음: 같은 항목의 해시만 바꾼다(쌓지 않는다) ──
  const goStep = useCallback((index: number) => {
    const cur = live.current;
    if (!cur || cur.kind !== 'step') return;
    const next: SheetState = { kind: 'step', index, section: null };
    window.history.replaceState(ownEntry() ? SHEET_MARK() : null, '', hashFor(next));
    live.current = next;
    setSheet(next);
  }, [hashFor]);

  // ── 뒤로 가기 · 앞으로 가기 · 주소 직접 수정 ──
  useEffect(() => {
    const onNav = async () => {
      if (asking.current) return;
      const cur = live.current;
      if (backing.current) {                          // 우리가 시작한 닫기(확인은 이미 끝남)
        backing.current = false;
        if (cur) hide();
        return;
      }
      const want = parseHash(window.location.hash);
      const next = want ? stateFor(want) : null;
      if (cur && next && next.kind === cur.kind && (next.kind !== 'step' || (cur.kind === 'step' && next.index === cur.index))) return;
      if (cur) {
        asking.current = true;
        let ok = false;
        try { ok = await latest.current.guard(cur.kind); } finally { asking.current = false; }
        if (live.current !== cur) return;             // 기다리는 사이 이미 바뀌었다
        if (!ok) {                                    // 머물기: 지워진 해시를 되돌려 시트를 유지한다
          window.history.pushState(SHEET_MARK(), '', hashFor(cur));
          return;
        }
        hide();
      }
      if (!want) return;
      if (!next) { clearHash(); return; }
      if (next.kind === 'records' && !latest.current.loggedIn) {
        if (latest.current.status === 'loading') wantRecords.current = true; else clearHash();
        return;
      }
      show(next);
    };
    const handler = () => { void onNav(); };
    window.addEventListener('popstate', handler);
    window.addEventListener('hashchange', handler);
    return () => {
      window.removeEventListener('popstate', handler);
      window.removeEventListener('hashchange', handler);
    };
  }, [clearHash, hashFor, hide, show, stateFor]);

  // ── 처음 불러올 때 주소의 해시가 유효하면 그 시트를 연다 ──
  useEffect(() => {
    const want = parseHash(window.location.hash);
    if (!want) return;
    if (want.kind === 'records') { wantRecords.current = true; return; }
    const next = stateFor(want);
    if (!next) { clearHash(); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    show(next);
    settleDeepLink();
  }, [clearHash, settleDeepLink, show, stateFor]);

  // ── #records 는 로그인을 확인한 뒤에만 열고, 로그인이 아니면 해시를 지운다 ──
  useEffect(() => {
    if (!wantRecords.current) return;
    if (loggedIn) {
      wantRecords.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      show({ kind: 'records' });
      settleDeepLink();
    } else if (status === 'anon' || status === 'forbidden') {
      wantRecords.current = false;
      clearHash();
    }
  }, [loggedIn, status, show, settleDeepLink, clearHash]);

  // ── 로그아웃·세션 만료로 현황이 사라지면 집 정보·기록 시트도 닫는다 ──
  useEffect(() => {
    if (!loggedIn && live.current?.kind === 'records') {
      clearHash();
      hide();
    }
  }, [loggedIn, clearHash, hide]);

  return { sheet, shown, open, close, goStep };
}
