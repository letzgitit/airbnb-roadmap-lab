import type { Metadata } from 'next';
import { QuestionsApp } from '@/components/questions/QuestionsApp';

// 「질문」(로그인한 사람만). 이 페이지는 빈 껍데기이고, 질문 · 답 · 손님 링크는 로그인 뒤 /api/progress 로만 받는다.
export const metadata: Metadata = {
  title: '질문',
  robots: { index: false, follow: false },
  alternates: { canonical: '/questions' },
};

export default function QuestionsPage() {
  const loginReady = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
  return <QuestionsApp loginReady={loginReady} title="외도민 타임 라인" />;
}
