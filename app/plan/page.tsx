import type { Metadata } from 'next';
import { PlanApp } from '@/components/plan/PlanApp';

// 「11월~1월 한 장 일정」. 이 페이지 자체는 빈 껍데기이고, 일정 · 돈은 로그인 뒤 /api/plan 으로만 받는다.
export const metadata: Metadata = {
  title: '11월~1월 일정',
  robots: { index: false, follow: false },
  alternates: { canonical: '/plan' },
};

export default function PlanPage() {
  const loginReady = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
  return <PlanApp loginReady={loginReady} />;
}
