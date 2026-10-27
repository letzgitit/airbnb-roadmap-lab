// 단계 종류(분류) 이름 · 색. 예전 공개 화면의 「n일째」 막대 목록은 2026-10-27 로그인 화면과 같은 날짜 화면(home/DateTimeline)으로 합쳤다.
import type { TimelineType } from '@/lib/timeline';

// 단계 종류 색(분류색). 단계 기간 막대 · 달력 띠 · 거르기 칩 점 · 단계 이름 앞 점에만 쓰고, 다른 곳에서 뜻 색으로 빌려 쓰지 않는다(DESIGN.md 2.2).
// 값은 app/globals.css 의 --type-* (밝은 · 어두운 화면 따로). 흰 바탕 3:1 이상 · 어두운 면 5:1 이상, 빨강(기한 지남) · 청록(강조) ·
// 끝난 단계의 흐린 회색과 겹치지 않게 여섯 색을 한 벌로 골랐다(2026-10-27 — 예전 「준비」 회색은 끝난 단계처럼 보였고 노랑은 1.9:1이었다).
export const TYPE_COLOR: Record<TimelineType, string> = {
  prep: 'var(--type-prep)', milestone: 'var(--type-milestone)', critical: 'var(--type-critical)',
  setup: 'var(--type-setup)', admin: 'var(--type-admin)', open: 'var(--type-open)',
};
export const TYPE_DOT: Record<TimelineType, string> = {
  prep: 'bg-[var(--type-prep)]', milestone: 'bg-[var(--type-milestone)]', critical: 'bg-[var(--type-critical)]',
  setup: 'bg-[var(--type-setup)]', admin: 'bg-[var(--type-admin)]', open: 'bg-[var(--type-open)]',
};
export const TYPE_LABEL: Record<TimelineType, string> = {
  prep: '준비', milestone: '계약', critical: '중요', setup: '설비', admin: '행정', open: '운영',
};
export const TYPE_ORDER: TimelineType[] = ['prep', 'milestone', 'critical', 'setup', 'admin', 'open'];
