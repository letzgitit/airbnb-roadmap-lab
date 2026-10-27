#!/usr/bin/env node
// 할 일 설명서 저장소 시험(node:test). 운영 저장소에 붙지 않는다: 임시 폴더를 작업 폴더로 삼아 그 안의 .data/guides.json · progress.json 만 쓴다.
// 사용: node --test scripts/test-guides.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) delete process.env[k];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guides-test-'));
process.chdir(tmp);
const FILE = path.join(tmp, '.data', 'guides.json');
const reset = () => fs.rmSync(path.join(tmp, '.data'), { recursive: true, force: true });

const imp = (f) => import(path.join(root, f));
const G = await imp('lib/core/guides.ts');
const { mutate, readDoc } = await imp('lib/core/engine.ts');
const ME = { name: '나' };

test('저장 · 같은 글은 version 그대로 · 409 · 빈 글이면 지움', async () => {
  reset();
  assert.equal(G.guideStoreInfo().kind, 'file');
  assert.equal(await G.getGuide('t_a1'), null);
  const a = await G.putGuide('t_a1', '  ## 왜\n- 하나\r\n', 0, ME);
  assert.equal(a.md, '## 왜\n- 하나');
  assert.equal(a.version, 1);
  assert.equal(a.updatedBy, '나');
  assert.deepEqual(await G.getGuide('t_a1'), a);
  assert.equal((await G.putGuide('t_a1', '## 왜\n- 하나', 1, ME)).version, 1); // 같은 글
  const b = await G.putGuide('t_a1', '## 왜\n- 둘', 1, ME);
  assert.equal(b.version, 2);
  await assert.rejects(G.putGuide('t_a1', 'x', 1, ME), (e) => e instanceof G.GuideError && e.status === 409 && e.current.version === 2);
  await assert.rejects(G.putGuide('t_new', 'x', 3, ME), (e) => e.status === 409 && e.current === null); // 없는데 0 이 아님
  await assert.rejects(G.putGuide('t_a1', 'x', undefined, ME), (e) => e.status === 400 && e.code === 'baseVersion_required');
  assert.equal(await G.putGuide('t_a1', '   ', 2, ME), null);
  assert.equal(await G.getGuide('t_a1'), null);
  assert.equal(await G.putGuide('t_none', '', 0, ME), null); // 없는 것을 지움 = 아무 일 없음
  assert.deepEqual(JSON.parse(fs.readFileSync(FILE, 'utf8')), {});
});

test('길이 제한 6000자 · id 형식', async () => {
  reset();
  assert.equal((await G.putGuide('t_long', 'x'.repeat(6000), 0, ME)).md.length, 6000);
  await assert.rejects(G.putGuide('t_long2', 'x'.repeat(6001), 0, ME), (e) => e.status === 400 && e.code === 'too_long');
  await assert.rejects(G.putGuide('__proto__', 'x', 0, ME), (e) => e.status === 400);
  await assert.rejects(G.getGuide('p_abc'), (e) => e.status === 400);
  await assert.rejects(G.putGuide('t_x', 3, 0, ME), (e) => e.status === 400);
});

test('목록: 지운 할 일 · 현황에 없는 할 일은 빼고 { len, version } 만', async () => {
  reset();
  const { result: a } = await mutate({ op: 'task.add', stepId: 4, text: '전입신고' }, { email: 'me@x', name: '나' });
  const { result: b } = await mutate({ op: 'task.add', stepId: 4, text: '지울 일' }, { email: 'me@x', name: '나' });
  await G.putGuide(a.id, '## 왜\n가', 0, ME);
  await G.putGuide(b.id, '## 왜\n나다', 0, ME);
  await G.putGuide('t_ghost', '없는 할 일', 0, ME);
  await mutate({ op: 'task.delete', id: b.id }, { email: 'me@x', name: '나' });
  const idx = G.guideIndex(await G.listGuides(), await readDoc());
  assert.deepEqual(idx, { [a.id]: { len: 6, version: 1 } });
  assert.notEqual(await G.getGuide(b.id), null); // 지운 할 일의 설명서는 남는다(되살리기 대비)
  await mutate({ op: 'task.restore', id: b.id }, { email: 'me@x', name: '나' });
  assert.equal(Object.keys(G.guideIndex(await G.listGuides(), await readDoc())).length, 2);
});

test('import: 미리 보기 · 새로/바꿈/지움/그대로 · 틀린 것이 하나라도 있으면 아무것도 안 씀', async () => {
  reset();
  await G.putGuide('t_keep', '그대로', 0, ME);
  await G.putGuide('t_upd', '옛 글', 0, ME);
  await G.putGuide('t_del', '지울 글', 0, ME);
  const map = { t_new: '## 새 글', t_keep: '그대로', t_upd: '새 글', t_del: '' };
  const dry = await G.importGuides(map, ME, { dryRun: true, doc: { tasks: {} } });
  assert.deepEqual(dry, { created: ['t_new'], updated: ['t_upd'], deleted: ['t_del'], unchanged: ['t_keep'], missingTask: ['t_new', 't_keep', 't_upd', 't_del'] });
  assert.equal(await G.getGuide('t_new'), null); // dry-run 은 쓰지 않음
  await G.importGuides(map, ME);
  assert.equal((await G.getGuide('t_new')).md, '## 새 글');
  assert.equal((await G.getGuide('t_upd')).version, 2);
  assert.equal(await G.getGuide('t_del'), null);
  await assert.rejects(G.importGuides({ t_ok: 'a', t_bad: 'x'.repeat(6001) }, ME), (e) => e.status === 400);
  assert.equal(await G.getGuide('t_ok'), null);
  await assert.rejects(G.importGuides(['x'], ME), (e) => e.status === 400);
});

test('CLI: [저장소] 첫 줄 · import --dry-run 은 쓰지 않음 · 오타 옵션 · 형식 오류', () => {
  reset();
  // CLI 는 저장소 루트로 옮겨 돌므로 루트 .data 를 건드리지 않는 것(dry-run · 오류)만 확인한다. 쓰기 자체는 위 importGuides 시험이 본다
  const json = path.join(tmp, 'g.json');
  fs.writeFileSync(json, JSON.stringify({ t_cli1: '## 왜\n가' }));
  const run = (...args) => spawnSync(process.execPath, [path.join(root, 'scripts/guides.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, KV_REST_API_URL: '', KV_REST_API_TOKEN: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' }, cwd: tmp });
  const r = run('import', json, '--dry-run');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /^\[저장소\] file \.data\/guides\.json {2}\(로컬 연습용\)/);
  assert.equal(JSON.parse(r.stdout).written, false);
  assert.deepEqual(JSON.parse(r.stdout).created, ['t_cli1']);
  assert.equal(run('import', json, '--dryrun').status, 2); // 오타 옵션은 쓰지 않고 끝
  fs.writeFileSync(json, JSON.stringify({ t_cli1: 'x'.repeat(6001) }));
  assert.equal(run('import', json, '--dry-run').status, 1);
});
