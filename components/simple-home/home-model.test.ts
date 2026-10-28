// 새 홈 계산 확인(node --test, 새 의존성 없이). 값은 모두 가짜다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRBNB_CARDS, DOC_CARDS, DONE_CARDS, INTERIOR_CARDS, contactToProperty, guQuestions, housePhotos, ourUnits, parseContact, pickCard, prepareAdd,
  progressText, relDay, sortCards, summarize, tasksByCard, workTab, isWorkTab,
  TABS, addMonths, calendarMarks, monthWeeks, startMonth, weekTasks, progressSr, askOnly, docPhotos,
  dayTasks, dayDots, taskTabs, upcomingTasks, blockId, blockTab, docKind, docKindGroups, galleryParts, photoMatches, sortPhotos,
} from './home-model.ts';
import { CARD_ID_RE } from '../../lib/core/cardnotes.ts';

const dayDoc = () => ({
  tasks: Object.fromEntries([
    T('a', 4, '전입 서류 챙기기', { due: '2026-10-28' }),
    T('bb', 4, '세부', { due: '2026-10-28', parentId: 'a', done: true }),
    T('c', 7, '도배 시작', { start: '2026-10-28', due: '2026-11-02' }),
    T('d', 7, '지운 일', { due: '2026-10-28', deletedAt: 'x' }),
    T('e', 7, '지난 일', { due: '2026-10-20' }),
    T('f', 7, '다 한 날', { due: '2026-10-21', done: true }),
    T('g', 7, '하루짜리', { start: '2026-10-28', due: '2026-10-28' }),
    T('h', 11, '숙소 이름 짓기', { due: '2026-11-11' }),
    T('i', 11, '가격 정하기', { due: '2026-11-12' }),
    T('j', 14, '수건 사기', { due: '2026-10-29', done: true }),
  ].map((t: { id: string }) => [t.id, t])),
}) as never;

test('달력 그날 할 일: 그날 마감 · 그날 시작(지운 것 빼고, 세부 항목 포함)', () => {
  const doc = dayDoc();
  const day = dayTasks(doc, '2026-10-28');
  assert.deepEqual(day.due.map((t: { id: string }) => t.id), ['a', 'g', 'bb']);
  assert.deepEqual(day.starting.map((t: { id: string }) => t.id), ['c']); // 하루짜리(g)는 마감 쪽에만
  assert.deepEqual(dayTasks(doc, '2026-10-30'), { due: [], starting: [] });
});

test('달력 점: 날마다 분야 점 하나씩(행정 · 설비 · 운영 순), 다 끝낸 분야는 회색, 지난 날 안 끝난 일은 색 그대로', () => {
  const doc = dayDoc();
  const tabOf = taskTabs(doc);
  assert.equal(tabOf.get('a'), 'admin');
  assert.equal(tabOf.get('bb'), 'admin'); // 세부 항목은 부모 분야
  assert.equal(tabOf.get('c'), 'facility');
  assert.equal(tabOf.get('h'), 'ops');
  assert.equal(tabOf.has('d'), false);     // 지운 할 일
  const dots = dayDots(doc, tabOf);
  assert.deepEqual(dots.get('2026-10-28'), [{ tab: 'admin', done: false }, { tab: 'facility', done: false }]); // 지운 d 는 없음
  assert.deepEqual(dots.get('2026-10-20'), [{ tab: 'facility', done: false }]);
  assert.deepEqual(dots.get('2026-10-21'), [{ tab: 'facility', done: true }]);
  assert.deepEqual(dots.get('2026-10-29'), [{ tab: 'ops', done: true }]);
  assert.equal(dots.has('2026-10-22'), false);
});

test('다가오는 일정: 내일부터 14일 안 · 안 끝난 것만 · 마감 이른 순(오늘 · 지난 · 15일 뒤는 빠짐)', () => {
  const doc = dayDoc();
  assert.deepEqual(upcomingTasks(doc, '2026-10-28').map((t: { id: string }) => t.id), ['c', 'h']); // 11-11 = 14일째까지, 11-12 는 빠짐
  assert.deepEqual(upcomingTasks(doc, '2026-10-29').map((t: { id: string }) => t.id), ['c', 'h', 'i']);
  assert.deepEqual(upcomingTasks(doc, '2026-10-28', 5).map((t: { id: string }) => t.id), ['c']); // 11-02 = 5일째
});

test('블록 id: 「분야.블록」 — 모든 일터 블록이 서버 꼴 검사를 지나고 서로 겹치지 않는다', () => {
  const ids = [
    ...workTab('admin').cards.map((c) => blockId('admin', c.id)),
    ...workTab('facility').cards.map((c) => blockId('facility', c.id)),
    ...workTab('ops').cards.map((c) => blockId('ops', c.id)),
  ];
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, CARD_ID_RE);
  assert.ok(ids.includes('facility.other') && ids.includes('ops.other'));
  assert.equal(blockTab('admin.move-in'), 'admin');
  assert.equal(blockTab('ops.other'), 'ops');
  assert.equal(blockTab('money.x'), null);
  assert.equal(blockTab('admin'), null);
});

const ph = (id: string, stepId: number, caption: string, kind = 'image', album = '', extra: Record<string, unknown> = {}) =>
  ({ id, stepId, caption, kind, album, deletedAt: null, taskId: null, cardId: null, takenAt: '2026-10-01T00:00:00', order: 0, ...extra });

test('받아 둔 서류: PDF + 서류 낱말 사진, 참고 · 다른 집은 뺀다', () => {
  const list = [
    ph('a', 3, '등기부 캡처'), ph('b', 5, '', 'pdf'), ph('c', 0, '건축물대장'), ph('d', 7, '거실'), ph('e', 7, '참고 도면 다른 집'),
    ph('f', 9, '', 'image', '서류'), { ...ph('g', 3, '계약서'), deletedAt: 'x' },
  ];
  assert.deepEqual(docPhotos(list as never).map((p) => p.id), ['a', 'b', 'c', 'f']);
});

test('문서 종류로 가르기: 계약서 · 등기부 · 건축물대장 · 평면도 · 구청 서류 · 그 밖(위 줄부터)', () => {
  assert.equal(docKind({ caption: '임대차 계약서 1쪽', album: '' }), 'contract');
  assert.equal(docKind({ caption: '등기부등본', album: '' }), 'registry'); // 「등본」이 있어도 등기부가 먼저
  assert.equal(docKind({ caption: '', album: '건축물대장' }), 'building');
  assert.equal(docKind({ caption: '도면 캡처', album: '서류' }), 'plan');
  assert.equal(docKind({ caption: '종로구청 안내문', album: '' }), 'office');
  assert.equal(docKind({ caption: '전입 신고서', album: '' }), 'office');
  assert.equal(docKind({ caption: '', album: '서류' }), 'other');
  const groups = docKindGroups([ph('1', 3, '안내문'), ph('2', 3, '계약서'), ph('3', 3, ''), ph('4', 3, '계약서 2쪽')] as never);
  assert.deepEqual(groups.map((g) => `${g.label}:${g.items.map((p) => p.id).join('')}`), ['계약서:24', '구청 서류:1', '그 밖:3']);
});

test('갤러리 나누기: 문서 · 공사 전/후 · 분야별(블록 · 할 일 사진) · 참고 · 그 밖 — 지우지 않은 사진은 한 곳에만', () => {
  const doc = dayDoc();
  const plain = [
    ph('p1', 2, '거실'), ph('p2', 7, '', 'image', '공사 후'), ph('p3', 3, '계약서'), ph('p4', 0, '301호 참고'), ph('p5', 6, '시안 3번'),
    ph('p6', 5, '', 'pdf'), { ...ph('p7', 2, '지운 것'), deletedAt: 'x' },
  ];
  const attached = [
    ph('c1', 4, '', 'image', '', { cardId: 'admin.move-in' }), ph('c2', 7, '', 'image', '', { cardId: 'facility.bath' }),
    ph('t1', 11, '', 'image', '', { taskId: 'h' }), ph('t2', 4, '', 'image', '', { taskId: 'zz' }),
  ];
  const g = galleryParts(plain as never, attached as never, ['101'], taskTabs(doc));
  const ids = (l: { id: string }[]) => l.map((p) => p.id);
  assert.deepEqual(ids(g.before), ['p1']);
  assert.deepEqual(ids(g.after), ['p2']);
  assert.deepEqual(ids(g.docs), ['p3', 'p6']);
  assert.deepEqual(ids(g.ref), ['p4']);
  assert.deepEqual(ids(g.other), ['p5', 't2']); // 분야를 못 찾은 할 일 사진은 그 밖
  assert.deepEqual(ids(g.fields.admin), ['c1']);
  assert.deepEqual(ids(g.fields.facility), ['c2']);
  assert.deepEqual(ids(g.fields.ops), ['t1']);
  const all = [...g.before, ...g.after, ...g.docs, ...g.ref, ...g.other, ...g.fields.admin, ...g.fields.facility, ...g.fields.ops];
  assert.equal(all.length, 10);
  assert.equal(new Set(ids(all)).size, 10);
});

test('갤러리 검색 · 정렬', () => {
  assert.equal(photoMatches({ caption: '주방 수전', album: '' }, '수전'), true);
  assert.equal(photoMatches({ caption: '주방', album: '' }, '행정', '4. 전입신고 행정'), true);
  assert.equal(photoMatches({ caption: '주방', album: '' }, '욕실'), false);
  assert.equal(photoMatches({ caption: '주방', album: '' }, '  '), true);
  const list = [{ takenAt: '2026-10-02', order: 1, id: 'b' }, { takenAt: '2026-10-01', order: 2, id: 'a' }, { takenAt: '2026-10-02', order: 3, id: 'c' }];
  assert.deepEqual(sortPhotos(list, 'default').map((p) => p.id), ['b', 'a', 'c']);
  assert.deepEqual(sortPhotos(list, 'newest').map((p) => p.id), ['c', 'b', 'a']);
  assert.deepEqual(sortPhotos(list, 'oldest').map((p) => p.id), ['a', 'b', 'c']);
});

test('문의 필요만 보기: 문의 할 일 + 그 세부 항목 + 그 부모만', () => {
  const list = [
    T('a', 4, '부모', {}), T('b', 4, '문의 세부', { parentId: 'a', kind: '문의' }), T('c', 4, '그냥'),
    T('d', 4, '문의 위', { kind: '문의' }), T('e', 4, '그 밑', { parentId: 'd' }), T('f', 4, '종류 다름', { kind: '연락' }),
  ];
  assert.deepEqual(askOnly(list).map((t: { id: string }) => t.id), ['a', 'b', 'd', 'e']);
});

test('분야 탭 여섯 개: 행정 · 설비 · 운영 · 갤러리 · 연락처 · 달력(글자 탭), 일터는 앞 셋', () => {
  assert.deepEqual(TABS.map((t) => t.label), ['행정', '설비', '운영', '갤러리', '연락처', '달력']);
  assert.deepEqual(TABS.filter((t) => isWorkTab(t.id)).map((t) => t.id), ['admin', 'facility', 'ops']);
  // 행정 = 서류 블록 + 늘 접는 1~3단계, 설비 = 인테리어, 운영 = 에어비앤비
  assert.deepEqual(workTab('admin').cards.flatMap((c) => c.steps), [4, 5, 9, 8, 12, 13, 1, 2, 3]);
  assert.deepEqual(workTab('admin').alwaysDone, ['step-1', 'step-2', 'step-3']);
  assert.equal(workTab('facility').cards, INTERIOR_CARDS);
  assert.equal(workTab('ops').cards, AIRBNB_CARDS);
});

test('블록 순서(한 목록): 기한 지남 → 마감 이른 순(다 끝낸 블록 · 1~3단계도 제자리) → 날짜 없음', () => {
  const steps = { 4: { status: 'todo', targetDate: '2026-11-09' }, 8: { status: 'todo', targetDate: '2026-11-06' } } as never;
  const today = '2026-10-28';
  const doc = { steps, property: {} } as never;
  const cards = workTab('admin').cards;
  const sums = Object.fromEntries(cards.map((c) => [c.id, summarize(c, [], doc, today)]));
  sums['move-in'] = summarize(DOC_CARDS[0], [T('a', 4, '견적', { due: '2026-11-02' }), T('b', 4, '치수')], doc, today);
  sums.safety = summarize(DOC_CARDS[2], [T('c', 8, '소화기', { due: '2026-10-20' })], doc, today);
  sums.biz = summarize(DOC_CARDS[4], [T('d', 13, '끝', { due: '2026-11-01', done: true })], doc, today);
  assert.equal(sums['move-in'].nextDue, '2026-11-02');
  // 날짜 없는 블록(register · inspect · 다 끝낸 biz · 1~3단계)은 정의 순서로 맨 뒤
  assert.deepEqual(sortCards(cards, sums).map((c) => c.id),
    ['safety', 'move-in', 'register', 'inspect', 'biz', 'step-1', 'step-2', 'step-3']);
  // 다 끝낸 블록도 마감이 있으면 제 마감 자리(맨 뒤로 빼지 않는다)
  const s2 = { ...sums, biz: { ...sums.biz, deadline: '2026-11-01' } };
  assert.deepEqual(sortCards(cards, s2).slice(0, 3).map((c) => c.id), ['safety', 'biz', 'move-in']);
  // 행정 1~3단계도 기한 지난 일이 남아 있으면 맨 앞(단계 번호와 상관없이)
  const s3 = { ...sums, 'step-3': summarize(DONE_CARDS[2], [T('x', 3, '특약', { due: '2026-10-24' })], doc, today) };
  assert.deepEqual(sortCards(cards, s3).slice(0, 2).map((c) => c.id), ['step-3', 'safety']);
});

test('이번 주 할 일: 기한 지남 + 6일 뒤까지, 마감 이른 순 모두(자르지 않음), 끝낸 일 · 날짜 없는 일은 빠짐', () => {
  const today = '2026-10-28';
  const groups = {
    a: [T('a1', 4, '하나', { due: '2026-11-03' }), T('a2', 4, '둘', { due: '2026-11-04' }), T('a3', 4, '셋', { due: '2026-10-20' })],
    b: [T('b1', 8, '넷', { due: '2026-10-28' }), T('b2', 8, '다섯', { due: '2026-10-30', done: true }), T('b3', 8, '여섯'),
      T('b4', 8, '일곱', { due: '2026-10-29' }), T('b5', 8, '여덟', { due: '2026-10-31' }), T('b6', 8, '아홉', { due: '2026-10-25' })],
  };
  const r = weekTasks(groups, today);
  assert.equal(r.total, 6);
  assert.deepEqual(r.list.map((t: { id: string }) => t.id), ['a3', 'b6', 'b1', 'b4', 'b5', 'a1']);
  // 방금 체크한 일(isDone 이 아직 false)은 자리를 지킨다
  const sticky = weekTasks({ b: [T('b2', 8, '다섯', { due: '2026-10-30', done: true })] }, today, () => false);
  assert.equal(sticky.total, 1);
});

test('달력: 카드 마감 날짜만(카드 머리와 같은 값), 짧은 이름 · 기한 지남 · 다 한 카드', () => {
  const today = '2026-10-28';
  const doc = {
    tasks: Object.fromEntries([
      T('x', 7, '욕실 줄눈', { due: '2026-11-12' }),
      T('y', 7, '도배 견적', { due: '2026-10-20' }),
      T('z', 11, '숙소 이름 정하기', { due: '2026-11-12' }),
      T('w', 6, '조명 사기', { due: '2026-11-01', done: true }),
    ].map((t: { id: string }) => [t.id, t])),
    steps: { 9: { status: 'todo', targetDate: '2026-11-09' }, 4: { status: 'done', targetDate: '2026-10-27' } },
    property: {},
  };
  const marks = calendarMarks(doc as never, today);
  const brief = marks.map((m) => `${m.date} ${m.tab} ${m.short}${m.late ? ' 지남' : ''}${m.finished ? ' 끝' : ''}`);
  assert.deepEqual(brief, [
    '2026-10-20 facility 도배 지남',
    '2026-10-27 admin 전입 신고 끝',
    '2026-11-09 admin 등록 서류',
    '2026-11-12 facility 욕실',
    '2026-11-12 ops 숙소 이름',
  ]);
});

test('달력 짧은 이름: 띄어쓰기 토막마다 네 글자 이하(칸에서 글자 중간에 줄이 안 바뀌게)', () => {
  for (const c of [...DOC_CARDS, ...INTERIOR_CARDS, ...AIRBNB_CARDS]) {
    for (const part of (c.short ?? c.title).split(' ')) assert.ok(part.length <= 4, `${c.id}: ${part}`);
  }
});

test('달력을 처음 열 달: 이번 달에 마감 없으면 가장 가까운 마감이 있는 달', () => {
  const today = '2026-10-28';
  assert.equal(startMonth([], today), '2026-10-01');
  assert.equal(startMonth([{ date: '2026-10-02' }, { date: '2026-12-01' }], today), '2026-10-01');
  assert.equal(startMonth([{ date: '2026-11-09' }, { date: '2026-12-01' }], today), '2026-11-01');
  assert.equal(startMonth([{ date: '2026-09-28' }, { date: '2026-11-30' }], today), '2026-09-01');  // 30일 전 < 33일 뒤
  assert.equal(startMonth([{ date: '2026-09-27' }, { date: '2026-11-28' }], today), '2026-11-01'); // 같으면 앞날 쪽
});

test('달력 주: 일요일 시작(일 · 월 · … · 토), 앞뒤 달 날짜로 채움', () => {
  const w = monthWeeks('2026-10-01');
  assert.equal(w.length, 5);
  assert.equal(w[0][0], '2026-09-27');
  assert.equal(w[4][6], '2026-10-31');
  assert.equal(monthWeeks('2026-11-01')[0][0], '2026-11-01'); // 1일이 일요일이면 앞 달 날짜 없이
  assert.equal(monthWeeks('2026-11-01').length, 5);
  assert.equal(addMonths('2026-12-01', 1), '2027-01-01');
  assert.equal(addMonths('2026-01-01', -1), '2025-12-01');
});

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
  assert.equal(progressText(safety), '1/2');
  assert.equal(progressSr(safety), '2개 중 1개 완료');
  // 할 일이 없는 블록은 「할 일 없음」 같은 글 없이 빈칸(2026-10-28)
  assert.equal(progressText({ total: 0, done: 0 }), '');
  const inspect = summarize(DOC_CARDS[3], [T('z', 12, '실사', { due: '2026-11-20' })], { steps, property } as never, today);
  assert.equal(inspect.deadline, '2026-11-20');
});

test('카드 순서: 마감 이른 순(다 끝낸 카드도 제자리) → 날짜 없음', () => {
  const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, title: id, steps: [1], addStep: 1 }));
  const sums = {
    a: { deadline: null, finished: false }, b: { deadline: '2026-11-09', finished: true }, c: { deadline: '2026-11-20', finished: false },
    d: { deadline: '2026-11-06', finished: false }, e: { deadline: null, finished: false },
  };
  assert.deepEqual(sortCards(cards, sums).map((c) => c.id), ['d', 'b', 'c', 'a', 'e']);
  // 기한 지난 일이 있는 안 끝난 카드가 마감이 늦어도 맨 앞, 다 끝낸 카드는 제 마감 자리 그대로
  const late = { ...sums, c: { ...sums.c, late: 1 }, b: { ...sums.b, late: 2 } };
  assert.deepEqual(sortCards(cards, late).map((c) => c.id), ['c', 'd', 'b', 'a', 'e']);
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
