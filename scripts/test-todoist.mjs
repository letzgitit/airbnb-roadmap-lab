#!/usr/bin/env node
// Todoist 동기화 단위 시험(node:test). 운영 저장소 · Todoist · Claude API 에 붙지 않는다:
// 임시 폴더를 작업 폴더로 삼아 그 안의 .data/progress.json 만 쓰고, 바깥 호출은 가짜 fetch 로 받는다.
// 사용: node --test scripts/test-todoist.mjs   (또는 node scripts/test-todoist.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'TODOIST_API_TOKEN', 'TODOIST_API_BASE', 'TODOIST_LABEL', 'TODOIST_PROJECT_ID', 'ANTHROPIC_API_KEY']) delete process.env[k];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'todoist-test-'));
process.chdir(tmp); // store.ts 가 불러올 때의 작업 폴더 아래 .data/ 를 쓴다
const DATA = path.join(tmp, '.data', 'progress.json');

const imp = (f) => import(path.join(root, f));
const { mutate, mutateMany, readDoc, OpError } = await imp('lib/core/engine.ts');
const { renderMarkdown } = await imp('lib/core/markdown.ts');
const { opSchema } = await imp('lib/core/validate.ts');
const T = await imp('lib/core/todoist.ts');
const { handleTodoistWebhook } = await imp('lib/core/todoist-webhook.ts');
const { pushToTodoist, pushTasks, planSync, applySync } = await imp('lib/core/todoist-push.ts');
const C = await imp('lib/core/todoist-classify.ts');
const M = await imp('scripts/todoist-match.mjs');

const SECRET = 'test-client-secret';
const ME = { email: 'me@example.test', name: 'me' };
const STEPS = [
  { id: 2, title: '구청 담당자 유선 확인', summary: '' }, { id: 7, title: '인테리어 & 스타일링', summary: '' }, { id: 8, title: '소방시설 최종 설치', summary: '' },
];
const reset = () => fs.rmSync(path.join(tmp, '.data'), { recursive: true, force: true });

let clock = Date.parse('2026-10-27T00:00:00Z');
const nextAt = () => new Date((clock += 60_000)).toISOString();
function event(name, data, at = nextAt()) {
  return {
    event_name: name, user_id: '111', triggered_at: at, version: '10', initiator: { id: '111' },
    event_data: { id: 'TD1', content: '구청 위생과에 전화하기', description: '', due: null, labels: ['외도민'], checked: false, is_deleted: false, ...data },
  };
}
async function send(ev, opts = {}) {
  const raw = JSON.stringify(ev);
  return handleTodoistWebhook(raw, opts.sig ?? T.signBody(raw, SECRET), { secret: SECRET, userId: '111', steps: STEPS, classify: opts.classify, mutate: opts.mutate });
}
const live = async () => Object.values((await readDoc()).tasks);

// ── 서명 ──
test('서명: 맞으면 통과, 틀리거나 없으면 거절', async () => {
  const body = '{"event_name":"item:added"}';
  const sig = T.signBody(body, SECRET);
  assert.equal(T.verifySignature(body, sig, SECRET), true);
  assert.equal(T.verifySignature(body + ' ', sig, SECRET), false);
  assert.equal(T.verifySignature(body, sig, 'other'), false);
  assert.equal(T.verifySignature(body, null, SECRET), false);
  assert.equal(T.verifySignature(body, sig, undefined), false);
  reset();
  const r = await send(event('item:added', {}), { sig: 'AAAA' });
  assert.equal(r.status, 401);
  assert.equal((await live()).length, 0);
  const r2 = await handleTodoistWebhook('{}', 'x', { secret: undefined, userId: '111', steps: [] });
  assert.equal(r2.status, 503);
  const r3 = await handleTodoistWebhook('{}', 'x', { secret: SECRET, steps: [] }); // TODOIST_USER_ID 없음
  assert.equal(r3.status, 503);
  // 서명은 받은 바이트 그대로(Buffer)로도 맞는다
  const raw = Buffer.from(JSON.stringify(event('item:added', { id: 'BUF1' })));
  const r4 = await handleTodoistWebhook(raw, T.signBody(raw, SECRET), { secret: SECRET, userId: '111', steps: [] });
  assert.equal(r4.body.action, 'created');
});

// ── Todoist → 사이트 ──
test('웹훅: 새 할 일 · 고침 · 완료 · 되살림(완료 취소) · 삭제 · 삭제 뒤 되살림', async () => {
  reset();
  let r = await send(event('item:added', { due: { date: '2026-11-03', is_recurring: false, string: '11월 3일' }, description: '서류 목록 물어보기' }));
  assert.equal(r.body.action, 'created');
  let [t] = await live();
  assert.equal(t.text, '구청 위생과에 전화하기');
  assert.equal(t.due, '2026-11-03');
  assert.equal(t.note, '서류 목록 물어보기');
  assert.equal(t.todoistId, 'TD1');
  assert.equal(t.stepId, 2); // 낱말 규칙: 구청 + 전화
  assert.equal(t.kind, '연락');
  assert.equal(t.autoFill, 'keyword');
  assert.equal(t.createdBy, 'Todoist');

  r = await send(event('item:updated', { content: '구청 위생과 전화(오후)', due: { date: '2026-11-04T15:00:00', string: 'x' }, description: '' }));
  assert.equal(r.body.action, 'updated');
  [t] = await live();
  assert.equal(t.text, '구청 위생과 전화(오후)');
  assert.equal(t.due, '2026-11-04');
  assert.equal('note' in t, false);

  r = await send(event('item:completed', { content: '구청 위생과 전화(오후)', due: { date: '2026-11-04' }, checked: true }));
  [t] = await live();
  assert.equal(r.body.action, 'updated');
  assert.equal(t.done, true);
  assert.equal(t.doneBy, 'Todoist');

  r = await send(event('item:uncompleted', { content: '구청 위생과 전화(오후)', due: { date: '2026-11-04' }, checked: false }));
  [t] = await live();
  assert.equal(t.done, false);

  r = await send(event('item:deleted', { content: '구청 위생과 전화(오후)', due: { date: '2026-11-04' }, is_deleted: true }));
  [t] = await live();
  assert.equal(r.body.action, 'deleted');
  assert.ok(t.deletedAt);
  assert.equal(t.deletedBy, 'Todoist');

  // 삭제 전에 생긴(늦게 도착한) 웹훅은 되살리지 않는다
  r = await send(event('item:updated', { content: '옛 웹훅' }, '2026-10-01T00:00:00Z'));
  assert.equal(r.body.action, 'ignored');
  // 삭제 뒤에 Todoist 에서 생긴 변화는 되살린다
  r = await send(event('item:updated', { content: '다시 살아남', due: { date: '2026-11-04' } }, new Date(clock + 3600_000).toISOString()));
  [t] = await live();
  assert.equal(r.body.action, 'restored');
  assert.equal(t.deletedAt, null);
  assert.equal(t.text, '다시 살아남');
});

test('웹훅: 라벨 없는 할 일 · 할 일 아닌 이벤트 · 다른 사용자는 무시', async () => {
  reset();
  let r = await send(event('item:added', { id: 'NOLABEL', labels: ['장보기'] }));
  assert.equal(r.status, 200);
  assert.equal(r.body.action, 'ignored');
  assert.equal(r.body.reason, 'no_label');
  r = await send({ event_name: 'project:added', event_data: { id: 'P1' } });
  assert.equal(r.body.reason, 'not_item_event');
  const raw = JSON.stringify({ ...event('item:added', { id: 'OTHER' }), user_id: '999' });
  r = await handleTodoistWebhook(raw, T.signBody(raw, SECRET), { secret: SECRET, userId: '111', steps: [] });
  assert.equal(r.body.reason, 'other_user');
  assert.equal((await live()).length, 0);
});

test('웹훅: 되돌아온 웹훅(값이 같음) · 늦게 온 옛 웹훅은 쓰지 않는다', async () => {
  reset();
  await send(event('item:added', { id: 'TD2', content: '소방 감지기 사기' }));
  const before = await readDoc();
  // 사이트에서 고친 것이 Todoist 를 돌아 같은 값으로 들어옴
  const r = await send(event('item:updated', { id: 'TD2', content: '소방 감지기 사기' }));
  assert.equal(r.body.action, 'unchanged');
  assert.equal((await readDoc()).version, before.version);
  const r2 = await send(event('item:updated', { id: 'TD2', content: '옛 이름' }, '2026-01-01T00:00:00Z'));
  assert.equal(r2.body.reason, 'stale');
  assert.equal((await live())[0].text, '소방 감지기 사기');
});

test('웹훅: 사이트에서 막 만든 할 일이 되돌아오면 새로 만들지 않고 짝만 적는다', async () => {
  reset();
  const { result } = await mutate({ op: 'task.add', stepId: 7, text: '욕실 줄눈 다시', due: '2026-11-10' }, ME);
  const r = await send(event('item:added', { id: 'TD3', content: '욕실 줄눈 다시', due: { date: '2026-11-10' } }));
  assert.equal(r.body.action, 'linked');
  const all = await live();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, result.id);
  assert.equal(all[0].todoistId, 'TD3');
  assert.equal(all[0].version, result.version); // 항목 version 은 그대로(화면에서 고치던 사람이 409 를 안 맞게)
});

test('200자 줄이기 · 1000자 줄이기', async () => {
  const long = '가'.repeat(250);
  assert.equal(T.siteText(long).length, 200);
  assert.ok(T.siteText(long).endsWith('…'));
  assert.equal(T.siteText('  한 줄\n둘째   줄 '), '한 줄 둘째 줄');
  assert.equal(T.siteText('가'.repeat(200)), '가'.repeat(200));
  assert.equal(T.siteNote('나'.repeat(1200)).length, 1000);
  assert.equal(T.siteNote('   '), null);
  reset();
  await send(event('item:added', { id: 'TD4', content: long }));
  const [t] = await live();
  assert.equal(t.text.length, 200);
  assert.ok(opSchema.safeParse({ op: 'task.update', id: t.id, baseVersion: t.version, patch: { text: t.text } }).success);
  // 줄인 글과 같은 긴 글이 다시 오면 바꾸지 않는다
  const r = await send(event('item:updated', { id: 'TD4', content: long }));
  assert.equal(r.body.action, 'unchanged');
});

test('날짜: 하루 종일 · 떠 있는 시각 · 시간대 박힌 시각', () => {
  assert.equal(T.siteDue(null), null);
  assert.equal(T.siteDue({ date: '2026-11-03' }), '2026-11-03');
  assert.equal(T.siteDue({ date: '2026-11-03T23:30:00' }), '2026-11-03');
  assert.equal(T.siteDue({ date: '2026-11-03T16:00:00Z', timezone: 'Asia/Seoul' }), '2026-11-04');
});

// ── 사이트 → Todoist ──
function fakeTodoist() {
  const calls = [];
  let n = 0;
  const fetch = async (url, init) => {
    const u = new URL(url);
    let body = null;
    if (init.body) body = (init.headers['content-type'] ?? '').includes('json') ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body));
    calls.push({ method: init.method, path: u.pathname, body, auth: init.headers.Authorization });
    if (u.pathname === '/api/v1/tasks' && init.method === 'POST') return new Response(JSON.stringify({ id: `NEW${++n}`, content: body.content }), { status: 200 });
    if (u.pathname === '/api/v1/sync') {
      const uuid = JSON.parse(body.commands)[0].uuid;
      return new Response(JSON.stringify({ sync_status: { [uuid]: 'ok' } }), { status: 200 });
    }
    return new Response('null', { status: 200 });
  };
  return { calls, fetch };
}

test('사이트 → Todoist: 토큰 없으면 건너뜀', async () => {
  const r = await pushToTodoist([{ op: { op: 'task.add' }, result: { id: 't_x' } }]);
  assert.equal(r.skipped, 'no_token');
});

test('사이트 → Todoist: 만들기 · 고치기 · 날짜 지우기 · 완료 · 삭제 · 되살리기 호출 내용', async () => {
  reset();
  const fk = fakeTodoist();
  const cfg = { token: 'tok', base: 'http://fake.test', fetch: fk.fetch };
  const add = { op: 'task.add', stepId: 6, text: '냉장고 주문', due: '2026-11-05', note: '모델 비교 후' };
  const { result: t } = await mutate(add, ME);
  let r = await pushToTodoist([{ op: add, result: t }], cfg);
  assert.deepEqual(fk.calls[0], { method: 'POST', path: '/api/v1/tasks', body: { content: '냉장고 주문', labels: ['외도민'], due_date: '2026-11-05', description: '모델 비교 후' }, auth: 'Bearer tok' });
  assert.deepEqual(r.linked, [{ id: t.id, todoistId: 'NEW1' }]);
  let cur = (await readDoc()).tasks[t.id];
  assert.equal(cur.todoistId, 'NEW1');

  fk.calls.length = 0;
  const u1 = { op: 'task.update', id: t.id, baseVersion: cur.version, patch: { text: '냉장고 주문하기', due: null, note: null } };
  const { result: t1 } = await mutate(u1, ME);
  await pushToTodoist([{ op: u1, result: t1 }], cfg);
  assert.deepEqual(fk.calls[0], { method: 'POST', path: '/api/v1/tasks/NEW1', body: { content: '냉장고 주문하기', description: '' }, auth: 'Bearer tok' });
  assert.equal(fk.calls[1].path, '/api/v1/sync');
  assert.deepEqual(JSON.parse(fk.calls[1].body.commands)[0].args, { id: 'NEW1', due: null });

  fk.calls.length = 0;
  const u2 = { op: 'task.update', id: t.id, patch: { done: true } };
  const { result: t2 } = await mutate(u2, ME);
  await pushToTodoist([{ op: u2, result: t2 }], cfg);
  assert.deepEqual(fk.calls.map((c) => `${c.method} ${c.path}`), ['POST /api/v1/tasks/NEW1/close']);

  fk.calls.length = 0;
  const u3 = { op: 'task.update', id: t.id, baseVersion: t2.version, patch: { stepId: 7, kind: '구매' } };
  const { result: t3 } = await mutate(u3, ME);
  await pushToTodoist([{ op: u3, result: t3 }], cfg);
  assert.equal(fk.calls.length, 0); // 단계 · 종류는 사이트에만

  const d = { op: 'task.delete', id: t.id };
  const { result: t4 } = await mutate(d, ME);
  await pushToTodoist([{ op: d, result: t4 }], cfg);
  assert.deepEqual(fk.calls.map((c) => `${c.method} ${c.path}`), ['DELETE /api/v1/tasks/NEW1']);

  fk.calls.length = 0;
  const rs = { op: 'task.restore', id: t.id };
  const { result: t5 } = await mutate(rs, ME);
  r = await pushToTodoist([{ op: rs, result: t5 }], cfg);
  assert.deepEqual(fk.calls.map((c) => `${c.method} ${c.path}`), ['POST /api/v1/tasks', 'POST /api/v1/tasks/NEW2/close']);
  assert.equal((await readDoc()).tasks[t.id].todoistId, 'NEW2');

  // 짝이 없던 옛 할 일은 고쳐도 Todoist 를 부르지 않는다
  fk.calls.length = 0;
  const { result: old } = await mutate({ op: 'task.add', stepId: 1, text: '옛 할 일' }, ME);
  const u4 = { op: 'task.update', id: old.id, baseVersion: old.version, patch: { text: '옛 할 일 고침' } };
  const { result: old2 } = await mutate(u4, ME);
  await pushToTodoist([{ op: u4, result: old2 }], cfg);
  assert.equal(fk.calls.length, 0);
});

test('사이트 → Todoist: Todoist 오류는 보고만 하고 던지지 않는다', async () => {
  reset();
  const { result: t } = await mutate({ op: 'task.add', stepId: 1, text: 'x' }, ME);
  const r = await pushToTodoist([{ op: { op: 'task.add' }, result: t }], { token: 'tok', base: 'http://fake.test', fetch: async () => new Response('no', { status: 500 }) });
  assert.equal(r.errors.length, 1);
  assert.equal(r.linked.length, 0);
});

// ── 짝 적기 연산 · 자동 표시 ──
test('todoistId 만 적는 task.update 는 version 없이 · 같은 id 를 두 할 일에 못 적음 · 사람이 단계를 고치면 자동 표시 지움', async () => {
  reset();
  const { result: a } = await mutate({ op: 'task.add', stepId: 1, text: 'a' }, ME);
  const { result: b } = await mutate({ op: 'task.add', stepId: 1, text: 'b' }, ME);
  const op = opSchema.parse({ op: 'task.update', id: a.id, patch: { todoistId: 'ABC123' } });
  await mutate(op, ME);
  const { outcomes } = await mutateMany([opSchema.parse({ op: 'task.update', id: b.id, patch: { todoistId: 'ABC123' } })], ME);
  assert.equal(outcomes[0].status, 409);
  assert.equal(outcomes[0].error.error, 'todoist_linked');
  await send(event('item:added', { id: 'AUTO1', content: '아무 말' }));
  const auto = (await live()).find((t) => t.todoistId === 'AUTO1');
  assert.equal(auto.autoFill, 'default');
  const { result } = await mutate(opSchema.parse({ op: 'task.update', id: auto.id, baseVersion: auto.version, patch: { stepId: 5 } }), ME);
  assert.equal(result.autoFill, null);
});

test('note: 없으면 저장 안 함 · 빈 글/null 이면 지움 · 1000자 넘으면 거절', async () => {
  reset();
  const { result: a } = await mutate(opSchema.parse({ op: 'task.add', stepId: 1, text: 'a' }), ME);
  assert.equal('note' in a, false);
  const { result: b } = await mutate(opSchema.parse({ op: 'task.update', id: a.id, baseVersion: a.version, patch: { note: '자세히' } }), ME);
  assert.equal(b.note, '자세히');
  const { result: c } = await mutate(opSchema.parse({ op: 'task.update', id: a.id, baseVersion: b.version, patch: { note: '  ' } }), ME);
  assert.equal('note' in c, false);
  assert.equal(opSchema.safeParse({ op: 'task.add', stepId: 1, text: 'a', note: 'x'.repeat(1001) }).success, false);
});

test('guide(참고 · 설명서): 없으면 저장 안 함 · 줄바꿈 그대로 · 빈 글/null 이면 지움 · 6000자 넘으면 거절', async () => {
  reset();
  const { result: a } = await mutate(opSchema.parse({ op: 'task.add', stepId: 4, text: '전입신고' }), ME);
  assert.equal('guide' in a, false);
  const md = '## 왜 해야 하나요\n- 주소를 옮겨요\n\n> 평일만 돼요';
  const { result: b } = await mutate(opSchema.parse({ op: 'task.update', id: a.id, baseVersion: a.version, patch: { guide: `  ${md}\n` } }), ME);
  assert.equal(b.guide, md);
  assert.equal(b.version, a.version + 1);
  // 다른 칸과 같은 version 규칙: 옛 version 으로 고치면 충돌
  await assert.rejects(mutate(opSchema.parse({ op: 'task.update', id: a.id, baseVersion: a.version, patch: { guide: 'x' } }), ME), (e) => e instanceof OpError && e.status === 409);
  const { result: c } = await mutate(opSchema.parse({ op: 'task.update', id: a.id, baseVersion: b.version, patch: { guide: '   ' } }), ME);
  assert.equal('guide' in c, false);
  const { result: d } = await mutate(opSchema.parse({ op: 'task.add', stepId: 4, text: 'b', guide: md }), ME);
  assert.equal(d.guide, md);
  const { result: e } = await mutate(opSchema.parse({ op: 'task.update', id: d.id, baseVersion: d.version, patch: { guide: null } }), ME);
  assert.equal('guide' in e, false);
  assert.equal(opSchema.safeParse({ op: 'task.add', stepId: 1, text: 'a', guide: 'x'.repeat(6000) }).success, true);
  assert.equal(opSchema.safeParse({ op: 'task.add', stepId: 1, text: 'a', guide: 'x'.repeat(6001) }).success, false);
  assert.equal(opSchema.safeParse({ op: 'task.update', id: a.id, patch: { guide: 'x'.repeat(6001) } }).success, false);
  assert.equal(opSchema.safeParse({ op: 'task.update', id: a.id, patch: { guide: 3 } }).success, false);
});

test('guide: 옛 데이터(guide 없음)도 그대로 읽히고 고쳐진다', async () => {
  reset();
  // guide · start · parentId · kind · owner 가 없던 때의 할 일 그대로
  const old = { id: 't_old1', stepId: 2, text: '옛 할 일', due: '2026-10-20', done: false, doneBy: null, doneAt: null, version: 3,
    createdAt: '2026-10-15T00:00:00.000Z', createdBy: 'me', updatedAt: '2026-10-15T00:00:00.000Z', updatedBy: 'me', deletedAt: null, deletedBy: null };
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify({ schema: 1, version: 5, updatedAt: null, lastAction: null, steps: {}, tasks: { t_old1: old }, log: [], property: {}, editing: {} }));
  const doc = await readDoc();
  assert.equal(doc.tasks.t_old1.guide, undefined);
  assert.equal(renderMarkdown(doc, STEPS, '2026-10-28T00:00:00Z').includes('옛 할 일'), true);
  const { result } = await mutate(opSchema.parse({ op: 'task.update', id: 't_old1', baseVersion: 3, patch: { guide: '## 어떻게 하나요\n1. 전화' } }), ME);
  assert.equal(result.guide, '## 어떻게 하나요\n1. 전화');
  assert.equal(result.text, '옛 할 일');
  assert.equal(result.due, '2026-10-20');
});

test('guide: Todoist 로 보내지 않음(만들기 본문에 없음 · guide 만 고치면 호출 없음 · 웹훅 반영 뒤에도 남음)', async () => {
  reset();
  const fk = fakeTodoist();
  const cfg = { token: 'tok', base: 'http://fake.test', fetch: fk.fetch };
  const add = opSchema.parse({ op: 'task.add', stepId: 4, text: '전입신고 하기', guide: '## 왜\n긴 설명' });
  const { result: t } = await mutate(add, ME);
  await pushToTodoist([{ op: add, result: t }], cfg);
  assert.equal(fk.calls.length, 1);
  assert.deepEqual(fk.calls[0].body, { content: '전입신고 하기', labels: ['외도민'] });
  assert.equal(JSON.stringify(fk.calls).includes('긴 설명'), false);
  assert.equal('guide' in T.siteState((await readDoc()).tasks[t.id]), false);

  fk.calls.length = 0;
  const cur = (await readDoc()).tasks[t.id];
  const u = opSchema.parse({ op: 'task.update', id: t.id, baseVersion: cur.version, patch: { guide: '## 바뀐 설명' } });
  const { result: t2 } = await mutate(u, ME);
  await pushToTodoist([{ op: u, result: t2 }], cfg);
  assert.equal(fk.calls.length, 0);

  // Todoist 에서 제목을 고쳐 웹훅이 와도 사이트의 guide 는 그대로
  const linked = (await readDoc()).tasks[t.id];
  const r = await send(event('item:updated', { id: linked.todoistId, content: '전입신고 하기(주민센터)' }));
  assert.equal(r.status, 200);
  const after = (await readDoc()).tasks[t.id];
  assert.equal(after.text, '전입신고 하기(주민센터)');
  assert.equal(after.guide, '## 바뀐 설명');
});

test('owner: 남편 · 아내 · 같이만 · null 이면 지움 · Todoist 로 보내지 않음', async () => {
  reset();
  const { result: a } = await mutate(opSchema.parse({ op: 'task.add', stepId: 1, text: 'a', owner: '아내' }), ME);
  assert.equal(a.owner, '아내');
  assert.equal(opSchema.safeParse({ op: 'task.add', stepId: 1, text: 'a', owner: '나' }).success, false);
  await mutate(opSchema.parse({ op: 'task.update', id: a.id, patch: { todoistId: 'OW1' } }), ME);
  const cur = (await readDoc()).tasks[a.id];
  const fk = fakeTodoist();
  const u = opSchema.parse({ op: 'task.update', id: a.id, baseVersion: cur.version, patch: { owner: null } });
  const { result: b } = await mutate(u, ME);
  assert.equal('owner' in b, false);
  await pushToTodoist([{ op: u, result: b }], { token: 'tok', base: 'http://fake.test', fetch: fk.fetch });
  assert.equal(fk.calls.length, 0);
});

// ── 단계 고르기 ──
test('낱말 규칙으로 단계 · 종류 고르기', () => {
  const cases = [
    ['구청 위생과에 등록 가능 여부 전화', 2], ['구청 최종 서류 접수', 9], ['사업계획서 쓰기', 9], ['소화기 2개 사기', 8],
    ['도배 견적 받기', 7], ['욕실 실리콘', 7], ['매트리스 주문', 6], ['세탁기 설치', 6], ['잔금 보내기', 4], ['전입신고', 4],
    ['사진 촬영 예약', 10], ['에어비앤비 리스팅 제목', 11], ['사업자 등록', 13], ['신보 대출 서류', 13], ['현장 실사 준비', 12],
    ['집주인 특약 확인', 3], ['주민 동의서 받기', 5], ['아무 말', null],
  ];
  for (const [text, want] of cases) assert.equal(C.keywordStep(text), want, text);
  assert.equal(C.keywordKind('구청에 전화'), '연락');
  assert.equal(C.keywordKind('소화기 구매'), '구매');
  assert.equal(C.keywordKind('촬영 예약'), '예약');
  assert.equal(C.keywordKind('아무 말'), null);
});

test('종류 「문의」: 저장 검사는 받고, 자동 분류는 고르지 않는다(예전 값 그대로)', () => {
  assert.ok(opSchema.safeParse({ op: 'task.update', id: 't_x', patch: { kind: '문의' } }).success);
  assert.ok(opSchema.safeParse({ op: 'task.update', id: 't_x', patch: { kind: '구매' } }).success);
  assert.ok(!opSchema.safeParse({ op: 'task.update', id: 't_x', patch: { kind: '아무거나' } }).success);
  assert.ok(!C.CLASSIFY_KINDS.includes('문의'));
  assert.equal(C.parseClaudeAnswer('{"step":2,"kind":"문의"}').kind, null);
  assert.equal(C.parseClaudeAnswer('{"step":2,"kind":"연락"}').kind, '연락');
  assert.equal(C.keywordKind('구청에 문의'), '연락');
});

test('단계 고르기: Claude API 성공 · 실패 · 시간 초과 · 이상한 답 → 낱말 규칙 → 기본 단계', async () => {
  const doc = { steps: { 1: { status: 'done' }, 2: { status: 'done' }, 3: { status: 'doing' } } };
  const ok = async (url, init) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(init.headers['x-api-key'], 'k');
    assert.equal(JSON.parse(init.body).model, 'claude-haiku-5-5');
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"step":7,"kind":"공사"}' }] }), { status: 200 });
  };
  assert.deepEqual(await C.guessStep('바닥 손보기', { steps: STEPS, doc, apiKey: 'k', fetch: ok }), { stepId: 7, kind: '공사', by: 'claude' });
  const fail = async () => new Response('err', { status: 529 });
  assert.deepEqual(await C.guessStep('소화기 사기', { steps: STEPS, doc, apiKey: 'k', fetch: fail }), { stepId: 8, kind: '구매', by: 'keyword' });
  const throws = async () => { throw new Error('network'); };
  assert.equal((await C.guessStep('소화기', { steps: STEPS, doc, apiKey: 'k', fetch: throws })).by, 'keyword');
  const slow = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('timeout'))));
  const t0 = Date.now();
  assert.equal((await C.guessStep('소화기', { steps: STEPS, doc, apiKey: 'k', fetch: slow, timeoutMs: 50 })).by, 'keyword');
  assert.ok(Date.now() - t0 < 2000);
  const weird = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"step":99}' }] }), { status: 200 });
  assert.deepEqual(await C.guessStep('아무 말', { steps: STEPS, doc, apiKey: 'k', fetch: weird }), { stepId: 3, kind: null, by: 'default' });
  // 키가 없으면 API 를 부르지 않는다
  let called = false;
  await C.guessStep('아무 말', { steps: STEPS, doc, fetch: async () => { called = true; return new Response('{}'); } });
  assert.equal(called, false);
  assert.equal(C.defaultStep({ steps: {} }), 1);
  assert.equal(C.defaultStep({ steps: { 1: { status: 'done' } } }), 2);
});

// ── 짝 맞추기 도구 ──
test('짝 맞추기: 제목 · 날짜로 짝짓고 연산 묶음 만들기', () => {
  const site = M.loadSite({ doc: { tasks: {
    t_a: { id: 't_a', text: '구청 전화', due: '2026-11-01', done: false, stepId: 2, version: 3, deletedAt: null },
    t_b: { id: 't_b', text: '냉장고 주문', due: null, done: false, stepId: 6, version: 1, deletedAt: null },
    t_c: { id: 't_c', text: '도배 업체 견적 세 곳 받기', due: null, done: false, stepId: 7, version: 1, deletedAt: null },
    t_d: { id: 't_d', text: '사이트에만', due: null, done: false, stepId: 1, version: 1, deletedAt: null },
    t_e: { id: 't_e', text: '이미 짝', due: null, done: false, stepId: 1, version: 1, deletedAt: null, todoistId: 'L1' },
    t_f: { id: 't_f', text: '지운 것', due: null, done: false, stepId: 1, version: 1, deletedAt: '2026-10-01T00:00:00Z' },
  } } });
  const td = M.loadTodoist({ results: [
    { id: 'A', content: '구청 전화', due: { date: '2026-11-01' }, labels: ['외도민'] },
    { id: 'B', content: '냉장고 주문!', due: { date: '2026-11-09' }, labels: ['외도민'] },
    { id: 'C', content: '도배 업체 견적 세곳 받기 (3곳)', due: null, labels: ['외도민'] },
    { id: 'D', content: 'Todoist 에만', due: null, labels: ['외도민'] },
    { id: 'L1', content: '이미 짝', labels: ['외도민'] },
    { id: 'X', content: '구청 전화', labels: ['장보기'] },
  ] }, { linkedIds: site.linkedIds });
  assert.equal(td.skippedNoLabel, 1);
  const res = M.matchTasks(site.tasks, td.tasks);
  const by = Object.fromEntries(res.pairs.map((p) => [p.site.id, [p.todoist.id, p.level]]));
  assert.deepEqual(by.t_a, ['A', '확실']);
  assert.deepEqual(by.t_b, ['B', '날짜다름']);
  assert.deepEqual(by.t_c, ['C', '비슷함']);
  assert.deepEqual(res.siteOnly.map((s) => s.id), ['t_d']);
  assert.deepEqual(res.todoistOnly.map((t) => t.id), ['D']);
  assert.deepEqual(M.opsFor(res.pairs).ops, [{ op: 'task.update', id: 't_a', patch: { todoistId: 'A' } }]);
  assert.equal(M.opsFor(res.pairs, '비슷함').ops.length, 3);
  for (const o of M.opsFor(res.pairs, '비슷함').ops) assert.ok(opSchema.safeParse(o).success);
  const md = M.renderMd(res, { at: 'x', label: '외도민', allLabels: false, min: '확실', siteN: 4, todoistN: 4, linkedN: 1 });
  assert.match(md, /\| 구청 전화 \| 2026-11-01 \| 구청 전화 \|/);
});

// ── 경쟁 상황 ──
const iso = (ms) => new Date(ms).toISOString();
const FAKE = (fk) => ({ token: 'tok', base: 'http://fake.test', fetch: fk.fetch });

test('늦게 온 웹훅: 사이트에서 사람이 더 나중에 고친 칸은 덮지 않고, 안 고친 칸만 받는다', async () => {
  reset();
  const now = Date.now();
  await send(event('item:added', { id: 'LATE', content: '처음 이름', due: { date: '2026-11-01' } }, iso(now - 3600_000)));
  const t0 = (await live())[0];
  await mutate(opSchema.parse({ op: 'task.update', id: t0.id, baseVersion: t0.version, patch: { text: '사이트 새 이름' } }), ME);
  const r = await send(event('item:updated', { id: 'LATE', content: 'Todoist 옛 이름', due: { date: '2026-11-05' } }, iso(now - 1800_000)));
  assert.equal(r.body.action, 'updated');
  const t = (await live())[0];
  assert.equal(t.text, '사이트 새 이름');
  assert.equal(t.due, '2026-11-05');
  assert.equal(t.todoistSent.text, 'Todoist 옛 이름');
  const fk = fakeTodoist();
  await pushTasks([{ id: t.id, intent: 'sync' }], FAKE(fk));
  assert.deepEqual(fk.calls.map((c) => [c.path, c.body]), [['/api/v1/tasks/LATE', { content: '사이트 새 이름' }]]);
  const r2 = await send(event('item:updated', { id: 'LATE', content: '더 옛 이름' }, iso(now - 3000_000)));
  assert.equal(r2.body.reason, 'stale');
});

test('같은 초에 온 웹훅 둘: 둘 다 값으로 견줘 반영(같은 시각은 버리지 않음)', async () => {
  reset();
  const at = iso(Date.parse('2026-10-28T00:00:00Z'));
  await send(event('item:added', { id: 'SAME', content: 'A' }, iso(Date.parse('2026-10-27T23:00:00Z'))));
  let r = await send(event('item:updated', { id: 'SAME', content: 'B' }, at));
  assert.equal(r.body.action, 'updated');
  r = await send(event('item:completed', { id: 'SAME', content: 'B', checked: true }, at));
  assert.equal(r.body.action, 'updated');
  const t = (await live())[0];
  assert.equal(t.text, 'B');
  assert.equal(t.done, true);
});

test('저장소 503 뒤 재시도: 처음엔 던져서 다시 받고, 다시 오면 한 번만 반영 · 또 와도 그대로', async () => {
  reset();
  const ev = event('item:added', { id: 'RETRY', content: '재시도 할 일' });
  const busy = async () => { throw new OpError(503, { error: 'busy' }); };
  await assert.rejects(() => send(ev, { mutate: busy }), (e) => e.status === 503);
  assert.equal((await live()).length, 0);
  let r = await send(ev);
  assert.equal(r.body.action, 'created');
  r = await send(ev);
  assert.equal(r.body.action, 'unchanged');
  assert.equal((await live()).length, 1);
});

test('되돌아온 웹훅: 보낸 값과 같으면 사이트가 그 뒤에 또 고쳤어도 덮지 않는다', async () => {
  reset();
  const fk = fakeTodoist();
  const { result: a } = await mutate(opSchema.parse({ op: 'task.add', stepId: 1, text: '처음' }), ME);
  await pushTasks([{ id: a.id, intent: 'create' }], FAKE(fk));
  let t = (await readDoc()).tasks[a.id];
  await mutate(opSchema.parse({ op: 'task.update', id: a.id, baseVersion: t.version, patch: { text: '둘째' } }), ME);
  await pushTasks([{ id: a.id, intent: 'sync' }], FAKE(fk));
  t = (await readDoc()).tasks[a.id];
  await mutate(opSchema.parse({ op: 'task.update', id: a.id, baseVersion: t.version, patch: { text: '셋째' } }), ME);
  const r = await send(event('item:updated', { id: t.todoistId, content: '둘째' }, iso(Date.now() + 3600_000)));
  assert.equal(r.body.action, 'unchanged');
  assert.equal((await readDoc()).tasks[a.id].text, '셋째');
});

test('추가 직후 체크 · 고치기 · 삭제: 보내기 순서가 뒤집혀도 마지막 상태로', async () => {
  reset();
  let fk = fakeTodoist();
  const add = opSchema.parse({ op: 'task.add', stepId: 1, text: '추가 직후 체크' });
  const { result: a } = await mutate(add, ME);
  const chk = opSchema.parse({ op: 'task.update', id: a.id, patch: { done: true } });
  const { result: a2 } = await mutate(chk, ME);
  await pushToTodoist([{ op: chk, result: a2 }], FAKE(fk));
  assert.equal(fk.calls.length, 0);
  await pushToTodoist([{ op: add, result: a }], FAKE(fk));
  assert.deepEqual(fk.calls.map((c) => `${c.method} ${c.path}`), ['POST /api/v1/tasks', 'POST /api/v1/tasks/NEW1/close']);
  fk.calls.length = 0;
  await pushToTodoist([{ op: chk, result: a2 }], FAKE(fk));
  assert.equal(fk.calls.length, 0);

  reset();
  fk = fakeTodoist();
  const { result: b } = await mutate(add, ME);
  await mutate({ op: 'task.delete', id: b.id }, ME);
  await pushToTodoist([{ op: add, result: b }], FAKE(fk));
  assert.equal(fk.calls.length, 0);

  reset();
  fk = fakeTodoist();
  const { result: c } = await mutate(add, ME);
  let edited = false;
  const racing = async (url, init) => {
    const res = await fk.fetch(url, init);
    if (!edited && new URL(url).pathname === '/api/v1/tasks') {
      edited = true;
      await mutate(opSchema.parse({ op: 'task.update', id: c.id, baseVersion: c.version, patch: { text: '만드는 사이 고침' } }), ME);
    }
    return res;
  };
  await pushToTodoist([{ op: add, result: c }], { token: 'tok', base: 'http://fake.test', fetch: racing });
  assert.deepEqual(fk.calls.map((x) => `${x.method} ${x.path}`), ['POST /api/v1/tasks', 'POST /api/v1/tasks/NEW1']);
  assert.equal(fk.calls[1].body.content, '만드는 사이 고침');
  assert.equal((await readDoc()).tasks[c.id].todoistSent.text, '만드는 사이 고침');
});

test('되돌아온 item:added 가 짝 적기보다 먼저 와도 중복이 안 생긴다(단계 고르기도 안 부름)', async () => {
  reset();
  const fk = fakeTodoist();
  const { result: a } = await mutate(opSchema.parse({ op: 'task.add', stepId: 4, text: '잔금 보내기', due: '2026-11-30' }), ME);
  let classified = 0;
  const racing = async (url, init) => {
    const res = await fk.fetch(url, init);
    if (new URL(url).pathname === '/api/v1/tasks' && init.method === 'POST') {
      await send(event('item:added', { id: 'NEW1', content: '잔금 보내기', due: { date: '2026-11-30' } }), { classify: async () => { classified++; return { stepId: 9, kind: null, by: 'keyword' }; } });
    }
    return res;
  };
  await pushTasks([{ id: a.id, intent: 'create' }], { token: 'tok', base: 'http://fake.test', fetch: racing });
  const all = await live();
  assert.equal(all.length, 1);
  assert.equal(all[0].todoistId, 'NEW1');
  assert.equal(all[0].stepId, 4);
  assert.equal(classified, 0);
  assert.equal(fk.calls.filter((c) => c.method === 'DELETE').length, 0);
});

test('복원: Todoist 지우기가 실패해 아직 있으면 새로 만들지 않음 · 이미 지운 것은 다시 안 지움', async () => {
  reset();
  const fk = fakeTodoist();
  const { result: a } = await mutate(opSchema.parse({ op: 'task.add', stepId: 1, text: '복원 시험' }), ME);
  await pushTasks([{ id: a.id, intent: 'create' }], FAKE(fk));
  await mutate({ op: 'task.delete', id: a.id }, ME);
  const failDelete = async (url, init) => (init.method === 'DELETE' ? new Response('x', { status: 500 }) : fk.fetch(url, init));
  let r = await pushTasks([{ id: a.id, intent: 'sync' }], { token: 'tok', base: 'http://fake.test', fetch: failDelete });
  assert.equal(r.errors.length, 1);
  let t = (await readDoc()).tasks[a.id];
  assert.match(t.todoistError, /DELETE/);
  assert.equal(t.todoistSent.deleted, false);
  await mutate({ op: 'task.restore', id: a.id }, ME);
  fk.calls.length = 0;
  r = await pushTasks([{ id: a.id, intent: 'sync' }], FAKE(fk));
  assert.equal(fk.calls.length, 0);
  t = (await readDoc()).tasks[a.id];
  assert.equal(t.todoistId, 'NEW1');
  assert.equal('todoistError' in t, false);
  await mutate({ op: 'task.delete', id: a.id }, ME);
  await pushTasks([{ id: a.id, intent: 'sync' }], FAKE(fk));
  await pushTasks([{ id: a.id, intent: 'sync' }], FAKE(fk));
  assert.equal(fk.calls.filter((c) => c.method === 'DELETE').length, 1);
  await mutate({ op: 'task.restore', id: a.id }, ME);
  await pushTasks([{ id: a.id, intent: 'sync' }], FAKE(fk));
  assert.equal((await readDoc()).tasks[a.id].todoistId, 'NEW2');
});

test('로컬 연습 저장소 + 진짜 Todoist 주소면 토큰이 있어도 보내지 않는다', async () => {
  reset();
  let called = false;
  const { result: a } = await mutate(opSchema.parse({ op: 'task.add', stepId: 1, text: 'x' }), ME);
  const r = await pushTasks([{ id: a.id, intent: 'create' }], { token: 'tok', fetch: async () => { called = true; return new Response('{}'); } });
  assert.equal(r.skipped, 'local_store');
  assert.equal(called, false);
});

test('반복 할 일: 완료해도 다음 날짜로 넘어가면 checked 를 따른다', async () => {
  reset();
  await send(event('item:added', { id: 'REC', content: '매주 청소', due: { date: '2026-11-01', is_recurring: true } }));
  const r = await send(event('item:completed', { id: 'REC', content: '매주 청소', checked: false, due: { date: '2026-11-08', is_recurring: true } }));
  assert.equal(r.body.action, 'updated');
  const t = (await live())[0];
  assert.equal(t.done, false);
  assert.equal(t.due, '2026-11-08');
});

test('제목 정규화: 사이트 입력과 Todoist 받기가 같다 · 내보내기 메모의 체크박스는 ☐ ☑ 로', async () => {
  assert.equal(opSchema.parse({ op: 'task.add', stepId: 1, text: '  구청\n전화   하기 ' }).text, T.siteText('  구청\n전화   하기 '));
  assert.equal(opSchema.safeParse({ op: 'task.add', stepId: 1, text: ' \n ' }).success, false);
  reset();
  await mutate(opSchema.parse({ op: 'task.add', stepId: 1, text: '메모', note: '- [ ] 하나\n- [x] 둘\n[X] 셋' }), ME);
  const md = renderMarkdown(await readDoc(), [{ id: 1, title: '단계' }], new Date().toISOString());
  assert.ok(!/\[[ xX]\]/.test(md));
  assert.match(md, / {2}- ☐ 하나/);
  assert.match(md, / {2}- ☑ 둘/);
});

test('todoist-sync: 차이 · Todoist 에 없음 · 짝 없음 · Todoist 에만 → 맞추기는 사이트 값으로', async () => {
  reset();
  const fk = fakeTodoist();
  const { result: a } = await mutate(opSchema.parse({ op: 'task.add', stepId: 1, text: '사이트 제목', due: '2026-11-01' }), ME);
  await pushTasks([{ id: a.id, intent: 'create' }], FAKE(fk));
  const { result: b } = await mutate(opSchema.parse({ op: 'task.add', stepId: 1, text: '없어진 것' }), ME);
  await pushTasks([{ id: b.id, intent: 'create' }], FAKE(fk));
  await mutate(opSchema.parse({ op: 'task.add', stepId: 1, text: '짝 없음' }), ME);
  const todoistNow = [
    { id: 'NEW1', content: 'Todoist 에서 바꾼 제목', due: { date: '2026-11-01' }, labels: ['외도민'], checked: false },
    { id: 'ONLY', content: 'Todoist 에만', labels: ['외도민'] },
  ];
  const rows = planSync(await readDoc(), todoistNow);
  assert.deepEqual(rows.map((r) => r.kind).sort(), ['differs', 'missing', 'todoistOnly', 'unpaired']);
  assert.deepEqual(rows.find((r) => r.kind === 'differs').fields, ['text']);
  fk.calls.length = 0;
  await applySync(rows, FAKE(fk));
  assert.deepEqual(fk.calls.map((c) => [c.path, c.body]), [['/api/v1/tasks/NEW1', { content: '사이트 제목' }]]);
});

// ── 시작일 · 세부 항목(1차: 사이트에만) ──
test('세부 항목은 Todoist 에 평평하게 보냄(parent_id 없음) · 시작일은 보내지 않음 · 부모 지우기/되살리기는 세부 항목도 같이 보냄', async () => {
  reset();
  const fk = fakeTodoist();
  const addP = opSchema.parse({ op: 'task.add', stepId: 7, text: '가구 들이기', start: '2026-11-10', due: '2026-11-20' });
  const { result: p } = await mutate(addP, ME);
  await pushToTodoist([{ op: addP, result: p }], FAKE(fk));
  const addC = opSchema.parse({ op: 'task.add', parentId: p.id, text: '침대 주문', start: '2026-11-10', due: '2026-11-12' });
  const { result: c } = await mutate(addC, ME);
  await pushToTodoist([{ op: addC, result: c }], FAKE(fk));
  assert.deepEqual(fk.calls.map((x) => x.body), [
    { content: '가구 들이기', labels: ['외도민'], due_date: '2026-11-20' },
    { content: '침대 주문', labels: ['외도민'], due_date: '2026-11-12' },
  ]);
  // 시작일 · 부모만 바꾸면 Todoist 를 부르지 않는다
  fk.calls.length = 0;
  let cur = (await readDoc()).tasks[c.id];
  const u = opSchema.parse({ op: 'task.update', id: c.id, baseVersion: cur.version, patch: { start: '2026-11-11' } });
  const { result: c2 } = await mutate(u, ME);
  await pushToTodoist([{ op: u, result: c2 }], FAKE(fk));
  assert.equal(fk.calls.length, 0);
  // 부모를 지우면 세부 항목도 Todoist 에서 지운다
  const d = { op: 'task.delete', id: p.id };
  const { result: pd } = await mutate(d, ME);
  await pushToTodoist([{ op: d, result: pd }], FAKE(fk));
  assert.deepEqual(fk.calls.map((x) => `${x.method} ${x.path}`).sort(), ['DELETE /api/v1/tasks/NEW1', 'DELETE /api/v1/tasks/NEW2']);
  // 되살리면 둘 다 다시 만든다(여전히 평평하게)
  fk.calls.length = 0;
  const r = { op: 'task.restore', id: p.id };
  const { result: pr } = await mutate(r, ME);
  await pushToTodoist([{ op: r, result: pr }], FAKE(fk));
  assert.equal(fk.calls.filter((x) => x.method === 'POST' && x.path === '/api/v1/tasks').length, 2);
  assert.ok(fk.calls.every((x) => !x.body || !('parent_id' in x.body)));
  cur = (await readDoc()).tasks[c.id];
  assert.equal(cur.parentId, p.id);
  assert.equal(cur.start, '2026-11-11');
});

test('Todoist 갱신이 start · parentId 를 보존 · 마감일이 시작일보다 앞당겨지면 시작일을 맞춤 · Todoist 에서 부모를 지우면 세부 항목은 뗌', async () => {
  reset();
  const { result: p } = await mutate(opSchema.parse({ op: 'task.add', stepId: 7, text: '부모' }), ME);
  const { result: c } = await mutate(opSchema.parse({ op: 'task.add', parentId: p.id, text: '세부', start: '2026-11-03', due: '2026-11-08' }), ME);
  await mutate(opSchema.parse({ op: 'task.update', id: p.id, patch: { todoistId: 'TP' } }), ME);
  await mutate(opSchema.parse({ op: 'task.update', id: c.id, patch: { todoistId: 'TC' } }), ME);
  // 제목 · 마감일 · 완료를 Todoist 에서 바꿈
  let r = await send(event('item:updated', { id: 'TC', content: '세부 고침', due: { date: '2026-11-09' } }));
  assert.equal(r.body.action, 'updated');
  let t = (await readDoc()).tasks[c.id];
  assert.deepEqual([t.text, t.due, t.start, t.parentId, t.stepId], ['세부 고침', '2026-11-09', '2026-11-03', p.id, 7]);
  r = await send(event('item:completed', { id: 'TC', content: '세부 고침', due: { date: '2026-11-09' }, checked: true }));
  t = (await readDoc()).tasks[c.id];
  assert.deepEqual([t.done, t.start, t.parentId], [true, '2026-11-03', p.id]);
  // 마감일 지우기: 시작일은 그대로
  await send(event('item:updated', { id: 'TC', content: '세부 고침', due: null, checked: true }));
  t = (await readDoc()).tasks[c.id];
  assert.deepEqual([t.due, t.start], [null, '2026-11-03']);
  // 마감일을 시작일보다 앞으로 → 시작일을 마감일로
  await send(event('item:updated', { id: 'TC', content: '세부 고침', due: { date: '2026-11-01' }, checked: true }));
  t = (await readDoc()).tasks[c.id];
  assert.deepEqual([t.due, t.start, t.parentId], ['2026-11-01', '2026-11-01', p.id]);
  // Todoist 에서 부모를 지우면: 부모만 지우고 세부 항목은 맨 위 층으로(Todoist 에선 따로 있는 할 일)
  r = await send(event('item:deleted', { id: 'TP', content: '부모', is_deleted: true }));
  assert.equal(r.body.action, 'deleted');
  const doc = await readDoc();
  assert.notEqual(doc.tasks[p.id].deletedAt, null);
  assert.equal(doc.tasks[c.id].deletedAt, null);
  assert.equal('parentId' in doc.tasks[c.id], false);
  assert.equal(doc.tasks[c.id].start, '2026-11-01');
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
void DATA;
