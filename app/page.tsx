import App from '@/components/App';
import { loadContent } from '@/lib/content';

// 공개 화면은 정적 생성(SSG). 「우리 현황」은 여기에 들어가지 않고 로그인 뒤 /api/progress 로만 읽는다.
// 구글 로그인 키(AUTH_GOOGLE_ID·SECRET)가 아직 없으면 로그인 버튼 대신 「로그인 준비 중」을 보인다.
// 빌드 때 정해지므로 Vercel 에 키를 넣은 뒤 다시 배포하면 버튼이 켜진다(env 변경은 어차피 재배포해야 반영됨).
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

export default function Page() {
  const loginReady = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <App content={loadContent()} loginReady={loginReady} />
    </>
  );
}
