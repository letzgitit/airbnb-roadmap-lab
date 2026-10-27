import type { Metadata } from 'next';
import App from '@/components/App';
import { loadContent } from '@/lib/content';
import { loadAutoRefs, loadBlock, withRefs } from '@/lib/refs';

// 예전 홈(준비 일정 — 요약 · 단계 간트 · 달력, 단계 · 주의사항 · 대화 예시 시트). 새 홈(/) 맨 아래 「예전 화면」으로만 들어온다.
// 홈과 같은 내용이라 검색엔진에는 홈(/)만 알린다.
export const metadata: Metadata = {
  title: '예전 화면',
  robots: { index: false, follow: false },
  alternates: { canonical: '/' },
};

export const revalidate = 21600;

export default async function ClassicPage() {
  const content = loadContent();
  const steps = withRefs(content.steps, await loadAutoRefs(), loadBlock());
  return <App content={{ ...content, steps }} />;
}
