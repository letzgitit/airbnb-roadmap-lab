import type { Metadata } from 'next';
import { QuestionsApp } from '@/components/questions/QuestionsApp';

// 우리 집 › 질문(옛 /questions). 질문 · 답 · 답 받는 링크는 로그인 뒤 /api/progress 로만 받는다.
export const metadata: Metadata = {
  title: '질문',
  robots: { index: false, follow: false },
  alternates: { canonical: '/house/questions' },
};

export default function HouseQuestionsPage() {
  return <QuestionsApp />;
}
