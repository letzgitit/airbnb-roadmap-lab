import App from '@/components/App';
import { loadContent } from '@/lib/content';
import { loadAutoRefs, loadBlock, withRefs } from '@/lib/refs';

// 공개 화면은 정적 생성 + 6시간마다 다시 만드는 ISR(재배포 없이 자동 참고 자료가 갱신된다).
// 「우리 현황」은 여기에 들어가지 않고 로그인 뒤 /api/progress 로만 읽는다.
// revalidate 는 숫자 리터럴이어야 한다(21600초 = 6시간). 자동 자료를 못 받으면 고정 항목만 보인다.
// 로그인 단추 · 「로그인 준비 중」은 사이트 틀(app/(site)/layout.tsx → 머리글)이 정한다.
// 검색엔진용 구조화 데이터(JSON-LD) — 사이트 하나만 알린다.
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://jumoney-oedomin.vercel.app').replace(/\/$/, '');
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '외도민 타임 라인',
  description: '외국인 도시민박업 실전 창업을 위한 A to Z 로드맵 & 꿀팁 가이드',
  url: siteUrl + '/',
  inLanguage: 'ko',
};

export const revalidate = 21600;

export default async function Page() {
  const content = loadContent();
  const steps = withRefs(content.steps, await loadAutoRefs(), loadBlock());
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <App content={{ ...content, steps }} />
    </>
  );
}
