// Todoist ↔ 사이트 할 일 동기화의 공용 조각: 값 맞추기 · 웹훅 서명 · 엔진이 부르는 서버 전용 연산.
// 엔진과 같이 Node 에서 바로 읽히도록 지우기만 하면 되는 TS 문법만 쓴다. 엔진을 import 하지 않는다(서로 물리지 않게).
// Todoist API v1 문서: https://developer.todoist.com/api/v1/ (웹훅 · 할 일 · Due dates 절, 2026-10-27 확인)
//
// 짝 상태: 할 일마다 todoistSent = 「Todoist 에 지금 있다고 아는 값」(마지막으로 보냈거나 웹훅으로 받은 제목 · 메모 · 날짜 · 완료 · 삭제).
// - 사이트 → Todoist: 지금 사이트 값과 todoistSent 의 차이만 보내고 todoistSent 를 맞춘다(그 순간의 문서 기준이라 순서가 뒤집혀도 마지막 상태로 모인다).
// - Todoist → 사이트: 웹훅 값이 todoistSent 와 같으면 되돌아온 것(또는 바뀐 것 없음)이라 버린다. 다른 칸만 사이트에 반영한다.
// 시작일(start) · 세부 항목(parentId)은 사이트에만 있다(1차). Todoist 에는 세부 항목도 평평한 할 일로 가고 시작일은 보내지 않는다.
// Todoist 에서 온 변경은 이 두 칸을 그대로 둔다. 예외: 마감일이 시작일보다 앞당겨지면 시작일을 마감일로 맞춘다(시작일 ≤ 마감일),
// Todoist 에서 부모를 지우면 세부 항목은 지우지 않고 맨 위 층으로 뗀다(Todoist 에선 따로 있는 할 일이라).
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AutoFillBy, ProgressDoc, TaskItem, TaskKind, TodoistState } from './types.ts';
import { checkParent, liveChildrenOf } from './task-tree.ts';

export const TEXT_MAX = 200;
export const NOTE_MAX = 1000;
export const DEFAULT_LABEL = '외도민';
// 사이트에서 만든 할 일이 Todoist 로 갔다가 웹훅(item:added)으로 되돌아올 때, 아직 짝(todoistId)이 안 적힌 사이트 할 일을 찾는 시간
export const ECHO_WINDOW_MS = 10 * 60 * 1000;
export const TODOIST_ACTOR = { email: 'todoist@sync.local', name: 'Todoist' };

// ── 값 맞추기 ──

// 제목 정규화(사이트 입력 검증 · Todoist content 받기 · 비교 모두 이것): 줄바꿈 · 겹친 공백을 한 칸으로, 앞뒤 공백 지움
export function normText(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}
// Todoist content → 사이트 text: 정규화 뒤 200자를 넘으면 199자 + '…'
export function siteText(content: unknown): string {
  const s = normText(content);
  return s.length > TEXT_MAX ? `${s.slice(0, TEXT_MAX - 1)}…` : s;
}

// Todoist description → 사이트 note: 앞뒤 공백만 지우고, 1000자를 넘으면 999자 + '…'. 비면 null
export function siteNote(description: unknown): string | null {
  const s = typeof description === 'string' ? description.trim() : '';
  if (!s) return null;
  return s.length > NOTE_MAX ? `${s.slice(0, NOTE_MAX - 1)}…` : s;
}

export interface TodoistDue { date?: string | null; timezone?: string | null; string?: string; is_recurring?: boolean }

// Todoist due → 사이트 due(YYYY-MM-DD). 날짜만 맞춘다.
// - 하루 종일 "2026-10-30" · 떠 있는 시각 "2026-10-30T10:00:00" → 앞 10자
// - 시간대가 박힌 시각 "2026-10-30T15:00:00Z"(UTC로 저장) → 그 할 일의 timezone 기준 날짜(없으면 Asia/Seoul)
export function siteDue(due: TodoistDue | null | undefined): string | null {
  const d = due?.date;
  if (!d || typeof d !== 'string') return null;
  if (/Z$/.test(d)) {
    const t = new Date(d);
    if (Number.isNaN(t.getTime())) return null;
    let tz = due?.timezone || 'Asia/Seoul';
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { tz = 'Asia/Seoul'; }
    return new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(d);
  return m ? m[1] : null;
}

export function labelName(): string {
  return (process.env.TODOIST_LABEL || DEFAULT_LABEL).normalize('NFC');
}
export function hasLabel(labels: unknown, label = labelName()): boolean {
  return Array.isArray(labels) && labels.some((l) => typeof l === 'string' && l.normalize('NFC') === label);
}

// 사이트 할 일의 지금 값(Todoist 와 맞추는 칸만)
export function siteState(t: TaskItem): TodoistState {
  return { text: t.text, note: t.note ?? null, due: t.due ?? null, done: !!t.done, deleted: !!t.deletedAt };
}
export const STATE_KEYS = ['text', 'note', 'due', 'done', 'deleted'] as const;
export function diffState(a: TodoistState, b: TodoistState | null | undefined): (typeof STATE_KEYS)[number][] {
  return STATE_KEYS.filter((k) => !b || a[k] !== b[k]);
}

// ── 웹훅 서명 ──
// X-Todoist-Hmac-SHA256 = base64( HMAC-SHA256(key = client_secret, message = 요청 본문 전체) ). 본문은 받은 바이트 그대로 넣는다.
export function signBody(body: string | Buffer, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}
export function verifySignature(body: string | Buffer, header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const want = Buffer.from(signBody(body, secret));
  const got = Buffer.from(header.trim());
  return want.length === got.length && timingSafeEqual(want, got);
}

// ── 웹훅 본문 ──

export const ITEM_EVENTS = ['item:added', 'item:updated', 'item:deleted', 'item:completed', 'item:uncompleted'] as const;
export type ItemEvent = (typeof ITEM_EVENTS)[number];

// 엔진에 넘길 만큼만 줄인 Todoist 할 일
export interface TodoistTaskLite {
  id: string; text: string; note: string | null; due: string | null; checked: boolean; deleted: boolean; labeled: boolean;
}
export interface WebhookEvent { event: ItemEvent; userId: string; at: string; task: TodoistTaskLite }

export function liteState(t: TodoistTaskLite): TodoistState {
  return { text: t.text, note: t.note, due: t.due, done: t.checked, deleted: t.deleted };
}

// Todoist 할 일 JSON(웹훅 event_data · REST 응답) → 줄인 모양
export function liteFromTodoist(d: Record<string, unknown>, event: ItemEvent | null, label = labelName()): TodoistTaskLite | null {
  const id = typeof d.id === 'string' || typeof d.id === 'number' ? String(d.id) : '';
  if (!/^[A-Za-z0-9]{1,64}$/.test(id)) return null;
  const due = d.due as TodoistDue | null;
  // 반복 할 일은 완료해도 다음 날짜로 넘어갈 뿐 checked 가 false 로 남는다 → 이벤트 이름이 아니라 checked 를 따른다
  const checked = due?.is_recurring ? d.checked === true
    : event === 'item:completed' ? true : event === 'item:uncompleted' ? false : d.checked === true;
  return {
    id,
    text: siteText(d.content),
    note: siteNote(d.description),
    due: siteDue(due),
    checked,
    deleted: event === 'item:deleted' || d.is_deleted === true,
    labeled: hasLabel(d.labels, label),
  };
}

// 웹훅 JSON → 엔진 입력. 할 일(item:*) 이 아니거나 모양이 틀리면 null.
export function parseWebhook(json: unknown, label = labelName()): WebhookEvent | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  const event = j.event_name;
  if (typeof event !== 'string' || !(ITEM_EVENTS as readonly string[]).includes(event)) return null;
  const d = j.event_data as Record<string, unknown> | undefined;
  if (!d || typeof d !== 'object') return null;
  const task = liteFromTodoist(d, event as ItemEvent, label);
  if (!task) return null;
  const at = typeof j.triggered_at === 'string' && !Number.isNaN(new Date(j.triggered_at).getTime())
    ? new Date(j.triggered_at).toISOString() : new Date().toISOString();
  return { event: event as ItemEvent, userId: j.user_id === undefined || j.user_id === null ? '' : String(j.user_id), at, task };
}

// ── 엔진 연산(서버 안에서만 만든다. API · CLI 가 받는 opSchema 에는 없다) ──

export interface StepGuess { stepId: number; kind: TaskKind | null; by: AutoFillBy }

// 웹훅 하나를 사이트 할 일에 반영
export interface FromTodoistOp { op: 'task.fromTodoist'; ev: WebhookEvent; guess?: StepGuess }
// 사이트 → Todoist 를 보낸 뒤의 기록: 짝 id · Todoist 에 있다고 아는 값 · 실패 표시. 항목 version 을 올리지 않는다(화면에서 고치던 사람이 409 를 맞지 않게).
// expectId: 이 값일 때만 적는다(그 사이 다른 쪽이 짝을 바꿨으면 손대지 않는다). undefined = 따지지 않음, null = 짝이 없을 때만.
export interface TodoistSentOp {
  op: 'task.todoistSent'; id: string; todoistId: string; expectId?: string | null;
  sent?: TodoistState; error?: string | null;
}
export type TodoistEngineOp = FromTodoistOp | TodoistSentOp;

export interface THelpers {
  newId: (prefix: string) => string;
  touch: (text: string) => void;
  bump: (cur: { version: number }) => { version: number; updatedAt: string; updatedBy: string };
  clip: (s: string) => string;
  fail: (status: number, body: Record<string, unknown>) => never;
  maxTasks: number;
}

export type FromTodoistAction = 'created' | 'linked' | 'updated' | 'deleted' | 'restored' | 'unchanged' | 'ignored';
export interface FromTodoistResult { action: FromTodoistAction; reason?: string; task?: TaskItem }

export function findByTodoistId(doc: ProgressDoc, todoistId: string): TaskItem | undefined {
  // 지운 것보다 살아 있는 짝을 먼저
  const all = Object.values(doc.tasks).filter((t) => t.todoistId === todoistId);
  return all.find((t) => !t.deletedAt) ?? all[0];
}

// 사이트가 막 만든(되살린) 할 일이 Todoist 를 돌아 처음 들어온 경우: 아직 짝이 없거나(또는 옛 짝이 지워진) · 같은 글 · 같은 날짜 · 방금 만들거나 고친 사이트 할 일
export function findEcho(doc: ProgressDoc, t: TodoistTaskLite, nowMs: number): TaskItem | undefined {
  return Object.values(doc.tasks)
    .filter((x) => !x.deletedAt && (!x.todoistId || x.todoistSent?.deleted === true) && x.createdBy !== TODOIST_ACTOR.name
      && x.text === t.text && x.due === t.due && nowMs - new Date(x.updatedAt).getTime() <= ECHO_WINDOW_MS)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

const maxIso = (a: string | null | undefined, b: string) => (a && a > b ? a : b);
// 사람(사이트 · CLI)이 마지막으로 고친 시각. Todoist 웹훅이 고친 것이면 null.
const humanAt = (t: TaskItem) => (t.updatedBy !== TODOIST_ACTOR.name ? t.updatedAt : null);

export function applyTodoistOp(doc: ProgressDoc, op: TodoistEngineOp, iso: string, now: number, h: THelpers): { result: FromTodoistResult } {
  const quiet = (next: TaskItem) => { doc.tasks[next.id] = next; doc.updatedAt = iso; }; // 보이는 값이 안 바뀐 기록(문서 version 그대로)

  if (op.op === 'task.todoistSent') {
    const cur = Object.hasOwn(doc.tasks, op.id) ? doc.tasks[op.id] : undefined;
    if (!cur) return h.fail(404, { error: 'not_found' });
    if (op.expectId !== undefined && (cur.todoistId ?? null) !== op.expectId) return { result: { action: 'ignored', reason: 'link_changed', task: cur } };
    // 웹훅이 먼저 다른 할 일에 이 id 를 붙였으면(되돌아온 item:added 가 먼저 도착) 손대지 않는다
    const other = findByTodoistId(doc, op.todoistId);
    if (other && other.id !== cur.id) return { result: { action: 'ignored', reason: 'linked_elsewhere', task: other } };
    const next: TaskItem = { ...cur, todoistId: op.todoistId };
    if (op.sent) next.todoistSent = op.sent;
    if (op.error !== undefined) next.todoistError = op.error;
    if (next.todoistError === null) delete next.todoistError;
    const linked = cur.todoistId !== op.todoistId;
    if (linked) doc.version += 1; // 짝이 새로 생기면 다른 화면이 받아 가게(마지막 수정 표시는 그대로)
    quiet(next);
    return { result: { action: linked ? 'linked' : 'unchanged', task: next } };
  }

  const { ev } = op;
  const t = ev.task;
  const V = liteState(t);
  const cur = findByTodoistId(doc, t.id);

  if (!cur) {
    if (t.deleted) return { result: { action: 'ignored', reason: 'deleted_unknown' } };
    if (!t.labeled) return { result: { action: 'ignored', reason: 'no_label' } };
    if (!t.text) return { result: { action: 'ignored', reason: 'empty_text' } };
    const echo = findEcho(doc, t, now);
    if (echo) {
      const next: TaskItem = { ...echo, todoistId: t.id, todoistAt: ev.at, todoistSent: V };
      doc.version += 1;
      quiet(next);
      return { result: { action: 'linked', task: next } };
    }
    const live = Object.values(doc.tasks).filter((x) => !x.deletedAt).length;
    if (live >= h.maxTasks) return h.fail(400, { error: 'limit', message: '할 일이 너무 많습니다.' });
    const g = op.guess ?? { stepId: 1, kind: null, by: 'default' as const };
    const task: TaskItem = {
      id: h.newId('t'), stepId: g.stepId, text: t.text, due: t.due,
      done: t.checked, doneBy: t.checked ? TODOIST_ACTOR.name : null, doneAt: t.checked ? iso : null,
      version: 1, createdAt: iso, createdBy: TODOIST_ACTOR.name, updatedAt: iso, updatedBy: TODOIST_ACTOR.name,
      deletedAt: null, deletedBy: null,
      ...(g.kind ? { kind: g.kind } : {}),
      ...(t.note ? { note: t.note } : {}),
      todoistId: t.id, todoistAt: ev.at, todoistSent: V, autoFill: g.by,
    };
    doc.tasks[task.id] = task;
    h.touch(`Todoist 할 일 추가: ${h.clip(task.text)}`);
    return { result: { action: 'created', task } };
  }

  // 라벨을 뗀 할 일: 짝은 두고 아무것도 바꾸지 않는다(사이트 할 일을 지우지 않는다)
  if (!t.labeled && !t.deleted) return { result: { action: 'ignored', reason: 'no_label', task: cur } };
  // 이미 반영한 것보다 앞선 웹훅(늦게 도착). 같은 시각은 값으로 가린다.
  if (cur.todoistAt && ev.at < cur.todoistAt) return { result: { action: 'ignored', reason: 'stale', task: cur } };

  // Todoist 에서 바뀐 칸 = 웹훅 값이 「Todoist 에 있다고 아는 값」과 다른 칸(모르면 사이트 값과 견준다)
  const known = cur.todoistSent ?? siteState(cur);
  const changed = diffState(V, known);
  const record = (next: TaskItem) => ({ ...next, todoistAt: maxIso(cur.todoistAt, ev.at), todoistSent: V });
  if (changed.length === 0) {
    // 사이트가 보낸 것이 되돌아왔거나 Todoist 쪽은 그대로 — 사이트 값을 건드리지 않는다
    if (!cur.todoistAt || ev.at > cur.todoistAt) quiet(record(cur));
    return { result: { action: 'unchanged', task: cur } };
  }
  // 같은 칸을 사이트에서도 고쳤으면(사이트 값 ≠ 아는 값) 나중 쪽이 이긴다: 사람이 이 웹훅보다 나중에 고쳤으면 그 칸은 사이트 값을 둔다
  // (사이트 → Todoist 반영이 맞춘다). 사이트에서 안 고친 칸은 Todoist 값을 받는다. 어느 쪽이든 Todoist 쪽 값은 기록한다.
  const S = siteState(cur);
  const hAt = humanAt(cur);
  const take = changed.filter((k) => S[k] === known[k] || !(hAt && hAt > ev.at));
  if (take.length === 0) {
    quiet(record(cur));
    return { result: { action: 'ignored', reason: 'site_newer', task: cur } };
  }

  if (take.includes('deleted')) {
    if (V.deleted) {
      if (cur.deletedAt) { quiet(record(cur)); return { result: { action: 'unchanged', task: cur } }; }
      const next: TaskItem = record({ ...cur, deletedAt: iso, deletedBy: TODOIST_ACTOR.name, ...h.bump(cur) });
      doc.tasks[cur.id] = next;
      // 세부 항목은 Todoist 에서 따로 있는 할 일이라 같이 지우지 않고 맨 위 층으로 뗀다
      for (const c of liveChildrenOf(doc, cur.id)) {
        const kid: TaskItem = { ...c, ...h.bump(c) };
        delete kid.parentId;
        doc.tasks[c.id] = kid;
      }
      h.touch(`할 일 '${h.clip(cur.text)}' 삭제(Todoist)`);
      return { result: { action: 'deleted', task: next } };
    }
  } else if (cur.deletedAt) {
    // 사이트에서 지웠고 Todoist 에는 아직 있음(지우기 반영 전 · 실패) → 사이트 삭제가 이긴다
    quiet(record(cur));
    return { result: { action: 'ignored', reason: 'deleted_on_site', task: cur } };
  } else if (V.deleted) {
    // Todoist 에서 지웠지만 사이트에서 그 뒤에 고침 → 사이트가 이긴다(지우지 않음)
    quiet(record(cur));
    return { result: { action: 'ignored', reason: 'site_newer', task: cur } };
  }

  const restored = !!cur.deletedAt && !V.deleted;
  const base: TaskItem = restored ? { ...cur, deletedAt: null, deletedBy: null } : cur;
  const patch: Partial<TaskItem> = {};
  if (take.includes('text') && V.text && V.text !== base.text) patch.text = V.text;
  if (take.includes('note') && V.note !== (base.note ?? null)) patch.note = V.note;
  if (take.includes('due') && V.due !== base.due) {
    patch.due = V.due;
    // 시작일은 사이트에만 있다: 그대로 두되, 마감일이 시작일보다 앞당겨지면 시작일을 마감일로 맞춘다
    if (V.due && base.start && base.start > V.due) patch.start = V.due;
  }
  if (take.includes('done') && V.done !== base.done) {
    patch.done = V.done;
    patch.doneBy = V.done ? TODOIST_ACTOR.name : null;
    patch.doneAt = V.done ? iso : null;
  }
  if (!restored && Object.keys(patch).length === 0) { quiet(record(cur)); return { result: { action: 'unchanged', task: cur } }; }
  const next: TaskItem = record({ ...base, ...patch, ...h.bump(cur) });
  if (next.note === null) delete next.note;
  // 되살린 세부 항목의 부모가 지워졌거나 없으면 맨 위 층으로(살아 있는 세부 항목은 늘 살아 있는 부모 밑)
  if (restored && next.parentId && checkParent(doc, next.parentId, next.id).problem) delete next.parentId;
  doc.tasks[cur.id] = next;
  const what = restored ? '복원' : patch.done !== undefined && Object.keys(patch).length === 3 ? (next.done ? '체크함' : '체크 해제') : '수정함';
  h.touch(`할 일 '${h.clip(next.text)}' ${what}(Todoist)`);
  return { result: { action: restored ? 'restored' : 'updated', task: next } };
}
