import type { ReactNode } from 'react';

// 홈을 뺀 모든 페이지 맨 위: 제목(text-2xl 700) + 있으면 설명 한 줄. 하위 탭(SubNav)이 있으면 바로 아래 붙인다.
export function PageHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm font-normal text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
