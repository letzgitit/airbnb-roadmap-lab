import type { Step } from '@/lib/core/types';

// 단계 창에서 「더 보기」로 묶어 두는 네 갈래. 순서 = 단계 창 목록 순서 = 검색 결과 순서.
export type StepSection = 'warnings' | 'official' | 'tips' | 'community';

export const SECTION_ORDER: readonly StepSection[] = ['warnings', 'official', 'tips', 'community'];

export const SECTION_LABEL: Record<StepSection, string> = {
  warnings: '실패 방지 주의사항',
  official: '공식 기준',
  tips: '고수들의 필살기',
  community: '톡방 사례',
};

export const sectionCount = (step: Step, k: StepSection): number => step[k].length;
