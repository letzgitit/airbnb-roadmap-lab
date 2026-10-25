// 공개 콘텐츠 타입 (content/*.json 스키마)
export interface OfficialItem { text: string; source: string; url: string; checked: string; region: string }
export interface TipItem { text: string; from: string }
export interface CommunityItem { text: string; date: string; kind: string }
// 참고 자료: 이 단계에 도움 되는 기사·영상·공지. 고정(steps.json)과 자동 수집(lib/refs.ts)이 같은 모양이다.
export type RefKind = '기사' | '영상' | '공지';
export interface RefItem { title: string; summary: string; source: string; date: string; url: string; kind: RefKind; auto?: boolean }
export interface Step {
  id: number; day: number; title: string; summary: string;
  official: OfficialItem[]; tips: TipItem[]; community: CommunityItem[]; refs: RefItem[];
  checklist: string[]; warnings: string[];
}
export interface ScriptItem { who: string; situation: string; lines: string[]; tips: string[] }
export interface UpdateItem { date: string; title: string; text: string; source: string; url: string }
export interface Content { steps: Step[]; scripts: ScriptItem[]; updates: UpdateItem[] }

// 우리 현황 타입 (서버 저장 문서)
export type StepStatus = 'todo' | 'doing' | 'done';
export interface StepState {
  status: StepStatus; targetDate: string | null; note: string;
  version: number; updatedAt: string; updatedBy: string;
}
export interface TaskItem {
  id: string; stepId: number; text: string; due: string | null; done: boolean;
  doneBy: string | null; doneAt: string | null;
  version: number; createdAt: string; createdBy: string; updatedAt: string; updatedBy: string;
  deletedAt: string | null; deletedBy: string | null;
}
export interface EditingMark { by: string; byName: string; until: number }
export interface LastAction { by: string; text: string; at: string }
export const LOG_KINDS = ['결정', '통화', '일정', '메모'] as const;
export type LogKind = (typeof LOG_KINDS)[number];
export interface LogEntry {
  id: string; at: string; by: string; kind: LogKind; text: string;
  version: number; updatedAt: string; updatedBy: string;
  deletedAt: string | null; deletedBy: string | null;
}
// 매물 기본 정보(비공개): 자유 key-value 한 줄
export interface PropertyItem {
  id: string; label: string; value: string;
  version: number; createdAt: string; updatedAt: string; updatedBy: string;
  deletedAt: string | null; deletedBy: string | null;
}
// 돈 흐름 한 줄(비공개): 날짜별 나가는 돈(-)·들어오는 돈(+). 단위 만원. amount null = 금액 미정.
// via: 어디서 나가고 어디로 들어오나(cash 현금 · credit 마이너스 통장). project: 화면의 색 점 구분.
export type MoneyVia = 'cash' | 'credit';
export type PlanProject = 'oedomin' | 'jisan';
export interface MoneyItem {
  id: string; date: string | null; text: string; amount: number | null; via: MoneyVia;
  estimate: boolean; project: PlanProject;
  version: number; createdAt: string; updatedAt: string; updatedBy: string;
  deletedAt: string | null; deletedBy: string | null;
}
// 한 장 일정의 출발점: 지금 현금·마통 여유(만원)와 갈림길 문장(한 줄 = 한 갈래).
export interface PlanState {
  cash: number | null; credit: number | null; fork: string;
  version: number; updatedAt: string; updatedBy: string;
}
// 질문(비공개): 우리가 묻고 받는 사람(손님 링크로 들어오는 지인)이 답을 단다.
// status: open 답 기다림 · answered 답함 · closed 닫음. unread = 손님이 단 새 답을 우리가 아직 안 봄.
export type QuestionStatus = 'open' | 'answered' | 'closed';
export const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = { open: '답 기다림', answered: '답함', closed: '닫음' };
export interface QuestionAnswer {
  id: string; by: string; text: string; at: string;
  /** 손님 링크로 단 답이면 그 링크 id(g_…), 우리가 단 답이면 null */
  guestId: string | null;
  deletedAt: string | null; deletedBy: string | null;
}
export interface QuestionItem {
  id: string; seq: number; to: string; text: string; status: QuestionStatus;
  answers: QuestionAnswer[]; unread: boolean;
  version: number; createdAt: string; createdBy: string; updatedAt: string; updatedBy: string;
  deletedAt: string | null; deletedBy: string | null;
}
// 손님 링크: /q/<token> 으로 열면 name 에게 온 질문과 답만 보인다. 끊으면(revokedAt) 바로 막힌다.
export interface GuestLink {
  id: string; name: string; token: string;
  createdAt: string; createdBy: string; revokedAt: string | null; revokedBy: string | null;
}
export interface ProgressDoc {
  schema: 1; version: number; updatedAt: string | null;
  lastAction: LastAction | null;
  steps: Record<string, StepState>;
  tasks: Record<string, TaskItem>;
  log: LogEntry[];
  property: Record<string, PropertyItem>;
  editing: Record<string, EditingMark>;
  // 2026-10-23 추가(선택): 옛 문서엔 없다 → parseDoc 이 빈 값으로 채운다
  money: Record<string, MoneyItem>;
  plan: PlanState | null;
  // 2026-10-25 추가(선택): 질문 · 손님 링크
  questions: Record<string, QuestionItem>;
  guests: Record<string, GuestLink>;
}
export interface Me { email: string; name: string }
export const STEP_COUNT = 14;
