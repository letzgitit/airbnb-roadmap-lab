import type { ReactNode } from 'react';

// 상태 · 개수만 담는 작은 알약(시안 B: 동그란 끝 · 14px 600 · 옅은 면 + 진한 글자). 꾸밈용으로 쓰지 않는다(날짜 · 단계 번호 · 지역은 그냥 글자).
// 보통 = 회색 면, 경고(danger) = 기한 지남, 주의(warn) = 곧 마감, 안내(info) = 문의 필요, 강조(accent) = 새 답 같은 「새 것」.
export const BADGE_TONE = {
  neutral: 'bg-strong text-ink-soft',
  accent: 'bg-accent-soft text-ink',
  danger: 'bg-danger-soft text-danger-ink',
  warn: 'bg-warn-soft text-warn-ink',
  info: 'bg-info-soft text-info-ink',
} as const;
export type BadgeTone = keyof typeof BADGE_TONE;
/** 배지 틀(크기 · 모양). 색은 BADGE_TONE */
export const badgeCls = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums';

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={`${badgeCls} ${BADGE_TONE[tone]} ${className}`}>{children}</span>;
}
