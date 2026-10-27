import type { LogEntry, MoneyVia, ProgressDoc, TaskItem, TaskOwner } from '@/lib/core/types';
import { moneyRows, type MoneyRow } from '../../lib/plan.ts';
import { addDays, diffDays, pinsOf, stepRanges, type Pin, type TimelineStep } from './step-dates.ts';

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
//                 after = 계좌(현금 · 마이너스 통장)마다 지금 남은 돈 → 그 두 건을 반영한 뒤 남는 돈(0 아래로 내려갈 수 있다)
// 그림 재료(SummaryViz 가 그린다):
//   finish     = 첫 손님 날: 마지막 단계(14단계) 목표일, 없으면 단계 끝 중 가장 늦은 날(estimate = true). dday = 오늘부터 남은 날(지나면 음수)
//   start · elapsed · span = 링: 단계 시작 중 가장 이른 날부터 첫 손님 날까지 span 일 중 오늘까지 elapsed 일(0 ~ span)
//   stepStates = 14단계 길: 단계마다 상태(done · now · doing · todo)와 종류
//   week       = 할 일 그림: 「지남」 칸(기한 지난 일) + 오늘 ~ 6일 뒤 날짜별 할 일(담당 거르기 반영, ②와 같은 범위)
//   ownerCounts = 담당 칸 묶음 숫자: ②의 범위(기한 지남 · 오늘 · 다음 7일) 안 할 일 수 — 「같이」는 남편 · 아내 둘 다에, 담당 없음은 전체에만
export type OwnerFilter = '' | Exclude<TaskOwner, '같이'>;
export type SummaryDoc = Pick<ProgressDoc, 'tasks' | 'steps' | 'property' | 'log' | 'money' | 'plan' | 'questions'>;

export interface ActiveStep {
  id: number; title: string; type: string; index: number;
  /** 지금 하는 단계(「지금」 표시) */
  current: boolean;
  target: string | null;
  /** 목표일, 없으면 그 단계의 계산된 끝 날(step-dates) */
  due: string;
  /** 그 단계의 안 끝난 할 일 수 */
  openTasks: number;
  /** 그 단계의 (지우지 않은) 할 일 중 끝낸 수 · 전체 수 */
  done: number; all: number;
}
export type StepState = 'done' | 'now' | 'doing' | 'todo';
export interface StepStateRow { id: number; title: string; type: string; index: number; state: StepState }
export interface WeekItem { id: string; type: string }
export interface WeekDay { date: string; items: WeekItem[] }
export interface MoneyAccount {
  via: MoneyVia;
  /** 지금 남은 돈(오늘 앞 돈 흐름까지 반영) */
  now: number;
  /** 다가오는 건(최대 2건)을 반영한 뒤 남는 돈 — 0 아래일 수 있다 */
  after: number;
  /** 그 건들 중 이 계좌에서 나가는 돈 합(양수) */
  out: number;
  /** 이 계좌에 걸린 다가오는 건 */
  rows: MoneyRow[];
}
export interface Summary {
  pins: Pin[]; pinsMore: number;
  stepsDone: number; stepsTotal: number;
  late: TaskItem[]; today: TaskItem[]; next7: TaskItem[];
  decide: TaskItem[];
  questions: { open: number; unread: number };
  active: ActiveStep[];
  recentLog: LogEntry[];
  money: { cash: number | null; credit: number | null; next: MoneyRow[]; after: MoneyAccount[] } | null;
  /** 다가오는 고정 일정 전체 수(pins 는 앞 3개) */
  pinsTotal: number;
  finish: { date: string; estimate: boolean } | null;
  dday: number | null;
  start: string | null; elapsed: number; span: number;
  stepStates: StepStateRow[];
  week: { late: WeekItem[]; days: WeekDay[] };
  ownerCounts: { all: number; 남편: number; 아내: number };
}

export const NEXT_DAYS = 7;
const byDue = (a: TaskItem, b: TaskItem) =>
  (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.stepId - b.stepId || a.createdAt.localeCompare(b.createdAt);

/** 담당 거르기(그날 창과 같은 규칙): 「같이」는 남편 · 아내 둘 다에, 담당 없는 일은 「전체」에서만 */
export const ownerPass = (owner: OwnerFilter) => (t: TaskItem) => !owner || t.owner === owner || t.owner === '같이';

export function summaryOf(steps: TimelineStep[], doc: SummaryDoc, today: string, opts: {
  currentId?: number | null; owner?: OwnerFilter; marks?: Pin[];
  /** 콘텐츠 날수가 정해진 날에서 센 값이면 그 날(지산판). 단계 기간 계산(step-dates)에 그대로 넘긴다 */
  fixedDay0?: string;
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
  const live = Object.values(doc.tasks).filter((t) => !t.deletedAt);
  const openOf = (id: number) => live.filter((t) => !t.done && t.stepId === id).length;
  const ranges = stepRanges(steps, doc, today, opts.fixedDay0);
  const rangeEnd = new Map(ranges.map((r) => [r.id, r.to]));
  const activeIds = [
    ...(opts.currentId != null ? [opts.currentId] : []),
    ...steps.filter((s) => s.id !== opts.currentId && statusOf(s.id) === 'doing').map((s) => s.id),
  ].slice(0, 3);
  const active = activeIds.map((id): ActiveStep | null => {
    const index = steps.findIndex((s) => s.id === id);
    if (index < 0) return null;
    const s = steps[index];
    const target = doc.steps[String(id)]?.targetDate ?? null;
    const own = live.filter((t) => t.stepId === id);
    return {
      id, title: s.title, type: s.type, index, current: id === opts.currentId, target, due: target ?? rangeEnd.get(id) ?? today,
      openTasks: openOf(id), done: own.filter((t) => t.done).length, all: own.length,
    };
  }).filter((a): a is ActiveStep => !!a);

  // 첫 손님 날 · 링
  const finish = finishOf(steps, doc, ranges);
  const start = ranges.map((r) => r.from).sort()[0] ?? null;
  const span = finish && start ? Math.max(1, diffDays(start, finish.date)) : 0;
  const elapsed = start && span ? Math.min(span, Math.max(0, diffDays(start, today))) : 0;
  const stepStates = steps.map((st, index): StepStateRow => {
    const raw = statusOf(st.id);
    const state: StepState = raw === 'done' ? 'done' : st.id === opts.currentId ? 'now' : raw === 'doing' ? 'doing' : 'todo';
    return { id: st.id, title: st.title, type: st.type, index, state };
  });

  // 할 일 그림: 지남 + 오늘 ~ 6일 뒤(담당 거르기 반영 — ②의 목록과 같은 할 일)
  const typeOf = new Map(steps.map((st) => [st.id, st.type]));
  const item = (t: TaskItem): WeekItem => ({ id: t.id, type: typeOf.get(t.stepId) ?? 'prep' });
  const days: WeekDay[] = Array.from({ length: NEXT_DAYS }, (_, i) => {
    const date = addDays(today, i);
    return { date, items: mine.filter((t) => t.due === date).map(item) };
  });
  const windowAll = open.filter((t) => t.due && t.due <= lastNext);
  const ownerCounts = {
    all: windowAll.length,
    남편: windowAll.filter(ownerPass('남편')).length,
    아내: windowAll.filter(ownerPass('아내')).length,
  };

  const recentLog = (doc.log ?? []).filter((l) => !l.deletedAt).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
  const moneyItems = Object.values(doc.money ?? {}).filter((m) => !m.deletedAt);
  let money: Summary['money'] = null;
  if (moneyItems.length > 0) {
    const rows = moneyRows(moneyItems, doc.plan ?? null);
    const next = rows.filter((r) => r.item.date && r.item.date >= today).slice(0, 2);
    // 지금 남은 돈 = 오늘 앞(날짜 있는) 돈 흐름까지 반영한 값. 그 뒤 = 다가오는 두 건 중 마지막 건까지 반영한 값
    const past = rows.filter((r) => r.item.date && r.item.date < today).pop();
    const lastRow = next[next.length - 1];
    const after: MoneyAccount[] = [];
    (['cash', 'credit'] as const).forEach((via) => {
      const base = doc.plan?.[via] ?? null;
      if (base === null) return;
      const now = past ? past[via] ?? base : base;
      const own = next.filter((r) => r.item.via === via);
      const out = own.reduce((n, r) => n + (r.item.amount !== null && r.item.amount < 0 ? -r.item.amount : 0), 0);
      after.push({ via, now, after: lastRow ? lastRow[via] ?? now : now, out, rows: own });
    });
    money = { cash: doc.plan?.cash ?? null, credit: doc.plan?.credit ?? null, next, after };
  }

  return {
    pins: upcoming.slice(0, 3), pinsMore: Math.max(0, upcoming.length - 3),
    stepsDone: steps.filter((s) => statusOf(s.id) === 'done').length, stepsTotal: steps.length,
    late, today: todays, next7, decide,
    questions: { open: questions.filter((q) => q.status === 'open').length, unread: questions.filter((q) => q.unread).length },
    active, recentLog, money,
    pinsTotal: upcoming.length,
    finish, dday: finish ? diffDays(today, finish.date) : null,
    start, elapsed, span, stepStates,
    week: { late: late.map(item), days },
    ownerCounts,
  };
}

/** 첫 손님 날: 마지막 단계 목표일, 없으면 단계 끝 중 가장 늦은 날(estimate = true) */
function finishOf(steps: TimelineStep[], doc: Pick<ProgressDoc, 'steps'>, ranges: { to: string }[]): { date: string; estimate: boolean } | null {
  const lastStep = steps[steps.length - 1];
  const lastTarget = lastStep ? doc.steps[String(lastStep.id)]?.targetDate ?? null : null;
  const latestEnd = ranges.map((r) => r.to).sort().pop() ?? null;
  return lastTarget ? { date: lastTarget, estimate: false } : latestEnd ? { date: latestEnd, estimate: true } : null;
}

/** 첫 손님까지(요약 맨 위 카드와 같은 계산 — 새 홈 달력 탭 맨 위 줄이 쓴다). dday = 오늘부터 남은 날(지나면 음수) */
export function firstGuest(steps: TimelineStep[], doc: Pick<ProgressDoc, 'tasks' | 'steps' | 'property'>, today: string, fixedDay0?: string):
  { finish: { date: string; estimate: boolean } | null; dday: number | null } {
  const finish = finishOf(steps, doc, stepRanges(steps, doc, today, fixedDay0));
  return { finish, dday: finish ? diffDays(today, finish.date) : null };
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
