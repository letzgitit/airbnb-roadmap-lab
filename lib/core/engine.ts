// 서버(Route Handler)와 CLI(scripts/progress.mjs)가 함께 쓰는 병합 엔진. Node 에서 바로 읽히도록 지우기만 하면 되는 TS 문법만 쓴다.
import { randomUUID } from 'node:crypto';
import { getStore } from './store.ts';
import type { Op } from './validate.ts';
import type { LogEntry, ProgressDoc, PropertyItem, StepState, TaskItem } from './types.ts';

export interface Actor { email: string; name: string }

export const EDIT_TTL_MS = 30_000;
const TRASH_KEEP_MS = 30 * 24 * 3600 * 1000;
const MAX_TASKS = 500;
const MAX_LOG = 500;
const MAX_PROPS = 60;

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
  return { schema: 1, version: 0, updatedAt: null, lastAction: null, steps: {}, tasks: {}, log: [], property: {}, editing: {} };
}

export function parseDoc(raw: string | null): ProgressDoc {
  if (!raw) return emptyDoc();
  const d = JSON.parse(raw) as Partial<ProgressDoc>;
  return { ...emptyDoc(), ...d, steps: d.steps ?? {}, tasks: d.tasks ?? {}, log: d.log ?? [], property: d.property ?? {}, editing: d.editing ?? {} } as ProgressDoc;
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

function applyOp(doc: ProgressDoc, op: Op, actor: Actor, now: number): { result?: unknown } {
  const iso = new Date(now).toISOString();
  pruneEditing(doc, now);
  const bump = (cur: { version: number }) => ({ version: cur.version + 1, updatedAt: iso, updatedBy: actor.name });

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
      const cur = doc.steps[String(op.stepId)] ?? defaultStep();
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
      };
      doc.tasks[t.id] = t;
      touch(doc, actor, iso, `할 일 추가: ${clip(t.text)}`);
      return { result: t };
    }
    case 'task.update': {
      const keys = Object.keys(op.patch);
      const toggleOnly = keys.length === 1 && keys[0] === 'done';
      const cur = guardUpdate(doc.tasks[op.id], 'task', op.baseVersion, op.force, toggleOnly);
      const next: TaskItem = { ...cur, ...op.patch, ...bump(cur) };
      if (op.patch.done !== undefined && op.patch.done !== cur.done) {
        next.doneBy = op.patch.done ? actor.name : null;
        next.doneAt = op.patch.done ? iso : null;
      }
      doc.tasks[cur.id] = next;
      touch(doc, actor, iso, `할 일 '${clip(next.text)}' ${toggleOnly ? (next.done ? '체크함' : '체크 해제') : '수정함'}`);
      return { result: next };
    }
    case 'task.delete': {
      const cur = doc.tasks[op.id];
      if (!cur) throw new OpError(404, { error: 'not_found' });
      if (cur.deletedAt) return { result: cur };
      const next: TaskItem = { ...cur, deletedAt: iso, deletedBy: actor.name, ...bump(cur) };
      doc.tasks[cur.id] = next;
      touch(doc, actor, iso, `할 일 '${clip(cur.text)}' 삭제`);
      return { result: next };
    }
    case 'task.restore': {
      const cur = doc.tasks[op.id];
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
      if (Object.values(doc.property).filter((p) => !p.deletedAt).length >= MAX_PROPS) throw new OpError(400, { error: 'limit', message: '매물 정보 항목이 너무 많습니다.' });
      const p: PropertyItem = {
        id: newId('p'), label: op.label, value: op.value,
        version: 1, createdAt: iso, updatedAt: iso, updatedBy: actor.name, deletedAt: null, deletedBy: null,
      };
      doc.property[p.id] = p;
      touch(doc, actor, iso, `매물 정보 추가: ${clip(p.label)}`);
      return { result: p };
    }
    case 'property.update': {
      const cur = guardUpdate(doc.property[op.id], 'property', op.baseVersion, op.force, false);
      const next: PropertyItem = { ...cur, ...op.patch, ...bump(cur) };
      doc.property[cur.id] = next;
      touch(doc, actor, iso, `매물 정보 수정: ${clip(next.label)}`);
      return { result: next };
    }
    case 'property.delete': {
      const cur = doc.property[op.id];
      if (!cur) throw new OpError(404, { error: 'not_found' });
      if (cur.deletedAt) return { result: cur };
      const next: PropertyItem = { ...cur, deletedAt: iso, deletedBy: actor.name, ...bump(cur) };
      doc.property[cur.id] = next;
      touch(doc, actor, iso, `매물 정보 삭제: ${clip(cur.label)}`);
      return { result: next };
    }
    case 'property.restore': {
      const cur = doc.property[op.id];
      if (!cur) throw new OpError(404, { error: 'not_found' });
      if (!cur.deletedAt) return { result: cur };
      const next: PropertyItem = { ...cur, deletedAt: null, deletedBy: null, ...bump(cur) };
      doc.property[cur.id] = next;
      touch(doc, actor, iso, `매물 정보 복원: ${clip(cur.label)}`);
      return { result: next };
    }
  }
}

function purgeTrash(doc: ProgressDoc, now: number) {
  const old = (iso: string | null) => !!iso && now - new Date(iso).getTime() > TRASH_KEEP_MS;
  for (const [id, t] of Object.entries(doc.tasks)) if (old(t.deletedAt)) delete doc.tasks[id];
  for (const [id, p] of Object.entries(doc.property)) if (old(p.deletedAt)) delete doc.property[id];
  doc.log = doc.log.filter((l) => !old(l.deletedAt));
}

export async function readDoc(): Promise<ProgressDoc> {
  const doc = parseDoc(await getStore().read());
  pruneEditing(doc, Date.now());
  return doc;
}

export interface OpOutcome { index: number; ok: boolean; result?: unknown; status?: number; error?: Record<string, unknown> }

// 여러 연산을 한 번에: 읽은 값이 그대로일 때만 쓰고, 그 사이 누가 썼으면 다시 읽어 항목 단위로 재적용한다.
// 연산 하나가 실패(충돌·삭제됨 등)해도 그 연산만 건너뛰고 나머지는 적용한다.
export async function mutateMany(ops: Op[], actor: Actor): Promise<{ doc: ProgressDoc; outcomes: OpOutcome[] }> {
  const store = getStore();
  for (let attempt = 0; attempt < 8; attempt++) {
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
    purgeTrash(doc, now);
    if (await store.cas(raw, JSON.stringify(doc))) return { doc, outcomes };
  }
  throw new OpError(503, { error: 'busy', message: '잠시 후 다시 시도하세요.' });
}

export async function mutate(op: Op, actor: Actor): Promise<{ doc: ProgressDoc; result?: unknown }> {
  const { doc, outcomes } = await mutateMany([op], actor);
  const o = outcomes[0];
  if (!o.ok) throw new OpError(o.status ?? 500, o.error ?? { error: 'error' });
  return { doc, result: o.result };
}
