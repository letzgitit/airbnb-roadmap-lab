'use client';

import type { ReactNode } from 'react';
import { Card, cardRowCls } from '@/components/ui/Card';
import { Meta } from '@/components/ui/Meta';

// 홈 「단계」 구역의 바로 가기 두 줄: 주의사항(#notice) · 대화 예시(#scripts). 빨강은 주의사항 아이콘에만.
export function GuideLinks({ ruleCount, warnCount, scriptCount, onNotice, onScripts }: {
  ruleCount: number; warnCount: number; scriptCount: number; onNotice: () => void; onScripts: () => void;
}) {
  const hasNotice = ruleCount + warnCount > 0;
  if (!hasNotice && scriptCount === 0) return null;
  return (
    <Card as="ul" aria-label="안내 바로 가기">
      {hasNotice && (
        <Row icon="fa-triangle-exclamation text-danger-ink" title="주의사항" sub={<Meta><span>바뀐 규정 {ruleCount}</span><span>단계별 주의사항 {warnCount}</span></Meta>} onClick={onNotice} />
      )}
      {scriptCount > 0 && (
        <Row icon="fa-comment-dots text-muted" title="대화 예시" sub={`${scriptCount}가지 상황`} onClick={onScripts} />
      )}
    </Card>
  );
}

function Row({ icon, title, sub, onClick }: { icon: string; title: string; sub: ReactNode; onClick: () => void }) {
  return (
    <li className={cardRowCls}>
      <button type="button" onClick={onClick} className="flex min-h-11 w-full items-center pr-4 text-left transition-colors hover:bg-sunken active:bg-sunken">
        <span className="flex size-11 shrink-0 items-center justify-center"><i className={`fas ${icon} text-base`} aria-hidden /></span>
        <span className="min-w-0 flex-1 py-3">
          <span className="block text-base font-semibold text-ink">{title}</span>
          <span className="block text-sm font-normal text-muted">{sub}</span>
        </span>
        <i className="fas fa-chevron-right shrink-0 text-xs text-muted" aria-hidden />
      </button>
    </li>
  );
}
