'use client';

import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubNav } from '@/components/ui/SubNav';

// 꾸미기 페이지 틀: 제목 → 하위 탭(3D 시안 · 사진 시안 · 참고 모음 — /decor 는 첫 탭 /decor/3d 로 넘긴다, next.config.ts) → 각 화면.
// 로그인 안 한 방문자도 본다(2026-10-26 사이트 주인 결정). 무엇을 보일지는 각 화면의 API 가 서버에서 거른다(참고 모음은 공개로 고른 항목만).
const ITEMS = [
  { href: '/decor/3d', label: '3D 시안' },
  { href: '/decor/photos', label: '사진 시안' },
  { href: '/decor/refs', label: '참고 모음' },
];

export function DecorFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="꾸미기" />
      <SubNav label="꾸미기" items={ITEMS} />
      {children}
    </>
  );
}
