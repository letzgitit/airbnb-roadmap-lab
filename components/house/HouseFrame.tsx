'use client';

import type { ReactNode } from 'react';
import { useProgress } from '@/components/progress/ProgressProvider';
import { hasNewAnswer } from '@/components/shell/nav';
import { LoginGate } from '@/components/ui/LoginGate';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubNav } from '@/components/ui/SubNav';

// 「우리 집」 페이지 틀: 로그인 확인 → 제목 → 하위 탭(집 정보 · 기록 · 사진 · 질문) → 그 화면.
// 「질문」 탭에는 새 답이 있으면 강조색 점(아래 탭 「우리 집」 점과 같은 기준).
export function HouseFrame({ children }: { children: ReactNode }) {
  return (
    <LoginGate>
      <Inner>{children}</Inner>
    </LoginGate>
  );
}

function Inner({ children }: { children: ReactNode }) {
  const { doc } = useProgress();
  return (
    <>
      <PageHeader title="우리 집" />
      <SubNav label="우리 집" items={[
        { href: '/house', label: '집 정보', exact: true },
        { href: '/house/log', label: '기록' },
        { href: '/house/photos', label: '사진' },
        { href: '/house/questions', label: '질문', dot: hasNewAnswer(doc) },
      ]} />
      {children}
    </>
  );
}
