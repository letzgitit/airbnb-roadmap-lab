import type { ReactNode } from 'react';

// 보조 줄(날짜 · 개수 · 누가 같은 작은 정보 여러 개): 항목 사이에 「 · 」 글자를 넣지 않고 span 마다 12px 간격으로 나눈다(DESIGN.md 8.1).
// 날짜 항목은 부르는 쪽에서 text-ink-soft 를 주고, 나머지는 바탕 색(muted)을 그대로 쓴다. null · false 항목은 그리지 않는다.
export function Meta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 ${className}`}>{children}</span>;
}
