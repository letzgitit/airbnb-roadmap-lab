// 새 홈 계산 확인(node --test, 새 의존성 없이). 값은 모두 가짜다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRBNB_CARDS, DOC_CARDS, INTERIOR_CARDS, contactToProperty, guQuestions, housePhotos, ourUnits, parseContact, pickCard, prepareAdd,
  newsGroups, progressText, relDay, shortSource, sortCards, summarize, tasksByCard,
  TABS, addMonths, calendarMarks, monthWeeks, startMonth, weekTasks, progressSr, askOnly, docPhotos, docGroups,
} from './home-model.ts';

test('문의 필요만 보기: 문의 할 일 + 그 세부 항목 + 그 부모만', () => {
  const list = [
    T('a', 4, '부모', {}), T('b', 4, '문의 세부', { parentId: 'a', kind: '문의' }), T('c', 4, '그냥'),
    T('d', 4, '문의 위', { kind: '문의' }), T('e', 4, '그 밑', { parentId: 'd' }), T('f', 4, '종류 다름', { kind: '연락' }),
  ];
  assert.deepEqual(askOnly(list).map((t: { id: string }) => t.id), ['a', 'b', 'd', 'e']);
});

test('받아 둔 서류: PDF + 서류 낱말 사진, 참고 · 다른 집은 빼고 단계별 묶음(0단계는 뒤)', () => {
  const ph = (id: string, stepId: number, caption: string, kind = 'image', album = '') => ({ id, stepId, caption, kind, album, deletedAt: null });
  const list = [
    ph('a', 3, '등기부 캡처'), ph('b', 5, '', 'pdf'), ph('c', 0, '건축물대장'), ph('d', 7, '거실'), ph('e', 7, '참고 도면 다른 집'),
    ph('f', 9, '', 'image', '서류'), { ...ph('g', 3, '계약서'), deletedAt: 'x' },
  ];
  const docs = docPhotos(list as never);
  assert.deepEqual(docs.map((p) => p.id), ['a', 'b', 'c', 'f']);
  assert.deepEqual(docGroups(docs).map((g) => `${g.stepId}:${g.items.map((p) => p.id).join('')}`), ['3:a', '5:b', '9:f', '0:c']);
});

test('탭 일곱 개, 달력이 맨 끝', () => {
  assert.equal(TABS.length, 7);
  assert.equal(TABS[6].id, 'calendar');
});

test('이번 주 꼭 할 일: 기한 지남 + 6일 뒤까지, 마감 이른 순 5개, 끝낸 일 · 날짜 없는 일은 빠짐', () => {
  const today = '2026-10-28';
  const groups = {
    a: [T('a1', 4, '하나', { due: '2026-11-03' }), T('a2', 4, '둘', { due: '2026-11-04' }), T('a3', 4, '셋', { due: '2026-10-20' })],
    b: [T('b1', 8, '넷', { due: '2026-10-28' }), T('b2', 8, '다섯', { due: '2026-10-30', done: true }), T('b3', 8, '여섯'),
      T('b4', 8, '일곱', { due: '2026-10-29' }), T('b5', 8, '여덟', { due: '2026-10-31' }), T('b6', 8, '아홉', { due: '2026-10-25' })],
  };
  const r = weekTasks(groups, today);
  assert.equal(r.total, 6);
  assert.deepEqual(r.list.map((t: { id: string }) => t.id), ['a3', 'b6', 'b1', 'b4', 'b5']);
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
    '2026-10-20 interior 도배 지남',
    '2026-10-27 docs 전입신고 끝',
    '2026-11-09 docs 등록 서류',
    '2026-11-12 interior 욕실',
    '2026-11-12 airbnb 숙소 이름',
  ]);
});

test('달력을 처음 열 달: 이번 달에 마감 없으면 가장 가까운 마감이 있는 달', () => {
  const today = '2026-10-28';
  assert.equal(startMonth([], today), '2026-10-01');
  assert.equal(startMonth([{ date: '2026-10-02' }, { date: '2026-12-01' }], today), '2026-10-01');
  assert.equal(startMonth([{ date: '2026-11-09' }, { date: '2026-12-01' }], today), '2026-11-01');
  assert.equal(startMonth([{ date: '2026-09-28' }, { date: '2026-11-30' }], today), '2026-09-01');  // 30일 전 < 33일 뒤
  assert.equal(startMonth([{ date: '2026-09-27' }, { date: '2026-11-28' }], today), '2026-11-01'); // 같으면 앞날 쪽
});

test('달력 주: 월요일 시작, 앞뒤 달 날짜로 채움', () => {
  const w = monthWeeks('2026-10-01');
  assert.equal(w.length, 5);
  assert.equal(w[0][0], '2026-09-28');
  assert.equal(w[4][6], '2026-11-01');
  assert.equal(monthWeeks('2026-11-01')[0][0], '2026-10-26');
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
  assert.equal(progressSr(safety), '2개 중 1개 했어요');
  assert.equal(progressText({ total: 0, done: 0 }), '할 일 없음');
  const inspect = summarize(DOC_CARDS[3], [T('z', 12, '실사', { due: '2026-11-20' })], { steps, property } as never, today);
  assert.equal(inspect.deadline, '2026-11-20');
});

test('카드 순서: 마감 이른 순 → 날짜 없음 → 다 끝냄', () => {
  const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, title: id, steps: [1], addStep: 1 }));
  const sums = {
    a: { deadline: null, finished: false }, b: { deadline: '2026-11-09', finished: true }, c: { deadline: '2026-11-20', finished: false },
    d: { deadline: '2026-11-06', finished: false }, e: { deadline: null, finished: false },
  };
  assert.deepEqual(sortCards(cards, sums).map((c) => c.id), ['d', 'c', 'a', 'e', 'b']);
  // 기한 지난 일이 있는 카드가 마감이 늦어도 맨 앞(청록 「가장 급한 일」), 다 끝낸 카드는 그래도 뒤
  const late = { ...sums, c: { ...sums.c, late: 1 }, b: { ...sums.b, late: 2 } };
  assert.deepEqual(sortCards(cards, late).map((c) => c.id), ['c', 'd', 'a', 'e', 'b']);
});

test('뉴스: 규정 소식 · 공지 · 구청 낱말은 「구청 · 정책」, 나머지는 기사 · 영상, 최근 순 · 같은 주소 한 번', () => {
  const u = [{ date: '2026-09', dateWord: '게시', title: '등록 안내문', text: '', source: '가나구청', url: 'https://a.example/1' }];
  const r = [
    { title: '비자 운영', summary: '', source: '법무부', date: '2026-07-07', url: 'https://b.example/2', kind: '공지' },
    { title: '숙박 기사', summary: '', source: '신문', date: '2026-10-01', url: 'https://c.example/3', kind: '기사' },
    { title: '구청 설명회', summary: '', source: '방송', date: '2026-10-05', url: 'https://d.example/4', kind: '영상' },
    { title: '겹침', summary: '', source: '신문', date: '2026-10-02', url: 'https://a.example/1/', kind: '기사' },
  ];
  const g = newsGroups(u as never, r as never);
  assert.deepEqual(g.policy.map((n) => n.title), ['구청 설명회', '등록 안내문', '비자 운영']);
  assert.deepEqual(g.other.map((n) => n.title), ['숙박 기사']);
  assert.equal(g.policy[1].dateText, '2026년 9월');
  assert.equal(g.policy[1].status, '안내문이 올라옴');
});

test('뉴스 출처 짧게', () => {
  assert.equal(shortSource('국가법령정보센터 공중위생관리법 개정이유'), '법제처');
  assert.equal(shortSource('국회 의안정보시스템 의안 2221123'), '국회');
  assert.equal(shortSource('서울시 보도자료(2026.10.1, 기획조정실)'), '서울시');
  assert.equal(shortSource('가나구청 민원서식 「신규 등록」'), '가나구청');
  assert.equal(shortSource('에어비앤비 뉴스룸(2025.8.18)'), '에어비앤비');
  assert.equal(shortSource('행정안전부 보도자료(2026.8.3)'), '행정안전부');
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
