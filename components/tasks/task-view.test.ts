// 할 일 줄 · 폼 계산 확인(node --test, 새 의존성 없이). 값은 모두 가짜다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeOf, placePatch, placeStep, shiftLabel, shiftPatch, spanDate, taskPhase, treeRows } from './task-view.ts';

test('할 일 줄의 때: 지남 › 곧 마감(3일 안) › 준비할 때(시작일 ~ 마감)', () => {
  const today = '2026-10-28';
  assert.equal(taskPhase({ done: false, due: '2026-10-27' }, today), 'late');
  assert.equal(taskPhase({ done: false, due: '2026-10-28' }, today), 'soon');
  assert.equal(taskPhase({ done: false, due: '2026-10-31' }, today), 'soon');
  assert.equal(taskPhase({ done: false, due: '2026-11-01' }, today), null);
  assert.equal(taskPhase({ done: false, due: '2026-11-06', start: '2026-10-28' }, today), 'prep');
  assert.equal(taskPhase({ done: false, due: '2026-11-06', start: '2026-10-29' }, today), null);   // 아직 시작 전
  assert.equal(taskPhase({ done: false, due: '2026-10-30', start: '2026-10-20' }, today), 'soon');  // 곧 마감이 먼저
  assert.equal(taskPhase({ done: false, due: null, start: '2026-10-20' }, today), 'prep');
  assert.equal(taskPhase({ done: true, due: '2026-10-27' }, today), null);
});

test('보조 줄 날짜: 시작일이 있을 때만 범위', () => {
  assert.equal(spanDate('2026-10-28', '2026-10-30'), '10/28~10/30');
  assert.equal(spanDate('2026-10-28', null), '10/28~');
  assert.equal(spanDate('2026-10-30', '2026-10-30'), null);
  assert.equal(spanDate(null, '2026-10-30'), null);
  assert.equal(spanDate(undefined, null), null);
});

test('부모 바로 뒤에 세부 항목, 부모가 목록에 없으면 부모 제목을 붙인다', () => {
  const all = {
    a: { id: 'a', text: '위 할 일 A' },
    b: { id: 'b', text: '세부 B', parentId: 'a' },
    c: { id: 'c', text: '다른 일 C' },
    d: { id: 'd', text: '세부 D', parentId: 'x' },
    x: { id: 'x', text: '끝난 부모 X' },
  };
  const rows = treeRows([all.b, all.c, all.a, all.d], all);
  assert.deepEqual(rows.map((r) => [r.item.id, r.depth, r.parentTitle ?? '']), [
    ['c', 0, ''], ['a', 0, ''], ['b', 1, ''], ['d', 0, '끝난 부모 X'],
  ]);
});

test('넣을 곳 패치', () => {
  assert.equal(placeOf({ stepId: 3 }), 's:3');
  assert.equal(placeOf({ stepId: 3, parentId: 't_a' }), 'p:t_a');
  assert.deepEqual(placePatch('s:3', 's:3'), {});
  assert.deepEqual(placePatch('s:3', 's:5'), { stepId: 5 });
  assert.deepEqual(placePatch('s:3', 'p:t_a'), { parentId: 't_a' });
  assert.deepEqual(placePatch('p:t_a', 's:3'), { parentId: null, stepId: 3 });
  assert.deepEqual(placePatch('p:t_a', 'p:t_b'), { parentId: 't_b' });
  assert.equal(placeStep('s:4', {}), 4);
  assert.equal(placeStep('p:t_a', { t_a: { stepId: 2 } }), 2);
  assert.equal(placeStep('p:t_z', {}), null);
});

test('일정 옮기기: 시작일도 같은 날수만큼(달 넘김 포함)', () => {
  assert.deepEqual(shiftPatch({ due: '2026-10-30', start: '2026-10-28' }, 7), { due: '2026-11-06', start: '2026-11-04' });
  assert.deepEqual(shiftPatch({ due: '2026-10-30' }, -3), { due: '2026-10-27' });
  assert.equal(shiftPatch({ due: null, start: '2026-10-28' }, 7), null);
  assert.equal(shiftLabel({ due: '2026-10-30', start: '2026-10-28' }, 7), '10/28~10/30 → 11/4~11/6');
  assert.equal(shiftLabel({ due: '2026-10-30' }, 7), '10/30 → 11/6');
});
