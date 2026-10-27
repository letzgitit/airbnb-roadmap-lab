// 새 홈 계산 확인(node --test, 새 의존성 없이). 값은 모두 가짜다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRBNB_CARDS, DOC_CARDS, INTERIOR_CARDS, contactToProperty, guQuestions, housePhotos, ourUnits, parseContact, pickCard, prepareAdd,
  progressText, relDay, summarize, tasksByCard,
} from './home-model.ts';

const T = (id: string, stepId: number, text: string, extra: Record<string, unknown> = {}) => ({
  id, stepId, text, due: null, done: false, doneBy: null, doneAt: null, version: 1, createdAt: `2026-10-01T00:00:0${id.length}Z`,
  createdBy: 'a', updatedAt: '', updatedBy: '', deletedAt: null, deletedBy: null, ...extra,
}) as never;
const P = (id: string, label: string, value: string) => ({ id, label, value, version: 1, createdAt: id, updatedAt: '', updatedBy: '', deletedAt: null, deletedBy: null });

test('인테리어 낱말 나누기: 위 카드부터, 「문」은 낱말일 때만', () => {
  const pick = (text: string, kind: string | null = null) => pickCard(INTERIOR_CARDS, { text, stepId: 7, kind: kind as never });
  assert.equal(pick('화장실 수전 바꾸기'), 'bath');
  assert.equal(pick('도배 견적 받기'), 'wall');
  assert.equal(pick('방 문 페인트'), 'wall');
  assert.equal(pick('현관문 손잡이'), 'wall');
  assert.equal(pick('커튼 주문'), 'buy');           // 「주문」의 「문」은 문이 아니다
  assert.equal(pick('집주인에게 문의'), 'other');
  assert.equal(pick('에어컨 설치 날짜'), 'aircon');
  assert.equal(pick('스위치 커버 교체'), 'light');
  assert.equal(pick('신발장 정리', '구매'), 'buy');  // 낱말이 없으면 종류로
  assert.equal(pick('신발장 정리'), 'other');
  assert.equal(pick('조명: 욕실 등 바꾸기'), 'light'); // 맨 앞 「조명:」이 낱말보다 먼저
  assert.equal(pickCard(INTERIOR_CARDS, { text: '욕실', stepId: 4, kind: null }), null);
});

test('낱말 카드에서 더하면 카드 이름을 앞에 붙여 그 카드에 남게', () => {
  const light = INTERIOR_CARDS.find((c) => c.id === 'light')!;
  assert.deepEqual(prepareAdd(INTERIOR_CARDS, light, '거실 등 바꾸기', ''), { text: '조명: 거실 등 바꾸기', kind: '' });
  assert.deepEqual(prepareAdd(INTERIOR_CARDS, light, '거실 조명 바꾸기', ''), { text: '거실 조명 바꾸기', kind: '' });
  const buy = INTERIOR_CARDS.find((c) => c.id === 'buy')!;
  assert.deepEqual(prepareAdd(INTERIOR_CARDS, buy, '식탁', ''), { text: '식탁', kind: '구매' });
  const other = INTERIOR_CARDS.find((c) => c.id === 'other')!;
  assert.deepEqual(prepareAdd(INTERIOR_CARDS, other, '욕실 청소', ''), { text: '욕실 청소', kind: '' });
  const sup = AIRBNB_CARDS.find((c) => c.id === 'supplies')!;
  assert.equal(pickCard(AIRBNB_CARDS, { text: prepareAdd(AIRBNB_CARDS, sup, '물티슈', '').text, stepId: 14, kind: '구매' }), 'supplies');
});

test('카드 묶기: 세부 항목은 부모 카드를 따라간다, 지운 것은 뺀다', () => {
  const doc = { tasks: {
    a: T('a', 7, '욕실 줄눈'), b: T('b', 7, '조명 사기', { parentId: 'a' }), c: T('c', 4, '전입신고'),
    d: T('d', 9, '신청서'), e: T('e', 7, '도배', { deletedAt: 'x' }),
  } };
  const g = tasksByCard(doc as never, INTERIOR_CARDS);
  assert.deepEqual(g.bath.map((t) => t.id).sort(), ['a', 'b']);
  assert.equal(g.wall.length, 0);
  const d = tasksByCard(doc as never, DOC_CARDS);
  assert.deepEqual(d['move-in'].map((t) => t.id), ['c']);
  assert.deepEqual(d.register.map((t) => t.id), ['d']);
});

test('카드 마감: 고정 일정 → 단계 목표일 → 할 일 마감', () => {
  const property = { f: P('f', '고정 · 잔금', '2026-11-09 잔금 · 전입 · 등록 신청') };
  const steps = { 8: { status: 'todo', targetDate: '2026-11-06' }, 12: { status: 'todo', targetDate: null } } as never;
  const today = '2026-10-27';
  const moveIn = summarize(DOC_CARDS[0], [], { steps, property } as never, today);
  assert.equal(moveIn.deadline, '2026-11-09');
  const safety = summarize(DOC_CARDS[2], [T('x', 8, '소화기', { due: '2026-10-20' }), T('y', 8, '감지기', { due: '2026-10-30', done: true })], { steps, property } as never, today);
  assert.equal(safety.deadline, '2026-11-06');
  assert.equal(safety.late, 1);
  assert.equal(progressText(safety), '2개 중 1개 끝');
  const inspect = summarize(DOC_CARDS[3], [T('z', 12, '실사', { due: '2026-11-20' })], { steps, property } as never, today);
  assert.equal(inspect.deadline, '2026-11-20');
});

test('남은 날 말과 색', () => {
  assert.deepEqual(relDay('2026-10-25', '2026-10-27'), { text: '2일 지남', tone: 'late' });
  assert.deepEqual(relDay('2026-10-27', '2026-10-27'), { text: '오늘', tone: 'soon' });
  assert.deepEqual(relDay('2026-11-02', '2026-10-27'), { text: 'D-6', tone: 'soon' });
  assert.deepEqual(relDay('2026-11-03', '2026-10-27'), { text: 'D-7', tone: 'later' });
});

test('구청 질문: 받는 사람에 「구청」 + 답 기다림만', () => {
  const q = (id: string, to: string, status: string, seq: number) => ({ id, to, status, seq, deletedAt: null });
  const doc = { questions: { a: q('a', '구청', 'open', 2), b: q('b', '구청 담당자', 'open', 1), c: q('c', '구청', 'answered', 3), d: q('d', '친구', 'open', 4) } };
  assert.deepEqual(guQuestions(doc as never).map((x) => x.id), ['b', 'a']);
});

test('우리 집 사진만: 참고 · 문서 · 다른 호수 · PDF 를 빼고 공사 후 묶음을 나눈다', () => {
  const ph = (id: string, stepId: number, caption: string, extra: Record<string, unknown> = {}) => ({ id, stepId, caption, album: '', kind: 'image', deletedAt: null, ...extra });
  const list = [
    ph('a', 2, '주방'), ph('b', 0, '거실'), ph('c', 3, '등기부 캡처'), ph('d', 4, '301호 현관'), ph('e', 4, '101호 욕실'),
    ph('f', 7, '거실', { album: '공사 후' }), ph('g', 3, '계약', { kind: 'pdf' }),
  ];
  const units = ourUnits({ p: P('p', '주소', '가나구 1-1 101호') } as never);
  assert.deepEqual(units, ['101']);
  const r = housePhotos(list as never, units);
  assert.deepEqual(r.before.map((p) => p.id), ['a', 'e']);
  assert.deepEqual(r.after.map((p) => p.id), ['f']);
  assert.equal(r.hidden, 4);
});

test('연락처 읽기 · 쓰기', () => {
  const c = parseContact(P('p', '연락처 · 김가나(집주인 대리인)', '010-0000-0000 · 잔금 · 열쇠') as never);
  assert.equal(c.name, '김가나(집주인 대리인)');
  assert.equal(c.phone, '010-0000-0000');
  assert.equal(c.work, '잔금 · 열쇠');
  assert.equal(parseContact(P('q', '연락처 · 다라', '도배') as never).phone, null);
  assert.deepEqual(contactToProperty(' 다라 ', '02-000-0000', ''), { label: '연락처 · 다라', value: '02-000-0000' });
});
