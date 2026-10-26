'use client';

import { useProgress } from '@/components/progress/ProgressProvider';
import { LogCard } from '@/components/progress/LogCard';
import { TrashCard } from '@/components/progress/TrashCard';
import { displayName, relTime } from '@/lib/client/format';

// 우리 집 › 기록: 맨 위 「마지막으로 고친 사람 / 누가 / 언제」(점 없이 12px 간격) + 무엇을 고쳤는지 한 줄 → 기록 목록 → 삭제한 기록.
export function LogPage() {
  const { doc } = useProgress();
  const la = doc?.lastAction;
  return (
    <>
      <div className="mb-3" aria-live="polite">
        {la ? (
          <>
            <p className="flex flex-wrap gap-x-3 text-sm text-muted">
              <span>마지막으로 고친 사람</span><span>{displayName(la.by)}</span><span className="text-ink-soft">{relTime(la.at)}</span>
            </p>
            <p className="truncate text-sm text-muted">{la.text}</p>
          </>
        ) : <p className="text-sm text-muted">아직 아무도 고치지 않았어요.</p>}
      </div>
      <LogCard />
      <TrashCard kinds={['log']} />
    </>
  );
}
