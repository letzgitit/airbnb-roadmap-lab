import type { Metadata } from 'next';
import { LoginGate } from '@/components/ui/LoginGate';
import { MoneyApp } from '@/components/money/MoneyApp';

// 「자금 계획」(메뉴 「자금」, 옛 「돈 · 다른 집」 · /plan). 이 페이지 자체는 빈 틀이고, 돈 흐름 · 지산 · 원주 일정은 로그인 뒤 /api/plan 으로만 받는다.
export const metadata: Metadata = {
  title: '자금 계획',
  robots: { index: false, follow: false },
  alternates: { canonical: '/money' },
};

export default function MoneyPage() {
  return (
    <LoginGate>
      <MoneyApp />
    </LoginGate>
  );
}
