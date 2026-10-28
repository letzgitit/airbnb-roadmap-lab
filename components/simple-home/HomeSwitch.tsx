'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import type { Content } from '@/lib/core/types';
import App from '@/components/App';
import { useProgress } from '@/components/progress/ProgressProvider';
import { useViewMode, VIEW_HREF } from '@/lib/client/view-mode';
import { startTab } from './home-state';
import { HomeTabBar, SimpleHome } from './SimpleHome';

/**
 * 홈: 로그인한 두 사람 = 새 홈 「간단히 보기」, 로그인 전 · 허용 밖 = 예전 공개 안내(준비 일정 · 주의사항 · 대화 예시) 그대로.
 * 이 기기에서 「자세히 보기」를 골라 두었으면(설정 · 맨 아래 고르개) 로그인한 뒤 바로 예전 화면(/classic)으로 넘긴다.
 * 현황을 확인하는 동안: signedIn(proxy.ts 가 로그인 쿠키를 보고 /home 으로 보낸 경우) = 새 홈 모양의 반짝이는 칸,
 * 아니면(/ 그대로) = 공개 안내 HTML(서버에서 그려 검색 노출이 남는다). 예전 홈 전체(로그인 화면 포함)는 /classic.
 */
export function HomeSwitch({ content, signedIn = false }: { content: Content; signedIn?: boolean }) {
  const { status, doc } = useProgress();
  const view = useViewMode();
  const router = useRouter();
  const ready = status === 'ready' && !!doc;
  useEffect(() => { if (ready && view === 'detail') router.replace(VIEW_HREF.detail); }, [ready, view, router]);
  if (ready && view === 'detail') return null;
  if (ready) return <SimpleHome />;
  if (status === 'loading' && signedIn) return <SimpleHomeSkeleton />;
  return <App content={content} />;
}

const noSubscribe = () => () => undefined;
/**
 * 새 홈 틀: 분야 탭 줄 + 블록 자리(불러오는 동안). 탭 이름은 실제와 같고 아직 누를 수 없다.
 * 고른 탭은 새 홈과 같은 규칙(startTab — 이 탭에서 고른 탭, 새로 들어왔으면 달력)으로 표시한다. 서버에서 그릴 때와 하이드레이션 중에는
 * 고른 표시 없이(null) 그리고, 브라우저에서 곧바로 같은 탭을 표시한다 — 다른 탭(예전엔 늘 행정)이 잠깐 보였다 바뀌지 않게.
 */
function SimpleHomeSkeleton() {
  const tab = useSyncExternalStore(noSubscribe, startTab, () => null);
  return (
    // data-home-skeleton: 머리 띠가 이걸 보고 문 둘 · 「첫 손님까지」 자리를 미리 그린다. -mt-4 = 틀(main)의 위 여백을 지워 탭 줄을 다 불러온 화면과 같은 자리에
    <div role="status" aria-label="불러오는 중" data-home-skeleton className="-mx-5 -mt-4 md:mx-0">
      <HomeTabBar tab={tab} />
      <div className="flex flex-col gap-2 pt-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bg-surface px-5 py-4">
            <span className="skeleton block h-6 w-40 rounded-chip" />
            <span className="skeleton mt-4 block h-12 rounded-chip" />
            <span className="skeleton mt-3 block h-12 rounded-chip" />
          </div>
        ))}
      </div>
    </div>
  );
}
