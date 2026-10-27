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
// date = 그 일이 일어난(일어날) 달 「2026-11」. dateWord = 그 날짜의 뜻(시행 · 발표 · 발의 · 건의 · 게시 · 적용 · 시작) — 항목마다 다르다
export interface UpdateItem { date: string; dateWord?: string; title: string; text: string; source: string; url: string }
export interface Content { steps: Step[]; scripts: ScriptItem[]; updates: UpdateItem[] }

// 우리 현황 타입 (서버 저장 문서)
export type StepStatus = 'todo' | 'doing' | 'done';
export interface StepState {
  status: StepStatus; targetDate: string | null; note: string;
  version: number; updatedAt: string; updatedBy: string;
}
// 할 일 종류(선택). 없는 할 일(옛 데이터 포함)은 종류를 보이지 않는다 — 옮기는 작업 없이 그대로 읽힌다.
// 「문의」 = 누구에게 물어봐야 하는 일(새 홈 「문의 필요」 표시 · 거르기, 2026-10-28 추가 — 묻는 내용은 메모에).
//   사람이 붙이는 표시라 Todoist 자동 분류는 이 값을 고르지 않는다(todoist-classify CLASSIFY_KINDS).
export const TASK_KINDS = ['결정', '연락', '일정 확정', '구매', '예약', '서류', '공사', '확인', '문의'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
// 할 일 맡은 사람(선택). 없으면 키가 없다. Todoist 와는 맞추지 않는다.
export const TASK_OWNERS = ['남편', '아내', '같이'] as const;
export type TaskOwner = (typeof TASK_OWNERS)[number];
// Todoist 에서 들어온 새 할 일의 단계 · 종류를 누가 골랐나(사람이 단계나 종류를 고치면 지운다).
// claude: Claude API · keyword: 낱말 규칙 · default: 둘 다 못 골라 기본 단계
export const AUTO_FILL_BY = ['claude', 'keyword', 'default'] as const;
export type AutoFillBy = (typeof AUTO_FILL_BY)[number];
// Todoist 와 맞추는 칸만 모은 값(lib/core/todoist.ts)
export interface TodoistState { text: string; note: string | null; due: string | null; done: boolean; deleted: boolean }
export interface TaskItem {
  id: string; stepId: number; text: string; due: string | null; done: boolean;
  kind?: TaskKind | null;
  // 자세한 내용(선택, ≤1000자). 제목(text)은 짧게 두고 길게 적을 것은 여기에. 없으면 키가 없다.
  note?: string | null;
  owner?: TaskOwner | null;
  // 할 일 설명서는 이 문서 밖(lib/core/guides.ts, 키 = 할 일 id)에 둔다 — 문서 크기 상한 · 화면 첫 로딩 때문(2026-10-28).
  // 2026-10-27 추가(선택, 단계 탭 트리 간트). 없으면 키가 없다. 규칙은 lib/core/task-tree.ts
  // start = 시작일 YYYY-MM-DD(없으면 마감일 하루짜리). 마감일이 있으면 시작일 ≤ 마감일.
  start?: string | null;
  // parentId = 세부 항목이면 부모 할 일 id. 한 층만 · 부모와 같은 단계 · 부모를 지우거나 되살리면 같이. Todoist 에는 평평한 할 일로 간다.
  parentId?: string | null;
  // 2026-10-27 추가(선택): Todoist 짝. todoistId = 짝인 Todoist 할 일 id, todoistAt = 마지막으로 반영한 Todoist 웹훅의 triggered_at
  todoistId?: string | null;
  todoistAt?: string | null;
  // Todoist 에 지금 있다고 아는 값(마지막으로 보냈거나 웹훅으로 받은 값). 사이트 값과 다르면 아직 못 보낸 것
  todoistSent?: TodoistState | null;
  // 마지막 사이트 → Todoist 보내기가 실패했으면 그 까닭(짧은 글, 토큰 · 본문 없음). 성공하면 지운다
  todoistError?: string | null;
  autoFill?: AutoFillBy | null;
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
