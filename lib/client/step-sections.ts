import type { Step } from '@/lib/core/types';

// 단계 창의 「더 보기」 네 갈래. 순서 = 탭 순서 = 검색 결과 순서.
export type StepSection = 'warnings' | 'official' | 'tips' | 'community';
// 단계 창 탭: 「챙길 것」(할 일·체크리스트) + 네 갈래
export type StepTab = 'todo' | StepSection;

export const SECTION_ORDER: readonly StepSection[] = ['warnings', 'official', 'tips', 'community'];

// 검색 결과 라벨에 쓰는 이름(길게)
export const SECTION_LABEL: Record<StepSection, string> = {
  warnings: '실패 방지 주의사항',
  official: '공식 기준',
  tips: '고수들의 필살기',
  community: '톡방 사례',
};

// 탭에 쓰는 이름(짧게)
export const TAB_LABEL: Record<StepTab, string> = {
  todo: '챙길 것',
  warnings: '주의',
  official: '기준',
  tips: '필살기',
  community: '사례',
};

export const sectionCount = (step: Step, k: StepSection): number => step[k].length;
