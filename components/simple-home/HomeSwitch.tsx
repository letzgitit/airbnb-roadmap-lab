'use client';

import type { Content } from '@/lib/core/types';
import App from '@/components/App';
import { useProgress } from '@/components/progress/ProgressProvider';
import { TABS } from './home-model';
import { HomeTabBar, SimpleHome } from './SimpleHome';

/**
 * 홈: 로그인한 두 사람 = 새 홈(탭 다섯 개), 로그인 전 · 허용 밖 = 예전 공개 안내(준비 일정 · 주의사항 · 대화 예시) 그대로.
 * 현황을 확인하는 동안: signedIn(proxy.ts 가 로그인 쿠키를 보고 /home 으로 보낸 경우) = 새 홈 모양의 반짝이는 칸,
 * 아니면(/ 그대로) = 공개 안내 HTML(서버에서 그려 검색 노출이 남는다). 예전 홈 전체(로그인 화면 포함)는 /classic.
 */
export function HomeSwitch({ content, signedIn = false }: { content: Content; signedIn?: boolean }) {
  const { status, doc } = useProgress();
  if (status === 'ready' && doc) return <SimpleHome content={content} />;
  if (status === 'loading' && signedIn) return <SimpleHomeSkeleton />;
  return <App content={content} />;
}

/** 새 홈 틀: 탭 줄 + 카드 자리(불러오는 동안). 탭 아이콘 · 이름은 실제와 같고 아직 누를 수 없다 */
function SimpleHomeSkeleton() {
  return (
    <div role="status" aria-label="불러오는 중">
      <div className="-mx-6 -mt-4 mb-2 bg-page">
        <HomeTabBar tab={TABS[0].id} />
      </div>
      <div className="flex flex-col gap-7 pt-5">
        <span className="skeleton h-16 w-48 rounded-control" />
        {Array.from({ length: 4 }, (_, i) => <span key={i} className="skeleton h-32 rounded-panel" />)}
      </div>
    </div>
  );
}
