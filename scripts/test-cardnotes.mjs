#!/usr/bin/env node
// 블록 메모 저장소 · 블록 사진(cardId) 시험(node:test). 운영 저장소에 붙지 않는다: 임시 폴더를 작업 폴더로 삼아 그 안의 .data 만 쓴다.
// 사용: node --test scripts/test-cardnotes.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) delete process.env[k];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnotes-test-'));
process.chdir(tmp);
const FILE = path.join(tmp, '.data', 'cardnotes.json');
const reset = () => fs.rmSync(path.join(tmp, '.data'), { recursive: true, force: true });

const imp = (f) => import(path.join(root, f));
const N = await imp('lib/core/cardnotes.ts');
const P = await imp('lib/core/photos.ts');
const ME = { name: '나' };

test('메모 저장 · 목록(적은 순) · 한 줄로 다듬기', async () => {
  reset();
  assert.equal(N.cardNoteStoreInfo().kind, 'file');
  assert.deepEqual(await N.listCardNotes(), {});
  const a = await N.addCardNote('admin.move-in', '  주민센터  9시\n열어요  ', ME);
  assert.match(a.id, /^n_[0-9a-f]{10}$/);
  assert.equal(a.text, '주민센터 9시 열어요');
  assert.equal(a.by, '나');
  const b = await N.addCardNote('admin.move-in', '신분증 챙기기', { name: '아내' });
  await N.addCardNote('facility.bath', '줄눈 색 회색', ME);
  const all = await N.listCardNotes();
  assert.deepEqual(Object.keys(all).sort(), ['admin.move-in', 'facility.bath']);
  assert.deepEqual(all['admin.move-in'].map((n) => n.id), [a.id, b.id]);
  assert.deepEqual((await N.getCardNotes('admin.move-in')).map((n) => n.text), ['주민센터 9시 열어요', '신분증 챙기기']);
  // 파일 모양: 해시(필드 = 블록 id, 값 = 메모 배열 JSON)
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  assert.equal(JSON.parse(raw['facility.bath'])[0].text, '줄눈 색 회색');
});

test('지우기 · 되돌리기(원래 자리, 두 번 눌러도 하나) · 마지막 메모를 지우면 필드째 사라짐', async () => {
  reset();
  const a = await N.addCardNote('ops.other', '첫째', ME);
  const b = await N.addCardNote('ops.other', '둘째', ME);
  const gone = await N.removeCardNote('ops.other', a.id);
  assert.deepEqual(gone, a);
  assert.deepEqual((await N.getCardNotes('ops.other')).map((n) => n.id), [b.id]);
  await assert.rejects(N.removeCardNote('ops.other', a.id), (e) => e instanceof N.CardNoteError && e.status === 404);
  const back = await N.restoreCardNote('ops.other', gone);
  assert.deepEqual(back, a);
  await N.restoreCardNote('ops.other', gone); // 두 번
  assert.deepEqual((await N.getCardNotes('ops.other')).map((n) => n.id), [a.id, b.id]);
  await N.removeCardNote('ops.other', a.id);
  await N.removeCardNote('ops.other', b.id);
  assert.deepEqual(JSON.parse(fs.readFileSync(FILE, 'utf8')), {});
  assert.deepEqual(await N.listCardNotes(), {});
});

test('형식 검사: 블록 id · 메모 id · 빈 글 · 500자', async () => {
  reset();
  await assert.rejects(N.addCardNote('move-in', 'x', ME), (e) => e.status === 400);          // 분야 없음
  await assert.rejects(N.addCardNote('__proto__', 'x', ME), (e) => e.status === 400);
  await assert.rejects(N.addCardNote('money.x', 'x', ME), (e) => e.status === 400);          // 모르는 분야
  await assert.rejects(N.addCardNote('admin.move-in', '   ', ME), (e) => e.code === 'empty');
  assert.equal((await N.addCardNote('admin.move-in', 'x'.repeat(500), ME)).text.length, 500);
  await assert.rejects(N.addCardNote('admin.move-in', 'x'.repeat(501), ME), (e) => e.code === 'too_long');
  await assert.rejects(N.addCardNote('admin.move-in', 3, ME), (e) => e.status === 400);
  await assert.rejects(N.removeCardNote('admin.move-in', 'zz'), (e) => e.status === 400);
  await assert.rejects(N.restoreCardNote('admin.move-in', { id: 'n_0123456789', text: 'x', at: 'nope' }), (e) => e.status === 400);
  // 손으로 넣은 엉뚱한 필드 · 깨진 값은 목록에서 빠진다
  fs.writeFileSync(FILE, JSON.stringify({ 'admin.move-in': '[{"id":"n_0123456789","text":"ok","at":"2026-10-28T00:00:00.000Z","by":"나"},{"bad":1}]', junk: '[]', 'ops.other': 'not json' }));
  assert.deepEqual(Object.keys(await N.listCardNotes()), ['admin.move-in']);
  assert.equal((await N.getCardNotes('admin.move-in')).length, 1);
});

test('동시에 더해도 서로 덮지 않는다', async () => {
  reset();
  await Promise.all(Array.from({ length: 8 }, (_, i) => N.addCardNote('facility.wall', `메모 ${i}`, ME)));
  assert.equal((await N.getCardNotes('facility.wall')).length, 8);
});

// ── 블록 사진(cardId) ──
const sharp = (await import('sharp')).default;
const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#888' } }).png().toBuffer();

test('사진 cardId: 블록 사진에만 키가 붙고, 옛 사진(키 없음)은 null 로 읽힌다', async () => {
  reset();
  const m = await P.addPhoto({ stepId: 4, by: '나', data: png, cardId: 'admin.move-in' });
  assert.equal(m.cardId, 'admin.move-in');
  assert.equal(P.toView(m).cardId, 'admin.move-in');
  assert.equal(P.toView(m).taskId, null);
  const plain = await P.addPhoto({ stepId: 4, by: '나', data: png });
  assert.equal(Object.hasOwn(plain, 'cardId'), false); // 키를 만들지 않는다
  assert.equal(P.toView(plain).cardId, null);
  // 옛 메타(2026-10-28 전 — taskId · cardId 둘 다 없음)도 그대로 읽힌다
  const old = { ...plain }; delete old.taskId; delete old.cardId;
  assert.equal(P.toView(old).cardId, null);
  assert.equal(P.toView(old).taskId, null);
  const list = await P.listPhotos();
  assert.deepEqual(list.map((x) => x.cardId ?? '-').sort(), ['-', 'admin.move-in']);
});

test('사진 cardId: 형식 검사 · 할 일과 같이 못 붙임 · 지우고 되살리기', async () => {
  reset();
  await assert.rejects(P.addPhoto({ stepId: 4, by: '나', data: png, cardId: 'admin/../x' }), (e) => e instanceof P.PhotoError && e.code === 'card_invalid');
  await assert.rejects(P.addPhoto({ stepId: 4, by: '나', data: png, cardId: 'admin.move-in', taskId: 't_abc' }), (e) => e.status === 400);
  const m = await P.addPhoto({ stepId: 6, by: '나', data: png, cardId: 'facility.bath' });
  const del = await P.deletePhoto(m.id, '나');
  assert.ok(del.deletedAt);
  assert.equal(del.cardId, 'facility.bath');
  const back = await P.updatePhoto(m.id, { restore: true }, '나');
  assert.equal(back.deletedAt, null);
  assert.equal(back.cardId, 'facility.bath');
});
