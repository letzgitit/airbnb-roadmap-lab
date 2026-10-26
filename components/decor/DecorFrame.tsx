'use client';

import type { ReactNode } from 'react';
import { LoginGate } from '@/components/ui/LoginGate';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubNav } from '@/components/ui/SubNav';

// 꾸미기 페이지 틀: 로그인 확인 → 제목 → 하위 탭(참고 모음 · 3D 시안 · 사진 시안) → 각 화면.
const ITEMS = [
  { href: '/decor', label: '참고 모음', exact: true },
  { href: '/decor/3d', label: '3D 시안' },
  { href: '/decor/photos', label: '사진 시안' },
];

export function DecorFrame({ children }: { children: ReactNode }) {
  return (
    <LoginGate>
      <PageHeader title="꾸미기" />
      <SubNav label="꾸미기" items={ITEMS} />
      {children}
    </LoginGate>
  );
}
