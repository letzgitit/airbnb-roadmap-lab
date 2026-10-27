import type { ReactNode } from 'react';

// 상태 · 개수만 담는 작은 표시. 꾸밈용 알약으로 쓰지 않는다(날짜 · 단계 번호 · 지역은 그냥 글자).
// 보통 = 들어간 면, 강조 = 새 답 같은 「새 것」, 빨강 = 기한 지남 · 주의.
const TONE = {
  neutral: 'bg-sunken text-ink-soft',
  accent: 'bg-accent-soft text-accent-ink',
  danger: 'bg-danger-soft text-danger-ink',
} as const;

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-sm font-bold ${TONE[tone]}`}>{children}</span>;
}
