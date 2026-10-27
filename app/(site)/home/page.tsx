import type { Metadata } from 'next';
import { HomeSwitch } from '@/components/simple-home/HomeSwitch';
import { loadContent } from '@/lib/content';
import { loadAutoRefs, loadBlock, withRefs } from '@/lib/refs';

// 로그인한 사람의 홈 틀. 주소창은 「/」 그대로이고 proxy.ts 가 로그인 쿠키를 보고 여기로 바꿔 그린다.
// 처음 HTML 부터 새 홈 모양(탭 + 반짝이는 칸)이라 예전 화면 · 빈 칸이 비치지 않는다. 개인 내용은 여전히 로그인 뒤 /api/progress 로만.
// 쿠키가 낡아 로그인이 안 되면 같은 자리에 공개 안내를 그린다(그래서 공개 콘텐츠도 같이 싣는다).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: { canonical: '/' },
};

export const revalidate = 21600;

export default async function SignedInHome() {
  const content = loadContent();
  const steps = withRefs(content.steps, await loadAutoRefs(), loadBlock());
  return <HomeSwitch content={{ ...content, steps }} signedIn />;
}
