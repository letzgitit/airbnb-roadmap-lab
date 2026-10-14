// 공개 콘텐츠 타입 (content/*.json 스키마)
export interface OfficialItem { text: string; source: string; url: string; checked: string; region: string }
export interface TipItem { text: string; from: string }
export interface CommunityItem { text: string; date: string; kind: string }
export interface Step {
  id: number; day: number; title: string; summary: string;
  official: OfficialItem[]; tips: TipItem[]; community: CommunityItem[];
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
export interface ProgressDoc {
  schema: 1; version: number; updatedAt: string | null;
  lastAction: LastAction | null;
  steps: Record<string, StepState>;
  tasks: Record<string, TaskItem>;
  log: LogEntry[];
  property: Record<string, PropertyItem>;
  editing: Record<string, EditingMark>;
}
export interface Me { email: string; name: string }
export const STEP_COUNT = 14;
