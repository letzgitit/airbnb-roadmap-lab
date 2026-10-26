'use client';

import { useCallback, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useProgress } from '@/components/progress/ProgressProvider';

/**
 * 저장 안 한 입력이 있으면 「저장 안 한 내용이 있어요」 확인 창을 거친 뒤 옮긴다(내비게이션 · 하위 탭 · #records 처리가 쓴다).
 * 돌려주는 값: 옮겼으면 true, 확인 창에서 「계속 편집」을 골랐으면 false.
 */
export function useGuardedNav() {
  const router = useRouter();
  const { hasDirty, confirmDiscard } = useProgress();
  return useCallback(async (href: string, opts?: { replace?: boolean }) => {
    if (hasDirty() && !(await confirmDiscard())) return false;
    if (opts?.replace) router.replace(href); else router.push(href);
    return true;
  }, [router, hasDirty, confirmDiscard]);
}

/**
 * <Link onClick> 용: 저장 안 한 입력이 없으면 Link 가 하던 대로 두고, 있으면 기본 이동을 막고 확인 창을 거친다.
 * ⌘ · Ctrl · Shift · Alt 를 누른 클릭과 가운데 단추(새 탭 · 새 창)는 막지 않는다.
 */
export function useGuardedLinkClick() {
  const go = useGuardedNav();
  const { hasDirty } = useProgress();
  return useCallback((href: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!hasDirty()) return;
    e.preventDefault();
    void go(href);
  }, [go, hasDirty]);
}
