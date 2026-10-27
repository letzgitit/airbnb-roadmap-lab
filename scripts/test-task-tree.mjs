#!/usr/bin/env node
// 할 일 시작일(start) · 세부 항목(parentId) 규칙 시험(node:test). 운영 저장소에 붙지 않는다:
// 임시 폴더를 작업 폴더로 삼아 그 안의 .data/progress.json 만 쓴다. 값은 모두 가짜다.
// 사용: node --test scripts/test-task-tree.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'TODOIST_API_TOKEN', 'TODOIST_API_BASE']) delete process.env[k];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-tree-test-'));
process.chdir(tmp);

const imp = (f) => import(path.join(root, f));
const { mutate, mutateMany, readDoc, parseDoc } = await imp('lib/core/engine.ts');
const { opSchema } = await imp('lib/core/validate.ts');
const { renderMarkdown } = await imp('lib/core/markdown.ts');
const { taskStart, treeOrder } = await imp('lib/core/task-tree.ts');
const { getStore } = await imp('lib/core/store.ts');

const ME = { email: 'me@example.test', name: 'me' };
const reset = () => fs.rmSync(path.join(tmp, '.data'), { recursive: true, force: true });
const run = async (op) => mutate(opSchema.parse(op), ME);
// 실패할 연산: 엔진 결과(상태 · 까닭 코드)
const fail = async (op) => {
  const { outcomes } = await mutateMany([opSchema.parse(op)], ME);
  assert.equal(outcomes[0].ok, false, `실패해야 함: ${JSON.stringify(op)}`);
  return { status: outcomes[0].status, error: outcomes[0].error.error, message: outcomes[0].error.message };
};
const get = async (id) => (await readDoc()).tasks[id];

test('옛 데이터: start · parentId 가 없는 할 일도 그대로 읽히고 고쳐진다', async () => {
  reset();
  const old = {
    schema: 1, version: 3, updatedAt: null, lastAction: null, steps: {}, log: [], property: {}, editing: {},
    tasks: { t_old1: { id: 't_old1', stepId: 2, text: '옛 할 일', due: '2026-11-01', done: false, doneBy: null, doneAt: null, version: 1, createdAt: '2026-10-01T00:00:00Z', createdBy: 'a', updatedAt: '2026-10-01T00:00:00Z', updatedBy: 'a', deletedAt: null, deletedBy: null } },
  };
  await getStore().cas(null, JSON.stringify(old));
  const t = await get('t_old1');
  assert.equal('start' in t, false);
  assert.equal('parentId' in t, false);
  assert.equal(taskStart(t), '2026-11-01');
  const { result } = await run({ op: 'task.update', id: 't_old1', baseVersion: 1, patch: { text: '옛 할 일 고침' } });
  assert.equal('start' in result, false);
  assert.equal('parentId' in result, false);
  assert.equal(parseDoc(JSON.stringify(old)).tasks.t_old1.text, '옛 할 일');
});

test('시작일: 저장 · 지우기(null 이면 키 없음) · 마감일보다 늦으면 거절(추가 · 고치기 · 마감만 당기기)', async () => {
  reset();
  const { result: a } = await run({ op: 'task.add', stepId: 1, text: 'a', start: '2026-11-01', due: '2026-11-05' });
  assert.equal(a.start, '2026-11-01');
  assert.equal(taskStart(a), '2026-11-01');
  assert.equal(taskStart({ due: null }), null);
  // 시작일만(마감일 없음)도 된다
  const { result: b } = await run({ op: 'task.add', stepId: 1, text: 'b', start: '2026-11-03' });
  assert.equal(b.start, '2026-11-03');
  // 검증 단계(zod)에서 거절
  assert.equal(opSchema.safeParse({ op: 'task.add', stepId: 1, text: 'x', start: '2026-11-06', due: '2026-11-05' }).success, false);
  assert.equal(opSchema.safeParse({ op: 'task.update', id: a.id, patch: { start: '2026-11-06', due: '2026-11-05' } }).success, false);
  assert.equal(opSchema.safeParse({ op: 'task.add', stepId: 1, text: 'x', start: '2026-11-31' }).success, false);
  // 엔진: 지금 값과 합쳐서 본다 — 마감일만 시작일보다 앞으로 당기면 거절
  let f = await fail({ op: 'task.update', id: a.id, baseVersion: a.version, patch: { due: '2026-10-30' } });
  assert.deepEqual([f.status, f.error], [400, 'start_after_due']);
  f = await fail({ op: 'task.update', id: a.id, baseVersion: a.version, patch: { start: '2026-11-09' } });
  assert.equal(f.error, 'start_after_due');
  // 둘 다 같이 옮기면 된다
  const { result: a2 } = await run({ op: 'task.update', id: a.id, baseVersion: a.version, patch: { start: '2026-10-28', due: '2026-10-30' } });
  assert.deepEqual([a2.start, a2.due], ['2026-10-28', '2026-10-30']);
  const { result: a3 } = await run({ op: 'task.update', id: a.id, baseVersion: a2.version, patch: { start: null } });
  assert.equal('start' in a3, false);
});

test('세부 항목: 부모 단계를 따름 · 단계가 다르면 거절 · 없는 부모 · 지운 부모 · 자기 자신 · 세부 항목 밑(한 층) 거절', async () => {
  reset();
  const { result: p } = await run({ op: 'task.add', stepId: 4, text: '부모' });
  // stepId 없이 parentId 만으로 → 부모 단계
  const { result: c } = await run({ op: 'task.add', parentId: p.id, text: '세부' });
  assert.equal(c.stepId, 4);
  assert.equal(c.parentId, p.id);
  // 같은 단계를 같이 줘도 된다
  const { result: c2 } = await run({ op: 'task.add', stepId: 4, parentId: p.id, text: '세부2' });
  assert.equal(c2.parentId, p.id);
  // 단계가 다르면 거절
  assert.equal((await fail({ op: 'task.add', stepId: 5, parentId: p.id, text: 'x' })).error, 'step_mismatch');
  // 단계도 부모도 없으면 검증에서 거절
  assert.equal(opSchema.safeParse({ op: 'task.add', text: 'x' }).success, false);
  // 없는 부모
  let f = await fail({ op: 'task.add', parentId: 't_nothere', text: 'x' });
  assert.deepEqual([f.status, f.error], [400, 'parent_not_found']);
  assert.ok(f.message);
  // id 모양이 틀린 부모(t_ 아님)
  assert.equal(opSchema.safeParse({ op: 'task.add', parentId: 'l_abc', text: 'x' }).success, false);
  // 세부 항목 밑에 세부 항목(두 층) 거절
  assert.equal((await fail({ op: 'task.add', parentId: c.id, text: 'x' })).error, 'parent_is_child');
  // 고치기로도 한 층
  const { result: other } = await run({ op: 'task.add', stepId: 1, text: '다른' });
  assert.equal((await fail({ op: 'task.update', id: other.id, baseVersion: other.version, patch: { parentId: c.id } })).error, 'parent_is_child');
  // 자기 자신
  assert.equal((await fail({ op: 'task.update', id: other.id, baseVersion: other.version, patch: { parentId: other.id } })).error, 'parent_self');
  // 지운 부모
  const { result: gone } = await run({ op: 'task.add', stepId: 1, text: '지울 것' });
  await run({ op: 'task.delete', id: gone.id });
  assert.equal((await fail({ op: 'task.add', parentId: gone.id, text: 'x' })).error, 'parent_deleted');
});

test('세부 항목이 있는 할 일은 다른 할 일 밑으로 못 넣음 · 다른 할 일을 부모로 지정하면 그 단계로 옮겨짐 · null 이면 뗌', async () => {
  reset();
  const { result: p } = await run({ op: 'task.add', stepId: 2, text: '부모' });
  const { result: q } = await run({ op: 'task.add', stepId: 6, text: '다른 부모' });
  await run({ op: 'task.add', parentId: p.id, text: '세부' });
  // p 는 세부 항목이 있어 q 밑으로 못 넣는다
  assert.equal((await fail({ op: 'task.update', id: p.id, baseVersion: p.version, patch: { parentId: q.id } })).error, 'has_children');
  // 맨 위 층 할 일을 q 밑으로 → 단계가 q 의 단계로
  const { result: x } = await run({ op: 'task.add', stepId: 1, text: '옮길 것' });
  const { result: x2 } = await run({ op: 'task.update', id: x.id, baseVersion: x.version, patch: { parentId: q.id } });
  assert.deepEqual([x2.parentId, x2.stepId], [q.id, 6]);
  // 부모를 정하면서 다른 단계를 같이 주면 거절
  const { result: y } = await run({ op: 'task.add', stepId: 1, text: 'y' });
  assert.equal((await fail({ op: 'task.update', id: y.id, baseVersion: y.version, patch: { parentId: q.id, stepId: 3 } })).error, 'step_mismatch');
  // 세부 항목의 단계만 따로 옮기기는 거절 · 같은 단계를 보내는 것은 괜찮다(화면 편집이 stepId 를 늘 같이 보냄)
  assert.equal((await fail({ op: 'task.update', id: x.id, baseVersion: x2.version, patch: { stepId: 3 } })).error, 'step_mismatch');
  const { result: x3 } = await run({ op: 'task.update', id: x.id, baseVersion: x2.version, patch: { text: '옮길 것!', stepId: 6 } });
  assert.equal(x3.text, '옮길 것!');
  // 떼면서 다른 단계로
  const { result: x4 } = await run({ op: 'task.update', id: x.id, baseVersion: x3.version, patch: { parentId: null, stepId: 3 } });
  assert.equal('parentId' in x4, false);
  assert.equal(x4.stepId, 3);
});

test('부모 단계를 옮기면 세부 항목(지운 것 포함)도 같이 옮겨진다', async () => {
  reset();
  const { result: p } = await run({ op: 'task.add', stepId: 2, text: '부모' });
  const { result: a } = await run({ op: 'task.add', parentId: p.id, text: 'a' });
  const { result: b } = await run({ op: 'task.add', parentId: p.id, text: 'b' });
  await run({ op: 'task.delete', id: b.id });
  const { result: p2 } = await run({ op: 'task.update', id: p.id, baseVersion: p.version, patch: { stepId: 9 } });
  assert.equal(p2.stepId, 9);
  const doc = await readDoc();
  assert.equal(doc.tasks[a.id].stepId, 9);
  assert.equal(doc.tasks[a.id].version, a.version + 1);
  assert.equal(doc.tasks[b.id].stepId, 9);
});

test('부모를 지우면 세부 항목도 같이 · 되살리면 그때 같이 지운 것만 같이 되살아남', async () => {
  reset();
  const { result: p } = await run({ op: 'task.add', stepId: 2, text: '부모' });
  const { result: a } = await run({ op: 'task.add', parentId: p.id, text: 'a' });
  const { result: b } = await run({ op: 'task.add', parentId: p.id, text: 'b' });
  const { result: early } = await run({ op: 'task.add', parentId: p.id, text: '먼저 지운 것' });
  await run({ op: 'task.delete', id: early.id });
  await new Promise((r) => setTimeout(r, 5)); // 지운 시각이 달라지게
  const { result: pd } = await run({ op: 'task.delete', id: p.id });
  let doc = await readDoc();
  assert.equal(doc.tasks[a.id].deletedAt, pd.deletedAt);
  assert.equal(doc.tasks[b.id].deletedAt, pd.deletedAt);
  assert.match(doc.lastAction.text, /세부 항목 2개 같이/);
  // 세부 항목만 먼저 되살리면 거절(부모부터)
  assert.equal((await fail({ op: 'task.restore', id: a.id })).error, 'parent_deleted');
  await run({ op: 'task.restore', id: p.id });
  doc = await readDoc();
  assert.equal(doc.tasks[p.id].deletedAt, null);
  assert.equal(doc.tasks[a.id].deletedAt, null);
  assert.equal(doc.tasks[b.id].deletedAt, null);
  assert.notEqual(doc.tasks[early.id].deletedAt, null); // 따로 먼저 지운 것은 그대로
  // 부모가 살아 있으면 따로 지운 세부 항목도 되살릴 수 있다(부모 밑 그대로)
  const { result: e2 } = await run({ op: 'task.restore', id: early.id });
  assert.equal(e2.parentId, p.id);
});

test('부모가 정리돼 없어지면 세부 항목은 맨 위 층으로(되살릴 때도)', async () => {
  reset();
  const { result: p } = await run({ op: 'task.add', stepId: 2, text: '부모' });
  const { result: a } = await run({ op: 'task.add', parentId: p.id, text: 'a' });
  await run({ op: 'task.delete', id: a.id });
  // 부모를 저장소에서 직접 빼서 「30일 지나 정리됨」을 흉내
  const store = getStore();
  const raw = await store.read();
  const d = JSON.parse(raw);
  delete d.tasks[p.id];
  await store.cas(raw, JSON.stringify(d));
  const { result: a2 } = await run({ op: 'task.restore', id: a.id });
  assert.equal(a2.deletedAt, null);
  assert.equal('parentId' in a2, false);
  // 정리 때도 남은 세부 항목의 부모 표시를 지운다
  const { result: q } = await run({ op: 'task.add', stepId: 1, text: 'q' });
  const { result: k } = await run({ op: 'task.add', parentId: q.id, text: 'k' });
  const raw2 = await store.read();
  const d2 = JSON.parse(raw2);
  delete d2.tasks[q.id];
  await store.cas(raw2, JSON.stringify(d2));
  await run({ op: 'log.add', kind: '메모', text: '아무 쓰기' });
  assert.equal('parentId' in (await get(k.id)), false);
});

test('트리 순서 · 마크다운 내보내기: 세부 항목을 부모 밑에 들여 쓰고 시작일을 보인다', async () => {
  reset();
  const { result: p } = await run({ op: 'task.add', stepId: 7, text: '가구 들이기', start: '2026-11-10', due: '2026-11-20' });
  await run({ op: 'task.add', parentId: p.id, text: '침대 주문', due: '2026-11-12' });
  await run({ op: 'task.add', stepId: 7, text: '따로 할 일', due: '2026-11-15' });
  const md = renderMarkdown(await readDoc(), [{ id: 7, title: '인테리어' }], '2026-11-01T00:00:00Z');
  const lines = md.split('\n');
  const i = lines.findIndex((l) => l.startsWith('- ☐ 가구 들이기'));
  assert.ok(i >= 0, md);
  assert.match(lines[i], /2026-11-10 ~ 마감 2026-11-20/);
  assert.equal(lines[i + 1], '  - ☐ 침대 주문 · 마감 2026-11-12');
  // 맨 위 층끼리는 마감일 순(따로 할 일 11-15 → 가구 들이기 11-20), 세부 항목은 제 마감일과 상관없이 부모 밑
  assert.ok(lines.findIndex((l) => l.startsWith('- ☐ 따로 할 일')) < i);
  // 부모가 목록에 없으면 맨 위 층 + 표시
  const order = treeOrder([{ id: 'c', parentId: 'p' }, { id: 'x' }]);
  assert.deepEqual(order.map((o) => [o.item.id, o.depth, o.orphanOf]), [['c', 0, 'p'], ['x', 0, undefined]]);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
