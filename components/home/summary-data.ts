import type { LogEntry, ProgressDoc, TaskItem, TaskOwner } from '@/lib/core/types';
import { moneyRows, type MoneyRow } from '../../lib/plan.ts';
import { addDays, diffDays, pinsOf, type Pin, type TimelineStep } from './step-dates.ts';

// 홈 「요약」 탭의 계산(화면 없이). HomeSummary 가 그리고, summary-data.test.ts 가 node --test 로 확인한다.
//   지우기만 하면 되는 TS 문법만 쓰고 import 에 .ts 를 붙여 Node 에서 바로 돈다(@/ 경로는 type import 에만).
//
// 카드 여섯 장의 재료:
//   ① 남은 날   = 오늘 이후(오늘 포함) 고정 일정 3개 + 그 뒤 개수, 끝낸 단계 수
//   ② 할 일     = 안 끝나고 안 지운 할 일: 기한 지남(마감 < 오늘) 전부 · 오늘 전부 · 다음 7일(내일 ~ 6일 뒤) 마감순. 담당 거르기는 ②에만
//   ③ 정할 것   = 안 끝난 「결정」 할 일 중 ②의 날짜 범위(마감 ≤ 6일 뒤)에 들지 않는 것(마감순, 날짜 없음은 뒤) — 한 할 일은 요약에 한 번만
//                 + 질문: 답 기다림 수 · 새 답 수
//   ④ 지금 하는 단계 = 지금 단계 + 그 밖의 진행 중 단계(번호순, 3개까지): 목표일 · 그 단계 안 끝난 할 일 수
//   ⑤ 최근 기록 = 안 지운 기록 최신 3개
//   ⑥ 돈        = 돈 흐름(moneyRows, 돈 화면과 같은 계산) 중 날짜가 오늘 이후인 것 2개 + 지금 여유. 돈 흐름이 없으면 null
export type OwnerFilter = '' | Exclude<TaskOwner, '같이'>;
export type SummaryDoc = Pick<ProgressDoc, 'tasks' | 'steps' | 'property' | 'log' | 'money' | 'plan' | 'questions'>;

export interface ActiveStep {
  id: number; title: string; type: string; index: number;
  /** 지금 하는 단계(「지금」 표시) */
  current: boolean;
  target: string | null;
  /** 그 단계의 안 끝난 할 일 수 */
  openTasks: number;
}
export interface Summary {
  pins: Pin[]; pinsMore: number;
  stepsDone: number; stepsTotal: number;
  late: TaskItem[]; today: TaskItem[]; next7: TaskItem[];
  decide: TaskItem[];
  questions: { open: number; unread: number };
  active: ActiveStep[];
  recentLog: LogEntry[];
  money: { cash: number | null; credit: number | null; next: MoneyRow[] } | null;
}

export const NEXT_DAYS = 7;
const byDue = (a: TaskItem, b: TaskItem) =>
  (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.stepId - b.stepId || a.createdAt.localeCompare(b.createdAt);

/** 담당 거르기(그날 창과 같은 규칙): 「같이」는 남편 · 아내 둘 다에, 담당 없는 일은 「전체」에서만 */
export const ownerPass = (owner: OwnerFilter) => (t: TaskItem) => !owner || t.owner === owner || t.owner === '같이';

export function summaryOf(steps: TimelineStep[], doc: SummaryDoc, today: string, opts: {
  currentId?: number | null; owner?: OwnerFilter; marks?: Pin[];
  /** 방금 체크한 줄이 8초 동안 제자리를 지키게(useStickyDone 의 isDone). 없으면 t.done */
  isDone?: (t: TaskItem) => boolean;
  /** 고치는 폼이 열린 할 일 id — 그 사이 상대가 지워도 줄(폼)을 빼지 않는다 */
  editing?: Set<string>;
} = {}): Summary {
  const isDone = opts.isDone ?? ((t: TaskItem) => t.done);
  const editing = opts.editing ?? new Set<string>();
  const pass = ownerPass(opts.owner ?? '');
  const lastNext = addDays(today, NEXT_DAYS - 1);

  const upcoming = pinsOf(doc, opts.marks).filter((p) => p.date >= today);
  const open = Object.values(doc.tasks).filter((t) => (!t.deletedAt || editing.has(t.id)) && !isDone(t)).sort(byDue);
  const mine = open.filter(pass);
  const late = mine.filter((t) => t.due && t.due < today);
  const todays = mine.filter((t) => t.due === today);
  const next7 = mine.filter((t) => t.due && t.due > today && t.due <= lastNext);
  const decide = open.filter((t) => t.kind === '결정' && !(t.due && t.due <= lastNext));

  const questions = Object.values(doc.questions ?? {}).filter((q) => !q.deletedAt);
  const statusOf = (id: number) => doc.steps[String(id)]?.status ?? 'todo';
  const openOf = (id: number) => Object.values(doc.tasks).filter((t) => !t.deletedAt && !t.done && t.stepId === id).length;
  const activeIds = [
    ...(opts.currentId != null ? [opts.currentId] : []),
    ...steps.filter((s) => s.id !== opts.currentId && statusOf(s.id) === 'doing').map((s) => s.id),
  ].slice(0, 3);
  const active = activeIds.map((id): ActiveStep | null => {
    const index = steps.findIndex((s) => s.id === id);
    if (index < 0) return null;
    const s = steps[index];
    return { id, title: s.title, type: s.type, index, current: id === opts.currentId, target: doc.steps[String(id)]?.targetDate ?? null, openTasks: openOf(id) };
  }).filter((a): a is ActiveStep => !!a);

  const recentLog = (doc.log ?? []).filter((l) => !l.deletedAt).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
  const moneyItems = Object.values(doc.money ?? {}).filter((m) => !m.deletedAt);
  const money = moneyItems.length === 0 ? null : {
    cash: doc.plan?.cash ?? null,
    credit: doc.plan?.credit ?? null,
    next: moneyRows(moneyItems, doc.plan ?? null).filter((r) => r.item.date && r.item.date >= today).slice(0, 2),
  };

  return {
    pins: upcoming.slice(0, 3), pinsMore: Math.max(0, upcoming.length - 3),
    stepsDone: steps.filter((s) => statusOf(s.id) === 'done').length, stepsTotal: steps.length,
    late, today: todays, next7, decide,
    questions: { open: questions.filter((q) => q.status === 'open').length, unread: questions.filter((q) => q.unread).length },
    active, recentLog, money,
  };
}

/** 「오늘」 · 「D-3」 · 「2일 지남」 */
export function dLabel(date: string, today: string): string {
  const n = diffDays(today, date);
  return n === 0 ? '오늘' : n > 0 ? `D-${n}` : `${-n}일 지남`;
}

/** 기록의 때: 「오늘 14:25」 · 「어제」 · 「10/24」(이 브라우저의 시각 기준) */
export function logWhen(at: string, today: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (day === today) return `오늘 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (day === addDays(today, -1)) return '어제';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 로그인 전 요약: 오늘 시작하면 첫 손님까지 날수(공개 일정의 가장 늦은 끝 날수)와 그 날 */
export function guestFinish(steps: TimelineStep[], today: string): { days: number; date: string } {
  const days = steps.reduce((n, s) => Math.max(n, s.end), 0);
  return { days, date: addDays(today, days) };
}
