'use client';

import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubNav } from '@/components/ui/SubNav';

// 시안 페이지 틀(메뉴 「시안」, 2026-10-28 전 이름 「꾸미기 참고」): 제목 → 하위 탭(3D · 사진 · 참고 — /decor 는 첫 탭 /decor/3d 로 넘긴다, next.config.ts) → 각 화면.
// 로그인 안 한 방문자도 본다(2026-10-26 사이트 주인 결정). 무엇을 보일지는 각 화면의 API 가 서버에서 거른다(참고는 공개로 고른 항목만).
const ITEMS = [
  { href: '/decor/3d', label: '3D' },
  { href: '/decor/photos', label: '사진' },
  { href: '/decor/refs', label: '참고' },
];

export function DecorFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="시안" />
      <SubNav label="시안" items={ITEMS} />
      {children}
    </>
  );
}
