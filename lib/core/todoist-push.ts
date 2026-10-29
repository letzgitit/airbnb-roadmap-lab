// 사이트 → Todoist: 사이트(API · CLI)에서 할 일이 바뀌면 Todoist REST API v1 로 반영한다.
// - 짝(todoistId)이 있는 할 일만 보낸다. 사이트에서 새로 만든 할 일(짝이 한 번도 없었던 것)은 Todoist 에 만들지 않는다.
//   예외: 짝이 있던 할 일을 사이트에서 되살렸는데 Todoist 쪽은 이미 지워졌으면 새로 만들고 새 id 를 적는다.
// - TODOIST_API_TOKEN 이 없으면 아무것도 하지 않는다.
// - 운영 저장소(redis)일 때만 보낸다. 로컬 파일 저장소(연습 데이터)는 토큰이 있어도 보내지 않는다(로컬 시험이 운영 Todoist 를 건드리지 않게).
//   예외: TODOIST_API_BASE 가 진짜 Todoist(api.todoist.com)가 아닌 주소(시험용 가짜 서버)면 로컬에서도 보낸다.
// - 보낼 때마다 문서를 다시 읽어 「지금 사이트 값 − Todoist 에 있다고 아는 값(todoistSent)」만 보낸다. 같은 할 일의 반영 둘이 순서가 뒤집혀도 마지막 상태로 모인다.
// - 실패해도 사이트 쪽 쓰기는 되돌리지 않는다. 할 일에 todoistError 를 남기고, `progress.mjs todoist-sync` 로 다시 맞춘다.
// - 웹훅에서 온 변화(task.fromTodoist)는 여기로 오지 않는다 → Todoist 에서 바뀐 것을 다시 Todoist 로 보내지 않는다.
// - 세부 항목(parentId)은 Todoist 에 평평한 할 일로 보낸다(parent_id 없음). 시작일(start)은 보내지 않는다(siteState 에 없음).
//   부모를 지우거나 되살리면 엔진이 세부 항목도 같이 바꾸므로, 그 세부 항목도 같이 보낸다(cascadeTargets).
import { randomUUID } from 'node:crypto';
import { mutateMany, readDoc, type EngineOp } from './engine.ts';
import { getStore } from './store.ts';
import { diffState, labelName, liteFromTodoist, liteState, siteState, TODOIST_ACTOR, type TodoistSentOp, type TodoistTaskLite } from './todoist.ts';
import type { ProgressDoc, TaskItem, TodoistState } from './types.ts';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
const TIMEOUT_MS = 8000;
const REAL_HOST = 'api.todoist.com';

export interface TodoistConfig { token: string; base: string; label: string; projectId: string | null; fetch: FetchLike }

export function todoistConfig(over: Partial<TodoistConfig> = {}): TodoistConfig | null {
  const token = over.token ?? process.env.TODOIST_API_TOKEN;
  if (!token) return null;
  return {
    token,
    // 시험용 가짜 서버 주소(평소엔 비워 둔다)
    base: (over.base ?? process.env.TODOIST_API_BASE ?? `https://${REAL_HOST}`).replace(/\/$/, ''),
    label: over.label ?? labelName(),
    projectId: over.projectId ?? (process.env.TODOIST_PROJECT_ID || null),
    fetch: over.fetch ?? fetch,
  };
}

export function isRealTodoist(cfg: TodoistConfig): boolean {
  try { return new URL(cfg.base).host === REAL_HOST; } catch { return true; }
}
// 보내도 되는가: 운영 저장소이거나, 가짜 Todoist 서버로 시험 중일 때만
export function pushAllowed(cfg: TodoistConfig): boolean {
  return getStore().kind === 'redis' || !isRealTodoist(cfg);
}

export class TodoistError extends Error {
  status: number;
  constructor(status: number, what: string) { super(`Todoist ${what} 실패 (${status})`); this.status = status; }
}

async function call(cfg: TodoistConfig, method: string, path: string, body?: unknown, form?: Record<string, string>): Promise<unknown> {
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.token}` };
  let payload: string | undefined;
  if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await cfg.fetch(`${cfg.base}${path}`, { method, headers, body: payload, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new TodoistError(res.status, `${method} ${path.split('?')[0].replace(/[A-Za-z0-9]{8,}/g, ':id')}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Todoist REST v1 (문서: https://developer.todoist.com/api/v1/ , 2026-10-27 확인) ──
export const todoistApi = {
  // POST /api/v1/tasks → 만든 할 일(id 포함)
  async create(cfg: TodoistConfig, s: TodoistState): Promise<{ id: string }> {
    const body: Record<string, unknown> = { content: s.text, labels: [cfg.label] };
    if (s.note) body.description = s.note;
    if (s.due) body.due_date = s.due;
    if (cfg.projectId) body.project_id = cfg.projectId;
    const r = (await call(cfg, 'POST', '/api/v1/tasks', body)) as { id?: string };
    if (!r?.id) throw new TodoistError(0, 'create 응답에 id 없음');
    return { id: String(r.id) };
  },
  // POST /api/v1/tasks/{id} — 보낸 칸만 바뀐다. 🔴 반복 할 일에 due_date 를 보내면 반복 규칙이 사라진다(날짜 하나로 바뀜)
  update(cfg: TodoistConfig, id: string, patch: { content?: string; description?: string; due_date?: string }) {
    return call(cfg, 'POST', `/api/v1/tasks/${encodeURIComponent(id)}`, patch);
  },
  // 날짜 지우기: REST update 에는 「지우기」 값이 문서에 없어 Sync API item_update 에 due: null 을 보낸다
  async clearDue(cfg: TodoistConfig, id: string) {
    const uuid = randomUUID();
    const r = (await call(cfg, 'POST', '/api/v1/sync', undefined, {
      commands: JSON.stringify([{ type: 'item_update', uuid, args: { id, due: null } }]),
    })) as { sync_status?: Record<string, unknown> };
    if (r?.sync_status && r.sync_status[uuid] !== 'ok') throw new TodoistError(0, 'sync item_update(due 지우기)');
  },
  close(cfg: TodoistConfig, id: string) { return call(cfg, 'POST', `/api/v1/tasks/${encodeURIComponent(id)}/close`); },
  reopen(cfg: TodoistConfig, id: string) { return call(cfg, 'POST', `/api/v1/tasks/${encodeURIComponent(id)}/reopen`); },
  async remove(cfg: TodoistConfig, id: string) {
    try { await call(cfg, 'DELETE', `/api/v1/tasks/${encodeURIComponent(id)}`); }
    catch (e) { if (!(e instanceof TodoistError && e.status === 404)) throw e; } // 이미 없음 = 지운 것과 같다
  },
  // GET /api/v1/tasks?label=…  — 끝나지 않은 할 일만(완료한 것은 안 나온다). 커서로 끝까지
  async listLabeled(cfg: TodoistConfig): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 50; page++) {
      const qs = new URLSearchParams({ label: cfg.label, limit: '200', ...(cursor ? { cursor } : {}) });
      const r = (await call(cfg, 'GET', `/api/v1/tasks?${qs}`)) as { results?: Record<string, unknown>[]; next_cursor?: string | null };
      out.push(...(r?.results ?? []));
      cursor = r?.next_cursor ?? null;
      if (!cursor) break;
    }
    return out;
  },
};

// ── 보내기 ──

// 엔진이 적용한 연산 하나와 그 결과(바뀐 뒤 할 일)
export interface AppliedTaskOp { op: EngineOp; result: unknown }
export type PushIntent = 'create' | 'sync';
// fields: 이번 연산이 바꾼 칸(아는 값이 없는 옛 짝일 때만 쓴다)
export interface PushTarget { id: string; intent: PushIntent; fields?: (keyof TodoistState)[] }
export interface PushReport { calls: string[]; linked: { id: string; todoistId: string }[]; errors: string[]; skipped?: 'no_token' | 'local_store' }

const isTask = (x: unknown): x is TaskItem => !!x && typeof x === 'object' && typeof (x as TaskItem).id === 'string' && (x as TaskItem).id.startsWith('t_');
const TODOIST_FIELDS: Record<string, keyof TodoistState> = { text: 'text', note: 'note', due: 'due', done: 'done' };

// 적용된 연산 → 보낼 할 일 목록(같은 할 일은 하나로). intent 'create'(task.add)라도 짝이 없으면 pushOne 이 아무것도 보내지 않는다.
export function targetsFromOps(applied: AppliedTaskOp[]): PushTarget[] {
  const map = new Map<string, PushTarget>();
  for (const { op, result } of applied) {
    if (!isTask(result) || !op.op.startsWith('task.') || op.op === 'task.fromTodoist' || op.op === 'task.todoistSent') continue;
    const prev = map.get(result.id);
    const intent: PushIntent = op.op === 'task.add' || prev?.intent === 'create' ? 'create' : 'sync';
    const fields = new Set(prev?.fields ?? []);
    if (op.op === 'task.update') for (const k of Object.keys(op.patch)) if (TODOIST_FIELDS[k]) fields.add(TODOIST_FIELDS[k]);
    if (op.op === 'task.delete' || op.op === 'task.restore') fields.add('deleted');
    map.set(result.id, { id: result.id, intent, fields: [...fields] });
  }
  return [...map.values()];
}

// 부모 지우기 · 되살리기로 엔진이 같이 바꾼 세부 항목(같은 연산 시각에 고쳐진 것)도 보낼 목록에 넣는다
export function cascadeTargets(applied: AppliedTaskOp[], doc: ProgressDoc): PushTarget[] {
  const out: PushTarget[] = [];
  for (const { op, result } of applied) {
    if ((op.op !== 'task.delete' && op.op !== 'task.restore') || !isTask(result)) continue;
    for (const c of Object.values(doc.tasks)) {
      if (c.parentId === result.id && c.updatedAt === result.updatedAt) out.push({ id: c.id, intent: 'sync', fields: ['deleted'] });
    }
  }
  return out;
}

async function record(op: Omit<TodoistSentOp, 'op'>) {
  const { outcomes } = await mutateMany([{ op: 'task.todoistSent', ...op }], TODOIST_ACTOR);
  return outcomes[0];
}
const msg = (e: unknown) => (e instanceof Error ? e.message : 'unknown').slice(0, 200);

// 아는 값이 없는 옛 짝: 이번 연산이 바꾼 칸만 「다르다」고 본다
function guessKnown(cur: TodoistState, fields: (keyof TodoistState)[] = []): TodoistState {
  const k = { ...cur };
  if (fields.includes('text')) k.text = `\u0000${cur.text}`;
  if (fields.includes('note')) k.note = `\u0000${cur.note ?? ''}`;
  if (fields.includes('due')) k.due = `\u0000${cur.due ?? ''}`;
  if (fields.includes('done')) k.done = !cur.done;
  if (fields.includes('deleted')) k.deleted = !cur.deleted;
  return k;
}

// 할 일 하나를 지금 문서 기준으로 Todoist 와 맞춘다
async function pushOne(cfg: TodoistConfig, target: PushTarget, report: PushReport, knownOverride?: TodoistState): Promise<void> {
  for (let round = 0; round < 3; round++) {
    const doc: ProgressDoc = await readDoc();
    const t = Object.hasOwn(doc.tasks, target.id) ? doc.tasks[target.id] : undefined;
    if (!t) return;
    const cur = siteState(t);
    const S = (round === 0 ? knownOverride : undefined) ?? t.todoistSent ?? null;

    // 짝(todoistId)이 한 번도 없었던 할 일은 Todoist 에 만들지 않는다(사이트는 부부가 같이 쓰고 Todoist 는 한 사람 것이라,
    // 사이트에서 만든 할 일이 그쪽으로 넘어가면 안 된다). Todoist 에서 먼저 만든 할 일만 웹훅으로 짝이 생기고, 그 뒤로 맞춘다.
    if (!t.todoistId) return;
    // 새로 만들 때: 짝이 있었는데 Todoist 쪽을 지웠고 사이트에서 되살림(원래 짝이 있던 할 일이라 다시 만든다)
    const goneThere = S?.deleted === true && !cur.deleted;
    if (goneThere) {
      let newId: string;
      try {
        newId = (await todoistApi.create(cfg, cur)).id;
        report.calls.push(`create ${t.id}`);
        if (cur.done) { await todoistApi.close(cfg, newId); report.calls.push(`close ${newId}`); }
      } catch (e) {
        report.errors.push(`create ${t.id}: ${msg(e)}`);
        await record({ id: t.id, todoistId: t.todoistId, expectId: t.todoistId, error: msg(e) }).catch(() => undefined);
        return;
      }
      const o = await record({ id: t.id, todoistId: newId, expectId: t.todoistId ?? null, sent: { ...cur, deleted: false }, error: null });
      const res = o.ok ? (o.result as { action: string }) : null;
      if (o.ok && res?.action !== 'ignored') { report.linked.push({ id: t.id, todoistId: newId }); continue; } // 그 사이 바뀐 것이 있으면 다음 바퀴에서 보낸다
      // 그 사이 다른 반영(되돌아온 웹훅 · 다른 보내기)이 짝을 적었다 → 방금 만든 것이 아무 할 일과도 짝이 아니면 중복이라 지운다
      const now = await readDoc();
      if (!Object.values(now.tasks).some((x) => x.todoistId === newId)) {
        await todoistApi.remove(cfg, newId).catch(() => undefined);
        report.calls.push(`delete ${newId} (중복)`);
      }
      continue;
    }

    // 이미 짝이 있음: 차이만 보낸다
    const known = S ?? guessKnown(cur, target.fields);
    const diff = diffState(cur, known);
    const id = t.todoistId;
    if (!diff.length) {
      if (t.todoistError) await record({ id: t.id, todoistId: id, expectId: id, error: null }).catch(() => undefined);
      return;
    }
    try {
      if (cur.deleted) {
        if (!known.deleted) { await todoistApi.remove(cfg, id); report.calls.push(`delete ${id}`); }
      } else {
        const upd: { content?: string; description?: string; due_date?: string } = {};
        if (diff.includes('text')) upd.content = cur.text;
        if (diff.includes('note')) upd.description = cur.note ?? '';
        if (diff.includes('due') && cur.due) upd.due_date = cur.due;
        if (Object.keys(upd).length) { await todoistApi.update(cfg, id, upd); report.calls.push(`update ${id} ${Object.keys(upd).join(',')}`); }
        if (diff.includes('due') && !cur.due) { await todoistApi.clearDue(cfg, id); report.calls.push(`clearDue ${id}`); }
        if (diff.includes('done')) { await (cur.done ? todoistApi.close(cfg, id) : todoistApi.reopen(cfg, id)); report.calls.push(`${cur.done ? 'close' : 'reopen'} ${id}`); }
      }
    } catch (e) {
      report.errors.push(`sync ${t.id}: ${msg(e)}`);
      await record({ id: t.id, todoistId: id, expectId: id, error: msg(e) }).catch(() => undefined);
      return;
    }
    // 지운 것은 「Todoist 에도 없음」으로 적는다(다시 지우지 않게 · 되살리면 새로 만들게)
    await record({ id: t.id, todoistId: id, expectId: id, sent: cur.deleted ? { ...known, deleted: true } : cur, error: null });
    return;
  }
}

export async function pushTasks(targets: PushTarget[], over: Partial<TodoistConfig> = {}): Promise<PushReport> {
  const report: PushReport = { calls: [], linked: [], errors: [] };
  const cfg = todoistConfig(over);
  if (!cfg) return { ...report, skipped: 'no_token' };
  if (!pushAllowed(cfg)) return { ...report, skipped: 'local_store' };
  for (const target of targets) {
    try { await pushOne(cfg, target, report); } catch (e) { report.errors.push(`${target.id}: ${msg(e)}`); }
  }
  if (report.errors.length) console.error('todoist push:', report.errors.join(' | '));
  return report;
}

// 사이트에서 적용된 할 일 연산들을 Todoist 에 반영한다(mutate 라우트 · CLI apply 가 부른다)
export async function pushToTodoist(applied: AppliedTaskOp[], over: Partial<TodoistConfig> = {}): Promise<PushReport> {
  const targets = targetsFromOps(applied);
  if (applied.some((a) => a.op.op === 'task.delete' || a.op.op === 'task.restore') && todoistConfig(over)) {
    const seen = new Set(targets.map((t) => t.id));
    for (const t of cascadeTargets(applied, await readDoc())) if (!seen.has(t.id)) { seen.add(t.id); targets.push(t); }
  }
  return pushTasks(targets, over);
}

// ── 다시 맞추기(progress.mjs todoist-sync) ──

export type SyncRowKind = 'differs' | 'missing' | 'error' | 'unpaired' | 'todoistOnly';
export interface SyncRow { kind: SyncRowKind; siteId?: string; todoistId?: string; text: string; fields?: string[]; error?: string; actual?: TodoistState }

// Todoist 의 지금 값(라벨 붙은 끝나지 않은 할 일)과 사이트 현황을 견준다
export function planSync(doc: ProgressDoc, todoistTasks: Record<string, unknown>[], label = labelName()): SyncRow[] {
  const actual = new Map<string, TodoistTaskLite>();
  for (const raw of todoistTasks) { const l = liteFromTodoist(raw, null, label); if (l) actual.set(l.id, l); }
  const rows: SyncRow[] = [];
  const paired = new Set<string>();
  for (const t of Object.values(doc.tasks)) {
    if (!t.todoistId) { if (!t.deletedAt) rows.push({ kind: 'unpaired', siteId: t.id, text: t.text }); continue; }
    paired.add(t.todoistId);
    const a = actual.get(t.todoistId);
    if (t.todoistError) rows.push({ kind: 'error', siteId: t.id, todoistId: t.todoistId, text: t.text, error: t.todoistError });
    if (!a) {
      // 끝나지 않은 목록에 없음 = Todoist 에서 완료했거나 지움. 사이트도 끝났거나 지웠으면 맞다.
      if (!t.deletedAt && !t.done) rows.push({ kind: 'missing', siteId: t.id, todoistId: t.todoistId, text: t.text });
      continue;
    }
    const fields = diffState(siteState(t), liteState(a));
    if (fields.length) rows.push({ kind: 'differs', siteId: t.id, todoistId: t.todoistId, text: t.text, fields, actual: liteState(a) });
  }
  for (const a of actual.values()) if (!paired.has(a.id) && a.labeled) rows.push({ kind: 'todoistOnly', todoistId: a.id, text: a.text });
  return rows;
}

// 다른 칸을 사이트 값으로 맞춘다(사이트가 정본). Todoist 의 지금 값을 「아는 값」으로 두고 차이를 보낸다.
export async function applySync(rows: SyncRow[], over: Partial<TodoistConfig> = {}): Promise<PushReport> {
  const report: PushReport = { calls: [], linked: [], errors: [] };
  const cfg = todoistConfig(over);
  if (!cfg) return { ...report, skipped: 'no_token' };
  if (!pushAllowed(cfg)) return { ...report, skipped: 'local_store' };
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.siteId || seen.has(r.siteId) || (r.kind !== 'differs' && r.kind !== 'error')) continue;
    seen.add(r.siteId);
    const actual = r.actual ?? rows.find((x) => x.siteId === r.siteId && x.actual)?.actual;
    try { await pushOne(cfg, { id: r.siteId, intent: 'sync' }, report, actual); } catch (e) { report.errors.push(`${r.siteId}: ${msg(e)}`); }
  }
  return report;
}

export async function fetchTodoistLabeled(over: Partial<TodoistConfig> = {}) {
  const cfg = todoistConfig(over);
  if (!cfg) throw new Error('TODOIST_API_TOKEN 이 없습니다.');
  return todoistApi.listLabeled(cfg);
}
