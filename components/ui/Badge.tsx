import type { ReactNode } from 'react';

// 상태 · 개수만 담는 꼬리표(데일리 .chip: 높이 22 · 모서리 6 · 13px 600). 꾸밈용으로 쓰지 않는다(날짜 · 단계 번호 · 지역은 그냥 글자).
// 보통 = 옅은 회색 면, 위험(danger) = 기한 지남(빨강 글자 · 빨강 테두리), 주의(warn) = 곧 마감(검정 글자 · 검정 테두리 — 데일리 켜진 꼬리표 꼴),
// 안내(info) = 문의 필요(파랑 글자 · 파랑 테두리), 강조(accent) = 새 답 같은 「새 것」(형광 바탕 · 검정 글자 — 누르지 않는 표시).
// 알약 모양 · 꽉 찬 빨강/검정 면은 쓰지 않는다(누르는 단추와 헷갈린다).
export const BADGE_TONE = {
  neutral: 'bg-sunken text-ink-soft',
  accent: 'bg-marker text-on-marker',
  danger: 'border border-danger-ink text-danger-ink',
  warn: 'border border-ink text-ink',
  info: 'border border-info-ink text-info-ink',
} as const;
export type BadgeTone = keyof typeof BADGE_TONE;
/** 꼬리표 틀(크기 · 모양). 색은 BADGE_TONE */
export const badgeCls = 'inline-flex h-5.5 items-center gap-1 whitespace-nowrap rounded-chip px-1.5 text-meta font-semibold leading-none tabular-nums';

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={`${badgeCls} ${BADGE_TONE[tone]} ${className}`}>{children}</span>;
}
