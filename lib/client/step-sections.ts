import type { Step } from '@/lib/core/types';

// 단계 창의 「더 보기」 네 갈래. 순서 = 탭 순서 = 검색 결과 순서.
// 노하우 탭은 데이터의 tips(현장 노하우)와 community(실제 사례)를 화면에서만 합쳐 보인다.
export type StepSection = 'warnings' | 'official' | 'tips' | 'refs';
// 단계 창 탭: 「할 일」(우리 할 일 · 추천 할 일 · 목표일/메모) + 네 갈래
export type StepTab = 'todo' | StepSection;

export const SECTION_ORDER: readonly StepSection[] = ['warnings', 'official', 'tips', 'refs'];

// 탭 이름(검색 결과 라벨도 같은 이름을 쓴다)
export const TAB_LABEL: Record<StepTab, string> = {
  todo: '할 일',
  warnings: '주의사항',
  official: '규정',
  tips: '노하우',
  refs: '참고 자료',
};

export const sectionCount = (step: Step, k: StepSection): number =>
  k === 'tips' ? step.tips.length + step.community.length : step[k].length;
