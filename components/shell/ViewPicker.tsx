'use client';

import { usePathname } from 'next/navigation';
import { setViewMode, VIEW_HREF, type ViewMode } from '@/lib/client/view-mode';
import { useGuardedNav } from './useGuardedNav';

/** 지금 화면이 어느 보기인가(주소로 정한다 — /classic = 자세히) */
export const viewOfPath = (path: string): ViewMode => (path === '/classic' ? 'detail' : 'simple');

/**
 * 시안 문 왼쪽에 배치되는 「상세」 토글 스위치 버튼.
 * 켜면 상세 보기(/classic), 끄면 간단히 보기(/)로 전환하고 기기에 기억한다.
 */
export function ViewToggle({ className = '' }: { className?: string }) {
  const path = usePathname() ?? '/';
  const now = viewOfPath(path);
  const go = useGuardedNav();
  const isDetail = now === 'detail';
  const toggle = () => {
    const target = isDetail ? 'simple' : 'detail';
    void go(VIEW_HREF[target]).then((moved) => { if (moved) setViewMode(target); });
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDetail}
      aria-label={`상세 보기 ${isDetail ? '켜짐' : '꺼짐'}, 누르면 ${isDetail ? '간단히' : '상세'} 보기로 전환`}
      onClick={toggle}
      className={`group flex items-center gap-1.5 self-center rounded-control px-1.5 py-1 transition-colors hover:bg-black/10 ${className}`}
      title={isDetail ? '간단히 보기로 전환' : '상세 보기로 전환'}
    >
      <span className="text-xs font-bold text-on-marker">상세</span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out ${
          isDetail ? 'bg-black' : 'bg-black/25 group-hover:bg-black/35'
        }`}
      >
        <span
          className={`pointer-events-none inline-block size-3.5 transform rounded-full shadow transition duration-200 ease-in-out ${
            isDetail ? 'translate-x-4 bg-[#edfc47]' : 'translate-x-1 bg-white'
          }`}
        />
      </span>
    </button>
  );
}

/** @deprecated 머리 띠의 ViewToggle 로 교체됨 */
export function ViewPicker({ className = '' }: { className?: string }) {
  return <ViewToggle className={className} />;
}

/** @deprecated */
export function SignedInViewPicker() {
  return null;
}
