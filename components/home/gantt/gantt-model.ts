import type { ProgressDoc } from '@/lib/core/types';
import { addDays, mondayOf, type Pin, type StepRange } from '../step-dates.ts';

// 홈 「단계」 탭 트리 간트의 줄 목록(화면 없이 계산). StepGantt 가 그리고 gantt-model.test.ts 가 node --test 로 확인한다.
//   지우기만 하면 되는 TS 문법만 쓰고 import 에 .ts 를 붙여 Node 에서 바로 돈다(@/ 경로는 type import 에만).
//
// 세 층:
//   단계(1층)   = 종류색 옅은 띠 · 번호 원 · 이름 · 「~11/9」 「할 일 n/m」 · 굵은 막대(진한 부분이 끝낸 만큼) · ◆ 「목표 11/9」
//   할 일(2층)  = 단계의 맨 위 할 일(세부 항목이 아닌 것), 시작일(없으면 마감일) 순
//   세부 항목(3층) = 그 할 일의 세부 항목, 같은 순. 「세부 1/4」 단추로 접고 편다
// 「할 일 n/m」 = 그 단계의 「끝을 세는 할 일」(세부 항목이 없는 할 일 + 세부 항목) 중 끝낸 수 / 전체.
// 처음 펼침: 안 끝난 단계 중 지금 단계 · 진행 중 · 기한 지난 일 · 다음 7일 안 마감이 있는 단계만. 세부 항목은 기한 지났거나 7일 안 마감인 것이 있을 때만.
// 끝난 단계는 맨 위 「끝난 단계 n개」 한 줄로 접어 둔다(펴면 그 아래에 끝난 단계들).
// 펼친 단계 끝에 「＋ 할 일 추가」 줄(목록 첫 줄이 아니라 끝 — 간트에서는 단계 머리 바로 밑에 추가 줄이 오면 막대와 헷갈린다).

export interface GTask {
  id: string; stepId: number; text: string;
  start: string | null; due: string | null; done: boolean;
  parentId: string | null;
  /** 같은 날짜끼리 순서(만든 때) */
  order: string;
}
export interface PhaseIn extends StepRange {
  target: string | null;
  current: boolean;
  /** 진행 중(현황의 단계 상태) */
  doing: boolean;
}
export interface Phase extends PhaseIn {
  /** 맨 위 할 일(시작일 순) */
  tasks: GTask[];
  /** 할 일 id → 세부 항목(시작일 순) */
  kids: Record<string, GTask[]>;
  leafDone: number; leafTotal: number;
  /** 기한 지난 안 끝난 할 일 수 */
  late: number;
  /** 시작했나(지금 · 진행 중 · 끝낸 할 일이 있거나 시작일이 지난 할 일이 있음) — 아니면 번호 원을 테두리만 */
  started: boolean;
  /** 끝낸 비율(0~100) */
  pct: number;
}

/** 현황 할 일 → 간트 할 일(지운 것 뺌). 부모가 없거나 지워진 세부 항목은 맨 위 할 일로 */
export function tasksOf(doc: Pick<ProgressDoc, 'tasks'>): GTask[] {
  const live = Object.values(doc.tasks).filter((t) => !t.deletedAt);
  const ids = new Set(live.map((t) => t.id));
  return live.map((t) => ({
    id: t.id, stepId: t.stepId, text: t.text, start: t.start ?? null, due: t.due ?? null, done: t.done,
    parentId: t.parentId && ids.has(t.parentId) ? t.parentId : null, order: t.createdAt ?? '',
  }));
}

const FAR = '9999-12-31';
/** 시작일(없으면 마감일) → 마감일 → 만든 때 순 */
export const byDates = (a: GTask, b: GTask) =>
  (a.start ?? a.due ?? FAR).localeCompare(b.start ?? b.due ?? FAR) || (a.due ?? FAR).localeCompare(b.due ?? FAR) || a.order.localeCompare(b.order);
export const isLate = (t: Pick<GTask, 'done' | 'due'>, today: string) => !t.done && !!t.due && t.due < today;

export function phasesOf(ranges: PhaseIn[], tasks: GTask[], today: string): Phase[] {
  return ranges.map((r) => {
    const own = tasks.filter((t) => t.stepId === r.id);
    const kids: Record<string, GTask[]> = {};
    for (const t of own) if (t.parentId) (kids[t.parentId] ??= []).push(t);
    Object.values(kids).forEach((k) => k.sort(byDates));
    const top = own.filter((t) => !t.parentId).sort(byDates);
    const leaves = own.filter((t) => !kids[t.id]?.length);
    const leafDone = leaves.filter((t) => t.done).length;
    return {
      ...r, tasks: top, kids, leafDone, leafTotal: leaves.length,
      late: leaves.filter((t) => isLate(t, today)).length,
      started: r.done || r.current || r.doing || leaves.some((t) => t.done || ((t.start ?? t.due) ?? FAR) <= today),
      pct: leaves.length ? Math.round((leafDone / leaves.length) * 100) : r.done ? 100 : 0,
    };
  });
}

/** 할 일 막대의 기간: 시작일~마감일(하나만 있으면 그날 하루). 날짜가 없고 세부 항목이 있으면 세부 항목 전체 기간. 아무 날짜도 없으면 null */
export function taskRange(t: GTask, kids: GTask[] = []): { from: string; to: string; derived: boolean } | null {
  if (t.start || t.due) return { from: (t.start ?? t.due)!, to: (t.due ?? t.start)!, derived: false };
  const s = kids.map((k) => k.start ?? k.due).filter((d): d is string => !!d).sort();
  const e = kids.map((k) => k.due ?? k.start).filter((d): d is string => !!d).sort();
  return s.length ? { from: s[0], to: e[e.length - 1], derived: true } : null;
}

/** 처음 펼칠 단계 · 세부 항목을 펼칠 할 일 */
export function initialOpen(phases: Phase[], today: string): { open: Set<number>; openTask: Set<string> } {
  const soon = addDays(today, 7);
  const open = new Set<number>();
  const openTask = new Set<string>();
  for (const p of phases) {
    if (p.done) continue;
    const all = [...p.tasks, ...Object.values(p.kids).flat()];
    const near = all.some((t) => !t.done && !!t.due && t.due <= soon); // 기한 지남 + 다음 7일
    if (p.current || p.doing || near) open.add(p.id);
    for (const [id, ks] of Object.entries(p.kids)) if (ks.some((k) => !k.done && !!k.due && k.due <= soon)) openTask.add(id);
  }
  return { open, openTask };
}

/** 편집 폼 자리: 할 일 고치기 · 새 할 일(단계 끝) · 새 세부 항목(그 할 일의 세부 항목 끝) */
export type Editing = { kind: 'edit'; id: string } | { kind: 'new'; stepId: number } | { kind: 'newsub'; parentId: string };

interface Base { more1: boolean; more2: boolean }
export type Row =
  | { k: 'fold'; n: number }
  | { k: 'sep' }
  | { k: 'gap' }
  | ({ k: 'phase'; p: Phase } & Base)
  | ({ k: 'task'; p: Phase; t: GTask; kids: GTask[]; lv: 1 } & Base)
  | ({ k: 'sub'; p: Phase; t: GTask; lv: 2 } & Base)
  | ({ k: 'add'; p: Phase; lv: 1 } & Base)
  | { k: 'form'; p: Phase; lv: 1 | 2; ed: Editing; rail1: boolean; rail2: boolean };

export interface RowOpts {
  open: Set<number>; openTask: Set<string>; showDone: boolean;
  /** 단계 종류 거르기(비었으면 전체) */
  types: string[];
  editing: Editing | null;
  /** 로그인 전: 단계 줄만(펼침 · 추가 없음) */
  guest: boolean;
}

export const passType = (types: string[]) => (p: { type: string }) => types.length === 0 || types.includes(p.type);

export function ganttRows(phases: Phase[], o: RowOpts): Row[] {
  const pass = passType(o.types);
  const done = phases.filter((p) => p.done && pass(p));
  const rest = phases.filter((p) => !p.done && pass(p));
  const rows: Row[] = [];
  const no = { more1: false, more2: false };
  if (done.length) rows.push({ k: 'fold', n: done.length });
  const phaseRows = (p: Phase) => {
    rows.push({ k: 'phase', p, ...no });
    if (o.guest || !o.open.has(p.id)) return;
    for (const t of p.tasks) {
      const kids = p.kids[t.id] ?? [];
      rows.push({ k: 'task', p, t, kids, lv: 1, ...no });
      if (kids.length && o.openTask.has(t.id)) for (const s of kids) rows.push({ k: 'sub', p, t: s, lv: 2, ...no });
    }
    rows.push({ k: 'add', p, lv: 1, ...no });
  };
  if (o.showDone) done.forEach((p) => { rows.push({ k: 'gap' }); phaseRows(p); });
  rest.forEach((p, i) => { rows.push({ k: i || done.length ? 'gap' : 'sep' }); phaseRows(p); });

  // 트리 선이 아래 줄로 이어지는가: more1 = 같은 단계의 할 일 층 줄이 아래에 더 있음, more2 = 같은 할 일의 세부 항목이 아래에 더 있음
  rows.forEach((r, i) => {
    if (!('p' in r) || r.k === 'form') return;
    const nx = rows[i + 1];
    const same = !!nx && 'p' in nx && nx.p === r.p && nx.k !== 'phase';
    r.more1 = same;
    if (r.k === 'task') r.more2 = !!nx && nx.k === 'sub' && nx.t.parentId === r.t.id;
    if (r.k === 'sub') r.more2 = !!nx && nx.k === 'sub' && nx.t.parentId === r.t.parentId;
  });

  // 편집 폼 끼우기
  const ed = o.editing;
  if (ed && !o.guest) {
    let at = -1;
    if (ed.kind === 'edit') at = rows.findIndex((r) => (r.k === 'task' || r.k === 'sub') && r.t.id === ed.id);
    if (ed.kind === 'new') at = rows.findIndex((r) => r.k === 'add' && r.p.id === ed.stepId);
    if (ed.kind === 'newsub') {
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if ((r.k === 'task' || r.k === 'sub') && (r.t.id === ed.parentId || r.t.parentId === ed.parentId)) { at = i; break; }
      }
    }
    if (at >= 0) {
      const r = rows[at] as Extract<Row, { more1: boolean }> & { p: Phase };
      const lv: 1 | 2 = ed.kind === 'newsub' ? 2 : ed.kind === 'new' ? 1 : r.k === 'sub' ? 2 : 1;
      rows.splice(at + 1, 0, { k: 'form', p: r.p, lv, ed, rail1: r.more1, rail2: r.more2 });
    }
  }
  return rows;
}

/**
 * 축 범위(월요일 ~ 일요일): 보이는 단계(거르기 · 끝난 단계 펼침 반영)의 기간 · 그 할 일 · 목표일 · 오늘을 다 담는다.
 * 고정 일정은 그 범위 끝에서 14일 안쪽만 넓힌다(먼 날 하나 때문에 축이 길어지지 않게).
 */
export function spanOf(phases: Phase[], pins: Pin[], today: string, o: { showDone: boolean; types: string[] }): { first: string; last: string } {
  const pass = passType(o.types);
  const shown = phases.filter((p) => pass(p) && (!p.done || o.showDone));
  const starts: string[] = [today];
  const ends: string[] = [today];
  for (const p of shown) {
    starts.push(p.from); ends.push(p.to);
    if (p.target) ends.push(p.target);
    for (const t of [...p.tasks, ...Object.values(p.kids).flat()]) {
      const s = t.start ?? t.due;
      const e = t.due ?? t.start;
      if (s) starts.push(s);
      if (e) ends.push(e);
    }
  }
  starts.sort(); ends.sort();
  let lo = starts[0];
  let hi = ends[ends.length - 1];
  const reach = addDays(hi, 14);
  for (const pin of pins) {
    if (pin.date > reach || pin.date < addDays(lo, -14)) continue;
    if (pin.date < lo) lo = pin.date;
    if (pin.date > hi) hi = pin.date;
  }
  return { first: mondayOf(lo), last: addDays(mondayOf(hi), 6) };
}
