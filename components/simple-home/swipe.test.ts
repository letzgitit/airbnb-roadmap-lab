// 데일리 src/lib/view/__tests__/swipe.test.ts 를 옮기고, 분야 탭 순서로 이웃 탭을 한 번 더 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followOffset, lockAxis, neighborKey, shouldCommit } from './swipe.ts';
import { TABS } from './home-model.ts';

test('방향 잠그기 — 가로가 확실할 때만 x', () => {
  assert.equal(lockAxis(5, 0), null);
  assert.equal(lockAxis(12, 4), 'x');
  assert.equal(lockAxis(-30, 18), 'x');
  assert.equal(lockAxis(-30, 25), 'y'); // 비율 미달 → 세로로 보고 놓아 준다
  assert.equal(lockAxis(-30, 5), 'x');
  assert.equal(lockAxis(8, 14), 'y');
  assert.equal(lockAxis(15, 12), 'y');
  assert.equal(lockAxis(0, -40), 'y');
});

test('이웃 탭 — 끝 · 없는 현재는 null', () => {
  const k = ['home', 'ai', 'estate', 'rank'];
  assert.equal(neighborKey(k, 'ai', -1), 'estate');
  assert.equal(neighborKey(k, 'ai', 1), 'home');
  assert.equal(neighborKey(k, 'home', 1), null);
  assert.equal(neighborKey(k, 'rank', -1), null);
  assert.equal(neighborKey(k, '', -1), null);
  assert.equal(neighborKey(k, 'zzz', -1), null);
});

test('분야 탭 순서 — 왼쪽으로 쓸면 다음, 오른쪽으로 쓸면 이전, 양 끝은 멈춤', () => {
  const k = TABS.map((t) => t.id);
  assert.equal(neighborKey(k, 'admin', -1), 'facility');
  assert.equal(neighborKey(k, 'gallery', -1), 'contacts');
  assert.equal(neighborKey(k, 'gallery', 1), 'ops');
  assert.equal(neighborKey(k, 'admin', 1), null);
  assert.equal(neighborKey(k, 'calendar', -1), null);
});

test('따라가기 · 저항', () => {
  assert.equal(followOffset(80, true), 80);
  assert.equal(followOffset(80, false), 20);
  assert.equal(followOffset(-400, false), -36);
});

test('넘길지 — 25% 또는 빠른 플릭', () => {
  assert.equal(shouldCommit(-100, 400, 500, true), true);
  assert.equal(shouldCommit(-99, 400, 500, true), false);
  assert.equal(shouldCommit(-60, 400, 100, true), true);
  assert.equal(shouldCommit(-20, 400, 10, true), false);
  assert.equal(shouldCommit(-300, 400, 100, false), false);
});
