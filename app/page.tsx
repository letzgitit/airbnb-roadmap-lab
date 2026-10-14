import App from '@/components/App';
import { loadContent } from '@/lib/content';

// 공개 화면은 정적 생성(SSG). 「우리 현황」은 여기에 들어가지 않고 로그인 뒤 /api/progress 로만 읽는다.
export default function Page() {
  return <App content={loadContent()} />;
}
