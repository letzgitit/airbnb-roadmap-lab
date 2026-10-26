// 서버(Route Handler)와 CLI(scripts/progress.mjs)가 함께 쓰는 병합 엔진. Node 에서 바로 읽히도록 지우기만 하면 되는 TS 문법만 쓴다.
import { randomUUID } from 'node:crypto';
import { getStore } from './store.ts';
import type { Op } from './validate.ts';
import { applyQuestionOp, purgeQuestions, type GuestAnswerOp } from './questions.ts';
import { applyTodoistOp, findByTodoistId, type TodoistEngineOp } from './todoist.ts';
import type { LogEntry, MoneyItem, PlanState, ProgressDoc, PropertyItem, StepState, TaskItem } from './types.ts';

export interface Actor { email: string; name: string }

export const EDIT_TTL_MS = 30_000;
const TRASH_KEEP_MS = 30 * 24 * 3600 * 1000;
const MAX_TASKS = 500;
const MAX_LOG = 500;
const MAX_PROPS = 60;
const MAX_MONEY = 200;
// 휴지통(소프트 삭제) 항목은 30일 보관하지만 종류별로 이 개수를 넘으면 오래된 것부터 정리한다(추가·삭제 반복으로 문서가 끝없이 커지지 않게).
const MAX_TRASH = 200;
// 문서 하나의 상한(UTF-8 바이트). Redis CAS 요청엔 이전 값·새 값이 함께(JSON 이스케이프 포함) 실려 실제 요청은 2배 남짓 → 1MB 안쪽.
export const MAX_DOC_BYTES = 400 * 1024;
const CAS_ATTEMPTS = 10;

// 레코드에 「자기 키」로 들어 있는 것만 꺼낸다(`constructor`·`__proto__` 같은 id 로 프로토타입을 건드리지 않게).
function own<T>(rec: Record<string, T>, id: string): T | undefined {
  return Object.hasOwn(rec, id) ? rec[id] : undefined;
}

export class OpError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.error ?? 'error'));
    this.status = status;
    this.body = body;
  }
}

export function emptyDoc(): ProgressDoc {
  return { schema: 1, version: 0, updatedAt: null, lastAction: null, steps: {}, tasks: {}, log: [], property: {}, editing: {}, money: {}, plan: null, questions: {}, guests: {} };
}

export function parseDoc(raw: string | null): ProgressDoc {
  if (!raw) return emptyDoc();
  const d = JSON.parse(raw) as Partial<ProgressDoc>;
  return {
    ...emptyDoc(), ...d, steps: d.steps ?? {}, tasks: d.tasks ?? {}, log: d.log ?? [], property: d.property ?? {}, editing: d.editing ?? {},
    money: d.money ?? {}, plan: d.plan ?? null, questions: d.questions ?? {}, guests: d.guests ?? {},
  } as ProgressDoc;
}

function defaultPlan(): PlanState {
  return { cash: null, credit: null, fork: '', version: 0, updatedAt: '', updatedBy: '' };
}

function defaultStep(): StepState {
  return { status: 'todo', targetDate: null, note: '', version: 0, updatedAt: '', updatedBy: '' };
}

function pruneEditing(doc: ProgressDoc, now: number) {
  for (const [k, m] of Object.entries(doc.editing)) if (m.until <= now) delete doc.editing[k];
}

function clip(s: string, n = 24) { return s.length > n ? `${s.slice(0, n)}…` : s; }
function newId(prefix: string) { return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`; }

function touch(doc: ProgressDoc, actor: Actor, iso: string, text: string) {
  doc.version += 1;
  doc.updatedAt = iso;
  doc.lastAction = { by: actor.name, text, at: iso };
}

// 항목 하나(할 일·기록·매물정보)의 공통 수정 규칙: 없음 404 / 삭제됨 410 / version 다르면 409
function guardUpdate<T extends { id: string; version: number; updatedBy: string; updatedAt: string; deletedAt: string | null; deletedBy: string | null }>(
  cur: T | undefined, kind: string, baseVersion: number | undefined, force: boolean | undefined, skipVersion: boolean,
): T {
  if (!cur) throw new OpError(404, { error: 'not_found' });
  if (cur.deletedAt) throw new OpError(410, { error: 'deleted', kind, current: cur, by: cur.deletedBy, at: cur.deletedAt });
  if (!skipVersion && !force) {
    if (baseVersion === undefined) throw new OpError(400, { error: 'baseVersion_required', kind, id: cur.id });
    if (cur.version !== baseVersion) {
      throw new OpError(409, { error: 'conflict', kind, id: cur.id, current: cur, by: cur.updatedBy, at: cur.updatedAt });
    }
  }
  return cur;
}

// 엔진이 받는 연산: API · CLI 가 보내는 Op + 서버 안에서만 만드는 손님 답 · Todoist 동기화
export type EngineOp = Op | GuestAnswerOp | TodoistEngineOp;

function applyOp(doc: ProgressDoc, op: EngineOp, actor: Actor, now: number): { result?: unknown } {
  const iso = new Date(now).toISOString();
  pruneEditing(doc, now);
  const bump = (cur: { version: number }) => ({ version: cur.version + 1, updatedAt: iso, updatedBy: actor.name });

  // Todoist 웹훅 반영 · 짝 적기(lib/core/todoist.ts)
  if (op.op === 'task.fromTodoist' || op.op === 'task.todoistSent') {
    return applyTodoistOp(doc, op, iso, now, {
      newId, bump, clip, maxTasks: MAX_TASKS,
      touch: (text) => touch(doc, actor, iso, text),
      fail: (status, body) => { throw new OpError(status, body); },
    });
  }

  // 질문 · 손님 링크(lib/core/questions.ts)
  const q = applyQuestionOp(doc, op, actor, iso, now, {
    newId, bump, clip,
    touch: (text) => touch(doc, actor, iso, text),
    fail: (status, body) => { throw new OpError(status, body); },
  });
  if (q) return q;
  if (op.op === 'question.guestAnswer') throw new OpError(400, { error: 'invalid' });

  switch (op.op) {
    case 'editing.set': {
      doc.editing[op.key] = { by: actor.email, byName: actor.name, until: now + EDIT_TTL_MS };
      return {};
    }
    case 'editing.clear': {
      if (doc.editing[op.key]?.by === actor.email) delete doc.editing[op.key];
      return {};
    }
    case 'step.update': {
      const cur = own(doc.steps, String(op.stepId)) ?? defaultStep();
      if (!op.force && cur.version !== op.baseVersion) {
        throw new OpError(409, { error: 'conflict', kind: 'step', id: op.stepId, current: cur, by: cur.updatedBy, at: cur.updatedAt });
      }
      const next: StepState = { ...cur, ...op.patch, ...bump(cur) };
      doc.steps[String(op.stepId)] = next;
      touch(doc, actor, iso, `${op.stepId}단계 ${op.patch.status ? '상태 변경' : '수정'}`);
      return { result: next };
    }
    case 'task.add': {
      const live = Object.values(doc.tasks).filter((t) => !t.deletedAt).length;
      if (live >= MAX_TASKS) throw new OpError(400, { error: 'limit', message: '할 일이 너무 많습니다.' });
      const t: TaskItem = {
        id: newId('t'), stepId: op.stepId, text: op.text,
        due: op.due ?? null, done: false, doneBy: null, doneAt: null,
        version: 1, createdAt: iso, createdBy: actor.name, updatedAt: iso, updatedBy: actor.name,
        deletedAt: null, deletedBy: null,
        ...(op.kind ? { kind: op.kind } : {}),
        ...(op.note ? { note: op.note } : {}),
        ...(op.owner ? { owner: op.owner } : {}),
      };
      doc.tasks[t.id] = t;
      touch(doc, actor, iso, `할 일 추가: ${clip(t.text)}`);
      return { result: t };
    }
    case 'task.update': {
      const keys = Object.keys(op.patch);
      const toggleOnly = keys.length === 1 && keys[0] === 'done';
      // Todoist 짝만 적는 것도 version 없이(짝 맞추기 도구가 한꺼번에 적을 때)
      const linkOnly = keys.length === 1 && keys[0] === 'todoistId';
      const cur = guardUpdate(own(doc.tasks, op.id), 'task', op.baseVersion, op.force, toggleOnly || linkOnly);
      if (op.patch.todoistId) {
        const other = findByTodoistId(doc, op.patch.todoistId);
        if (other && other.id !== cur.id && !other.deletedAt) throw new OpError(409, { error: 'todoist_linked', kind: 'task', id: other.id, current: other });
      }
      const next: TaskItem = { ...cur, ...op.patch, ...bump(cur) };
      // 사람이 단계나 종류를 고르면 「자동으로 고름」 표시를 지운다
      if (cur.autoFill && (op.patch.stepId !== undefined || op.patch.kind !== undefined)) next.autoFill = null;
      if (op.patch.todoistId !== undefined && op.patch.todoistId !== cur.todoistId) {
        // 짝을 새로 적거나 끊으면 Todoist 쪽 기록을 비운다(짝 맞추기 도구로 적은 짝은 다음 반영 때 맞춰진다)
        next.todoistAt = null; next.todoistSent = null; delete next.todoistError;
      }
      // 자세한 내용을 비우거나 null 로 보내면 키를 지운다(없으면 저장하지 않는 것과 같게)
      if (op.patch.note !== undefined && !op.patch.note) delete next.note;
      if (op.patch.owner === null) delete next.owner;
      if (op.patch.done !== undefined && op.patch.done !== cur.done) {
        next.doneBy = op.patch.done ? actor.name : null;
        next.doneAt = op.patch.done ? iso : null;
      }
      doc.tasks[cur.id] = next;
      touch(doc, actor, iso, `할 일 '${clip(next.text)}' ${toggleOnly ? (next.done ? '체크함' : '체크 해제') : linkOnly ? 'Todoist 짝 적음' : '수정함'}`);
      return { result: next };
    }
    case 'task.delete': {
      const cur = own(doc.tasks, op.id);
      if (!cur) throw new OpError(404, { error: 'not_found' });
      if (cur.deletedAt) return { result: cur };
      const next: TaskItem = { ...cur, deletedAt: iso, deletedBy: actor.name, ...bump(cur) };
      doc.tasks[cur.id] = next;
      touch(doc, actor, iso, `할 일 '${clip(cur.text)}' 삭제`);
      return { result: next };
    }
    case 'task.restore': {
      const cur = own(doc.tasks, op.id);
      if (!cur) throw new OpError(404, { error: 'not_found' });
      if (!cur.deletedAt) return { result: cur };
      const next: TaskItem = { ...cur, deletedAt: null, deletedBy: null, ...bump(cur) };
      doc.tasks[cur.id] = next;
      touch(doc, actor, iso, `할 일 '${clip(cur.text)}' 복원`);
      return { result: next };
    }
    case 'log.add': {
      if (doc.log.filter((l) => !l.deletedAt).length >= MAX_LOG) throw new OpError(400, { error: 'limit', message: '기록이 너무 많습니다.' });
      const l: LogEntry = {
        id: newId('l'), at: iso, by: actor.name, kind: op.kind, text: op.text,
        version: 1, updatedAt: iso, updatedBy: actor.name, deletedAt: null, deletedBy: null,
      };
      doc.log.push(l);
      touch(doc, actor, iso, `${op.kind} 기록: ${clip(op.text)}`);
      return { result: l };
    }
    case 'log.update': {
      const cur = guardUpdate(doc.log.find((l) => l.id === op.id), 'log', op.baseVersion, op.force, false);
      const next: LogEntry = { ...cur, ...op.patch, ...bump(cur) };
      doc.log[doc.log.findIndex((l) => l.id === cur.id)] = next;
      touch(doc, actor, iso, `기록 수정: ${clip(next.text)}`);
      return { result: next };
    }
    case 'log.delete': {
      const idx = doc.log.findIndex((l) => l.id === op.id);
      if (idx < 0) throw new OpError(404, { error: 'not_found' });
      const cur = doc.log[idx];
      if (cur.deletedAt) return { result: cur };
      const next: LogEntry = { ...cur, deletedAt: iso, deletedBy: actor.name, ...bump(cur) };
      doc.log[idx] = next;
      touch(doc, actor, iso, `기록 삭제: ${clip(cur.text)}`);
      return { result: next };
    }
    case 'log.restore': {
      const idx = doc.log.findIndex((l) => l.id === op.id);
      if (idx < 0) throw new OpError(404, { error: 'not_found' });
      const cur = doc.log[idx];
      if (!cur.deletedAt) return { result: cur };
      const next: LogEntry = { ...cur, deletedAt: null, deletedBy: null, ...bump(cur) };
      doc.log[idx] = next;
      touch(doc, actor, iso, `기록 복원: ${clip(cur.text)}`);
      return { result: next };
    }
    case 'property.add': {
      if (Object.values(doc.property).filter((p) => !p.deletedAt).length >= MAX_PROPS) throw new OpError(400, { error: 'limit', message: '집 정보 항목이 너무 많습니다.' });
      const p: PropertyItem = {
        id: newId('p'), label: op.label, value: op.value,
        version: 1, createdAt: iso, updatedAt: iso, updatedBy: actor.name, deletedAt: null, deletedBy: null,
      };
      doc.property[p.id] = p;
      touch(doc, actor, iso, `집 정보 추가: ${clip(p.label)}`);
      return { result: p };
    }
    case 'property.update': {
      const cur = guardUpdate(own(doc.property, op.id), 'property', op.baseVersion, op.force, false);
      const next: PropertyItem = { ...cur, ...op.patch, ...bump(cur) };
      doc.property[cur.id] = next;
      touch(doc, actor, iso, `집 정보 수정: ${clip(next.label)}`);
      return { result: next };
    }
    case 'property.delete': {
      const cur = own(doc.property, op.id);
      if (!cur) throw new OpError(404, { error: 'not_found' });
      if (cur.deletedAt) return { result: cur };
      const next: PropertyItem = { ...cur, deletedAt: iso, deletedBy: actor.name, ...bump(cur) };
      doc.property[cur.id] = next;
      touch(doc, actor, iso, `집 정보 삭제: ${clip(cur.label)}`);
      return { result: next };
    }
    case 'property.restore': {
      const cur = own(doc.property, op.id);
      if (!cur) throw new OpError(404, { error: 'not_found' });
      if (!cur.deletedAt) return { result: cur };
      const next: PropertyItem = { ...cur, deletedAt: null, deletedBy: null, ...bump(cur) };
      doc.property[cur.id] = next;
      touch(doc, actor, iso, `집 정보 복원: ${clip(cur.label)}`);
      return { result: next };
    }
    case 'money.add': {
      if (Object.values(doc.money).filter((m) => !m.deletedAt).length >= MAX_MONEY) throw new OpError(400, { error: 'limit', message: '돈 흐름 항목이 너무 많습니다.' });
      const m: MoneyItem = {
        id: newId('m'), date: op.date, text: op.text, amount: op.amount, via: op.via,
        estimate: op.estimate ?? false, project: op.project,
        version: 1, createdAt: iso, updatedAt: iso, updatedBy: actor.name, deletedAt: null, deletedBy: null,
      };
      doc.money[m.id] = m;
      touch(doc, actor, iso, `돈 흐름 추가: ${clip(m.text)}`);
      return { result: m };
    }
    case 'money.update': {
      const cur = guardUpdate(own(doc.money, op.id), 'money', op.baseVersion, op.force, false);
      const next: MoneyItem = { ...cur, ...op.patch, ...bump(cur) };
      doc.money[cur.id] = next;
      touch(doc, actor, iso, `돈 흐름 수정: ${clip(next.text)}`);
      return { result: next };
    }
    case 'money.delete': {
      const cur = own(doc.money, op.id);
      if (!cur) throw new OpError(404, { error: 'not_found' });
      if (cur.deletedAt) return { result: cur };
      const next: MoneyItem = { ...cur, deletedAt: iso, deletedBy: actor.name, ...bump(cur) };
      doc.money[cur.id] = next;
      touch(doc, actor, iso, `돈 흐름 삭제: ${clip(cur.text)}`);
      return { result: next };
    }
    case 'money.restore': {
      const cur = own(doc.money, op.id);
      if (!cur) throw new OpError(404, { error: 'not_found' });
      if (!cur.deletedAt) return { result: cur };
      const next: MoneyItem = { ...cur, deletedAt: null, deletedBy: null, ...bump(cur) };
      doc.money[cur.id] = next;
      touch(doc, actor, iso, `돈 흐름 복원: ${clip(cur.text)}`);
      return { result: next };
    }
    case 'plan.update': {
      const cur = doc.plan ?? defaultPlan();
      if (!op.force && cur.version !== op.baseVersion) {
        throw new OpError(409, { error: 'conflict', kind: 'plan', current: cur, by: cur.updatedBy, at: cur.updatedAt });
      }
      const next: PlanState = { ...cur, ...op.patch, ...bump(cur) };
      doc.plan = next;
      touch(doc, actor, iso, '한 장 일정 출발점 수정');
      return { result: next };
    }
  }
  throw new OpError(400, { error: 'invalid', message: '모르는 연산입니다.' });
}

function purgeTrash(doc: ProgressDoc, now: number) {
  const old = (iso: string | null) => !!iso && now - new Date(iso).getTime() > TRASH_KEEP_MS;
  for (const [id, t] of Object.entries(doc.tasks)) if (old(t.deletedAt)) delete doc.tasks[id];
  for (const [id, p] of Object.entries(doc.property)) if (old(p.deletedAt)) delete doc.property[id];
  for (const [id, m] of Object.entries(doc.money)) if (old(m.deletedAt)) delete doc.money[id];
  doc.log = doc.log.filter((l) => !old(l.deletedAt));
  purgeQuestions(doc, old);
  // 휴지통 개수 상한: 오래 지운 것부터 정리
  const capTrash = <T extends { id: string; deletedAt: string | null }>(items: T[]): Set<string> => {
    const trash = items.filter((x) => x.deletedAt).sort((a, b) => (a.deletedAt ?? '').localeCompare(b.deletedAt ?? ''));
    return new Set(trash.slice(0, Math.max(0, trash.length - MAX_TRASH)).map((x) => x.id));
  };
  for (const id of capTrash(Object.values(doc.tasks))) delete doc.tasks[id];
  for (const id of capTrash(Object.values(doc.property))) delete doc.property[id];
  const dropLog = capTrash(doc.log);
  if (dropLog.size) doc.log = doc.log.filter((l) => !dropLog.has(l.id));
}

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function readDoc(): Promise<ProgressDoc> {
  const doc = parseDoc(await getStore().read());
  pruneEditing(doc, Date.now());
  return doc;
}

export interface OpOutcome { index: number; ok: boolean; result?: unknown; status?: number; error?: Record<string, unknown> }

// 여러 연산을 한 번에: 읽은 값이 그대로일 때만 쓰고, 그 사이 누가 썼으면 다시 읽어 항목 단위로 재적용한다.
// 연산 하나가 실패(충돌·삭제됨 등)해도 그 연산만 건너뛰고 나머지는 적용한다.
// dryRun: 지금 저장된 값에 적용해 본 결과만 돌려주고 쓰지 않는다(CLI --dry-run).
export async function mutateMany(ops: EngineOp[], actor: Actor, opts: { dryRun?: boolean } = {}): Promise<{ doc: ProgressDoc; outcomes: OpOutcome[] }> {
  const store = getStore();
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    // 동시에 쓰다 밀렸으면 조금씩 늦춰 다시(같은 순간에 또 부딪치지 않게 무작위로)
    if (attempt > 0) await sleep(Math.min(400, 15 * 2 ** attempt) * (0.5 + Math.random()));
    const raw = await store.read();
    const doc = parseDoc(raw);
    const now = Date.now();
    const outcomes: OpOutcome[] = [];
    ops.forEach((op, index) => {
      try {
        const { result } = applyOp(doc, op, actor, now);
        outcomes.push({ index, ok: true, result });
      } catch (e) {
        if (e instanceof OpError) outcomes.push({ index, ok: false, status: e.status, error: e.body });
        else throw e;
      }
    });
    // 하나도 적용되지 않았으면 쓸 것이 없다
    if (outcomes.every((o) => !o.ok)) return { doc, outcomes };
    purgeTrash(doc, now);
    const next = JSON.stringify(doc);
    const size = utf8Bytes(next);
    // 커지는 쓰기만 막는다(이미 상한 근처여도 삭제·수정으로 줄이는 건 통과)
    if (size > MAX_DOC_BYTES && size > utf8Bytes(raw ?? '')) {
      throw new OpError(413, { error: 'too_large', message: '현황 문서가 너무 커졌어요. 오래된 기록을 지운 뒤 다시 시도하세요.' });
    }
    if (opts.dryRun) return { doc, outcomes };
    if (await store.cas(raw, next)) return { doc, outcomes };
  }
  throw new OpError(503, { error: 'busy', message: '잠시 후 다시 시도하세요.' });
}

export async function mutate(op: EngineOp, actor: Actor): Promise<{ doc: ProgressDoc; result?: unknown }> {
  const { doc, outcomes } = await mutateMany([op], actor);
  const o = outcomes[0];
  if (!o.ok) throw new OpError(o.status ?? 500, o.error ?? { error: 'error' });
  return { doc, result: o.result };
}
