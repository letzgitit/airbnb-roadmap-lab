// 할 일 메모 안 체크리스트 확인(node --test). 예시 글은 일반 물건 이름만 — 개인정보 없음.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, checkItems, cleanNote, insertCheckLine, memoParts, memoSummary, noteOp, plainMemo, refOf, retryOnConflict, setItem } from './checklist.ts';

const NOTE = '전화 가게 02-000-0000\n「휴지 있나요?」\n- 몇 시까지 여나\n- [ ] 화장지\n- [x] 수건\n- [X] 샴푸\n- [ ]   \n* [ ] 칫솔';

test('체크 줄 해석: - [ ] · - [x] · - [X] · * [ ], 글 없는 체크 줄 · 「- 」 질문 줄은 글', () => {
  const items = checkItems(NOTE);
  assert.deepEqual(items.map((x) => [x.text, x.done]), [['화장지', false], ['수건', true], ['샴푸', true], ['칫솔', false]]);
  assert.deepEqual(items.map((x) => x.line), [3, 4, 5, 7]);
  const parts = memoParts(NOTE);
  assert.deepEqual(parts.map((p) => p.t), ['text', 'check', 'text', 'check']);
  assert.deepEqual(parts[0].t === 'text' && parts[0].lines, ['전화 가게 02-000-0000', '「휴지 있나요?」', '- 몇 시까지 여나']);
  assert.deepEqual(checkItems('그냥 메모\n- 질문'), []);
  assert.equal(memoSummary('그냥 메모'), null);
});

test('뒤집기: 그 줄의 칸 글자만 바뀌고 다른 줄은 그대로, 같은 글 항목은 몇 번째인지로 찾는다', () => {
  const items = checkItems(NOTE);
  const on = setItem(NOTE, refOf(items, 0), true);
  assert.equal(on, NOTE.replace('- [ ] 화장지', '- [x] 화장지'));
  const off = setItem(NOTE, refOf(items, 2), false);
  assert.equal(off, NOTE.replace('- [X] 샴푸', '- [ ] 샴푸'));
  // 같은 글 둘: 두 번째를 체크
  const dup = '- [ ] 봉투\n- [ ] 봉투';
  assert.equal(setItem(dup, refOf(checkItems(dup), 1), true), '- [ ] 봉투\n- [x] 봉투');
  // 없어진 항목
  assert.equal(setItem('- [ ] 화장지', { text: '수건', nth: 0 }, true), null);
});

test('더하기: 마지막 체크 줄 바로 밑, 체크 줄이 없으면 맨 끝, 빈 글은 아무 일 없음', () => {
  assert.equal(addItem('위 글\n- [ ] 화장지\n아래 글', ' 수건 \n'), '위 글\n- [ ] 화장지\n- [ ] 수건\n아래 글');
  assert.equal(addItem('전화 가게\n', '화장지'), '전화 가게\n- [ ] 화장지');
  assert.equal(addItem('', '화장지'), '- [ ] 화장지');
  assert.equal(addItem(null, '화장지'), '- [ ] 화장지');
  assert.equal(addItem('- [ ] 화장지', '   '), null);
});

test('접힌 줄 요약: 첫 줄이 글이면 그 글, 체크 줄이면 안 끝낸 항목들 · 끝낸 수 / 전체', () => {
  assert.deepEqual(memoSummary(NOTE), { text: '전화 가게 02-000-0000', done: 2, total: 4 });
  assert.deepEqual(memoSummary('- [x] 수건\n- [ ] 화장지\n- [ ] 칫솔'), { text: '화장지 · 칫솔', done: 1, total: 3 });
  assert.deepEqual(memoSummary('- [x] 수건'), { text: '', done: 1, total: 1 });
});

test('검색 조각: 체크 표시만 뺀다', () => {
  assert.equal(plainMemo('메모\n- [ ] 화장지\n- [x] 수건\n- 질문'), '메모\n화장지\n수건\n- 질문');
});

test('동시 체크: 409 를 받으면 최신 메모에 내 바꿀 것만 다시 적용해 상대 체크를 지우지 않는다', () => {
  const base = '- [ ] 화장지\n- [ ] 수건';
  // 둘 다 version 3 의 메모를 보고 있다. 상대가 먼저 화장지를 체크해 서버는 version 4.
  const server = { note: setItem(base, { text: '화장지', nth: 0 }, true), version: 4 };
  // 나는 옛 메모(version 3)에서 수건을 체크해 보냈다 → 409
  const mine = { t: 'set' as const, ref: refOf(checkItems(base), 1), done: true };
  const first = noteOp('t_x', { note: base, version: 3 }, mine);
  assert.deepEqual(first, { op: 'task.update', id: 't_x', baseVersion: 3, patch: { note: '- [ ] 화장지\n- [x] 수건' } });
  const retry = retryOnConflict('t_x', mine, 2);
  const again = retry(server);
  assert.deepEqual(again, { op: 'task.update', id: 't_x', baseVersion: 4, patch: { note: '- [x] 화장지\n- [x] 수건' } });
  // 더하기도 최신 메모 위에
  const add = retryOnConflict('t_x', { t: 'add', text: '칫솔' });
  assert.equal(add(server)?.patch.note, '- [x] 화장지\n- [ ] 수건\n- [ ] 칫솔');
  // 정한 횟수를 넘거나 항목이 지워졌으면 null(부른 쪽이 되돌리고 알림)
  assert.ok(retry(server));
  assert.equal(retry(server), null);
  assert.equal(retryOnConflict('t_x', mine)({ note: '- [ ] 화장지', version: 5 }), null);
});

test('편집 폼 「＋ 체크 항목」: 빈 메모면 첫 줄, 체크 줄이 없으면 끝, 있으면 마지막 체크 줄 밑 — 커서는 그 줄 끝', () => {
  assert.deepEqual(insertCheckLine(''), { note: '- [ ] ', caret: 6 });
  assert.deepEqual(insertCheckLine('전화 가게\n\n'), { note: '전화 가게\n- [ ] ', caret: 12 });
  const r = insertCheckLine('위 글\n- [x] 화장지\n- [ ] 수건\n아래 글');
  assert.equal(r.note, '위 글\n- [x] 화장지\n- [ ] 수건\n- [ ] \n아래 글');
  assert.equal(r.note.slice(0, r.caret), '위 글\n- [x] 화장지\n- [ ] 수건\n- [ ] ');
});

test('폼 저장 메모: 글 없이 남은 체크 줄은 뺀다', () => {
  assert.equal(cleanNote('전화 가게\n- [ ] \n- [x] 화장지\n- [ ]'), '전화 가게\n- [x] 화장지');
  assert.equal(cleanNote('- [ ] '), '');
});
