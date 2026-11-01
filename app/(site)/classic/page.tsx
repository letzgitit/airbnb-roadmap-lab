import type { Metadata } from 'next';
import App from '@/components/App';
import { loadContent } from '@/lib/content';
import { loadAutoRefs, loadBlock, withRefs } from '@/lib/refs';

// 「자세히 보기」(예전 홈 — 준비 일정: 요약 · 단계 간트 · 달력, 단계 · 주의사항 · 대화 예시 시트).
// 머리 띠(노란 띠) 안의 「간단히 보기 | 자세히 보기」 고르개로 들어온다(고른 값은 기기에 기억).
// 홈과 같은 내용이라 검색엔진에는 홈(/)만 알린다.
export const metadata: Metadata = {
  title: '자세히 보기',
  robots: { index: false, follow: false },
  alternates: { canonical: '/' },
};

export const revalidate = 21600;

export default async function ClassicPage() {
  const content = loadContent();
  const steps = withRefs(content.steps, await loadAutoRefs(), loadBlock());
  return <App content={{ ...content, steps }} />;
}
