'use client';

import type { Content } from '@/lib/core/types';
import App from '@/components/App';
import { useProgress } from '@/components/progress/ProgressProvider';
import { SimpleHome } from './SimpleHome';

/**
 * 홈(/): 로그인한 두 사람 = 새 홈(탭 다섯 개), 로그인 전 · 허용 밖 = 예전 공개 안내(준비 일정 · 주의사항 · 대화 예시) 그대로.
 * 현황을 확인하는 동안은 새 홈 모양의 반짝이는 칸(로그인한 사람에게 예전 화면이 잠깐 비치지 않게).
 * 예전 홈 전체(로그인 화면 포함)는 /classic.
 */
export function HomeSwitch({ content }: { content: Content }) {
  const { status, doc } = useProgress();
  if (status === 'ready' && doc) return <SimpleHome />;
  if (status === 'anon' || status === 'forbidden') return <App content={content} />;
  return (
    <div role="status" aria-label="불러오는 중" className="flex flex-col gap-4">
      <span className="skeleton h-12 rounded-control" />
      {Array.from({ length: 4 }, (_, i) => <span key={i} className="skeleton h-24 rounded-panel" />)}
    </div>
  );
}
