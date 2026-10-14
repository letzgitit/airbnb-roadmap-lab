import App from '@/components/App';
import { loadContent } from '@/lib/content';

// 공개 화면은 정적 생성(SSG). 「우리 현황」은 여기에 들어가지 않고 로그인 뒤 /api/progress 로만 읽는다.
// 구글 로그인 키(AUTH_GOOGLE_ID·SECRET)가 아직 없으면 로그인 버튼 대신 「로그인 준비 중」을 보인다.
// 빌드 때 정해지므로 Vercel 에 키를 넣은 뒤 다시 배포하면 버튼이 켜진다(env 변경은 어차피 재배포해야 반영됨).
export default function Page() {
  const loginReady = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
  return <App content={loadContent()} loginReady={loginReady} />;
}
