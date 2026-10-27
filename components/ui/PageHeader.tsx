import type { ReactNode } from 'react';

// 홈을 뺀 모든 페이지 맨 위: 제목(28/700, 시안 B의 오늘 날짜 큰 제목과 같은 단계) + 있으면 설명 한 줄. 하위 탭(SubNav)이 있으면 바로 아래 붙인다.
export function PageHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 mt-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-display font-bold tracking-[-0.015em] text-ink">{title}</h1>
        {description && <p className="mt-1 text-base font-medium text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
