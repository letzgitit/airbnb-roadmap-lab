import type { ReactNode } from 'react';

// 페이지 안 구역 제목: 제목(text-lg 700, 안에 구역을 다시 품는 큰 구역은 size="xl" — 20px 700, 예: 홈 「준비 일정」) + 요약 한 줄(text-sm 400 muted — 빨강 글자를 섞을 수 있게 ReactNode). 오른쪽에 작은 동작 하나까지.
export function SectionHeader({ title, summary, action, id, as: H = 'h2', size = 'lg' }: {
  title: ReactNode; summary?: ReactNode; action?: ReactNode; id?: string; as?: 'h2' | 'h3'; size?: 'lg' | 'xl';
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <H id={id} className={`scroll-mt-20 ${size === 'xl' ? 'text-xl' : 'text-lg'} font-bold text-ink`}>{title}</H>
        {summary && <p className="mt-0.5 text-sm font-normal text-muted">{summary}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
