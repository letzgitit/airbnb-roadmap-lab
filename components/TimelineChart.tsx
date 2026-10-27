// 단계 종류(분류) 이름 · 색. 예전 공개 화면의 「n일째」 막대 목록은 2026-10-27 로그인 화면과 같은 날짜 화면(home/DateTimeline)으로 합쳤다.
import type { TimelineType } from '@/lib/timeline';

// 단계 종류 색(분류색). 단계 기간 막대와 그 범례에만 쓰고, 다른 곳에서 뜻 색으로 빌려 쓰지 않는다(DESIGN.md 2.2).
// 「준비」는 화면 모드에 따라 바뀌어야 해서 CSS 변수로 둔다. 「계약」은 파랑(#1c7ed6 — 흰 바탕 4.2:1, 어두운 면 #1a1d22 와 4:1).
//   예전엔 글자색(ink)이라 단계 탭에서 가장 센 검정 · 흰 막대가 되고, 달력에선 끝난 단계의 흐린 회색과 구분되지 않았다.
//   빨강(기한 지남) · 청록(강조)과 겹치지 않게 파랑을 쓴다.
export const TYPE_COLOR: Record<TimelineType, string> = {
  prep: 'var(--prep-bar)', milestone: '#1c7ed6', critical: '#f97316', setup: '#eab308', admin: '#a855f7', open: '#10b981',
};
export const TYPE_DOT: Record<TimelineType, string> = {
  prep: 'bg-[var(--prep-bar)]', milestone: 'bg-[#1c7ed6]', critical: 'bg-[#f97316]', setup: 'bg-[#eab308]', admin: 'bg-[#a855f7]', open: 'bg-[#10b981]',
};
export const TYPE_LABEL: Record<TimelineType, string> = {
  prep: '준비', milestone: '계약', critical: '중요', setup: '설비', admin: '행정', open: '운영',
};
export const TYPE_ORDER: TimelineType[] = ['prep', 'milestone', 'critical', 'setup', 'admin', 'open'];
