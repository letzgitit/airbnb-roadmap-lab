// 홈 「요약」 계산 확인(node --test, 새 의존성 없이). 값은 모두 가짜다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dLabel, firstGuest, guestFinish, logWhen, summaryOf, type SummaryDoc } from './summary-data.ts';
import type { TimelineStep } from './step-dates.ts';

const TODAY = '2026-10-27';
const STEPS: TimelineStep[] = [
  { id: 1, title: '첫 단계', start: 0, end: 5, type: 'prep' },
  { id: 2, title: '둘째 단계', start: 5, end: 10, type: 'milestone' },
  { id: 3, title: '셋째 단계', start: 10, end: 20, type: 'admin' },
  { id: 4, title: '넷째 단계', start: 20, end: 30, type: 'open' },
];
const meta = { version: 1, createdAt: '2026-10-01T00:00:00Z', createdBy: 'a', updatedAt: '2026-10-01T00:00:00Z', updatedBy: 'a', deletedAt: null, deletedBy: null };
type TaskIn = { id: string; due?: string | null; done?: boolean; deleted?: boolean; stepId?: number; kind?: '결정' | '연락'; owner?: '남편' | '아내' | '같이' };
const task = ({ id, due = null, done = false, deleted = false, stepId = 1, kind, owner }: TaskIn) => ({
  ...meta, id, stepId, text: `할 일 ${id}`, due, done, doneBy: null, doneAt: null,
  ...(kind ? { kind } : {}), ...(owner ? { owner } : {}),
  deletedAt: deleted ? '2026-10-20T00:00:00Z' : null,
});
function docOf(tasks: TaskIn[], extra: Partial<SummaryDoc> = {}): SummaryDoc {
  return {
    tasks: Object.fromEntries(tasks.map((t) => [t.id, task(t)])),
    steps: {}, property: {}, log: [], money: {}, plan: null, questions: {},
    ...extra,
  };
}
const ids = (list: { id: string }[]) => list.map((t) => t.id);

test('지운 일 · 끝낸 일은 빠진다', () => {
  const s = summaryOf(STEPS, docOf([
    { id: 'a', due: '2026-10-20' }, { id: 'b', due: '2026-10-20', done: true }, { id: 'c', due: '2026-10-20', deleted: true },
  ]), TODAY);
  assert.deepEqual(ids(s.late), ['a']);
});

test('기한 지남 · 오늘 · 다음 7일 경계(6일 뒤 포함, 7일 뒤 제외)', () => {
  const s = summaryOf(STEPS, docOf([
    { id: 'late', due: '2026-10-26' }, { id: 'today', due: '2026-10-27' }, { id: 'tmr', due: '2026-10-28' },
    { id: 'd6', due: '2026-11-02' }, { id: 'd7', due: '2026-11-03' }, { id: 'nodate' },
  ]), TODAY);
  assert.deepEqual(ids(s.late), ['late']);
  assert.deepEqual(ids(s.today), ['today']);
  assert.deepEqual(ids(s.next7), ['tmr', 'd6']);
});

test('방금 체크한 일(isDone)은 그대로 자리를 지키고, 편집 중인 일은 지워져도 남는다', () => {
  const s = summaryOf(STEPS, docOf([{ id: 'x', due: TODAY, done: true }, { id: 'y', due: TODAY, deleted: true }]), TODAY, {
    isDone: () => false, editing: new Set(['y']),
  });
  assert.deepEqual(ids(s.today), ['x', 'y']);
});

test('결정 종류: ②의 날짜 범위에 있으면 ③에서 빠지고, 나머지는 마감순(날짜 없음은 뒤)', () => {
  const s = summaryOf(STEPS, docOf([
    { id: 'soon', due: '2026-10-29', kind: '결정' }, { id: 'later', due: '2026-11-10', kind: '결정' },
    { id: 'nodue', kind: '결정' }, { id: 'oldlate', due: '2026-10-01', kind: '결정' }, { id: 'call', due: '2026-11-10', kind: '연락' },
  ]), TODAY);
  assert.deepEqual(ids(s.next7), ['soon']);
  assert.deepEqual(ids(s.late), ['oldlate']);
  assert.deepEqual(ids(s.decide), ['later', 'nodue']);
});

test('결정은 담당 거르기와 상관없이 ③에 한 번만', () => {
  const s = summaryOf(STEPS, docOf([{ id: 'w', due: '2026-10-29', kind: '결정', owner: '아내' }]), TODAY, { owner: '남편' });
  assert.deepEqual(ids(s.next7), []);
  assert.deepEqual(ids(s.decide), []);
});

test('담당 「같이」는 남편 · 아내 둘 다에, 담당 없는 일은 「전체」에서만', () => {
  const doc = docOf([
    { id: 'both', due: TODAY, owner: '같이' }, { id: 'h', due: TODAY, owner: '남편' }, { id: 'w', due: TODAY, owner: '아내' }, { id: 'none', due: TODAY },
  ]);
  assert.deepEqual(ids(summaryOf(STEPS, doc, TODAY).today), ['both', 'h', 'w', 'none']);
  assert.deepEqual(ids(summaryOf(STEPS, doc, TODAY, { owner: '남편' }).today), ['both', 'h']);
  assert.deepEqual(ids(summaryOf(STEPS, doc, TODAY, { owner: '아내' }).today), ['both', 'w']);
});

test('고정 일정: 지난 것은 빠지고 오늘은 들어가며, 3개 넘으면 나머지 수', () => {
  const pin = (id: string, label: string, value: string) => ({ ...meta, id, label, value });
  const s = summaryOf(STEPS, docOf([], {
    property: {
      p0: pin('p0', '고정 · 지난 날', '2026-10-20 지난 일'), p1: pin('p1', '고정 · 오늘', `${TODAY} 오늘 일`),
      p2: pin('p2', '고정 · 둘', '2026-11-05 둘째'), p3: pin('p3', '고정 · 셋', '2026-11-20 셋째'), p4: pin('p4', '고정 · 넷', '2026-12-01 넷째'),
      x: pin('x', '면적', '약 10㎡'),
    },
  }), TODAY);
  assert.deepEqual(s.pins.map((p) => p.label), ['오늘 일', '둘째', '셋째']);
  assert.equal(s.pinsMore, 1);
});

test('돈: 오늘 이후 두 건, 그 뒤 여유는 돈 화면과 같은 계산 / 돈 흐름이 없으면 null', () => {
  const m = (id: string, date: string | null, amount: number | null) => ({ ...meta, id, date, text: id, amount, via: 'cash' as const, estimate: false, project: 'oedomin' as const });
  const s = summaryOf(STEPS, docOf([], {
    money: { a: m('a', '2026-10-20', -10), b: m('b', '2026-10-30', -20), c: m('c', '2026-11-10', 5), d: m('d', '2026-12-01', -1), e: m('e', null, null) },
    plan: { cash: 100, credit: 50, fork: '', version: 1, updatedAt: '', updatedBy: '' },
  }), TODAY);
  assert.ok(s.money);
  assert.equal(s.money.cash, 100);
  assert.deepEqual(s.money.next.map((r) => [r.item.id, r.cash]), [['b', 70], ['c', 75]]);
  assert.equal(summaryOf(STEPS, docOf([]), TODAY).money, null);
});

test('질문 개수: 답 기다림 · 새 답(지운 질문은 빼고)', () => {
  const q = (id: string, status: 'open' | 'answered' | 'closed', unread: boolean, deleted = false) => ({
    ...meta, id, seq: 1, to: 'x', text: id, status, answers: [], unread, deletedAt: deleted ? '2026-10-20T00:00:00Z' : null,
  });
  const s = summaryOf(STEPS, docOf([], { questions: { a: q('a', 'open', false), b: q('b', 'open', true), c: q('c', 'answered', true), d: q('d', 'open', true, true) } }), TODAY);
  assert.deepEqual(s.questions, { open: 2, unread: 2 });
});

test('지금 하는 단계: 지금 단계 먼저, 그 밖의 진행 중 단계 번호순 · 남은 할 일 수 · 끝낸 단계 수', () => {
  const st = (status: 'todo' | 'doing' | 'done', targetDate: string | null = null) => ({ status, targetDate, note: '', version: 1, updatedAt: '', updatedBy: '' });
  const s = summaryOf(STEPS, docOf([{ id: 'a', stepId: 3 }, { id: 'b', stepId: 3, done: true }, { id: 'c', stepId: 2 }], {
    steps: { 1: st('done'), 2: st('doing', '2026-11-01'), 3: st('doing') },
  }), TODAY, { currentId: 3 });
  assert.deepEqual(s.active.map((a) => [a.id, a.current, a.openTasks, a.target]), [[3, true, 1, null], [2, false, 1, '2026-11-01']]);
  assert.equal(s.stepsDone, 1);
});

test('최근 기록: 지운 것 빼고 최신 3개', () => {
  const l = (id: string, at: string, deleted = false) => ({ id, at, by: 'a', kind: '메모' as const, text: id, version: 1, updatedAt: at, updatedBy: 'a', deletedAt: deleted ? at : null, deletedBy: null });
  const s = summaryOf(STEPS, docOf([], { log: [l('a', '2026-10-20T01:00:00Z'), l('b', '2026-10-26T01:00:00Z'), l('c', '2026-10-27T01:00:00Z', true), l('d', '2026-10-25T01:00:00Z'), l('e', '2026-10-21T01:00:00Z')] }), TODAY);
  assert.deepEqual(ids(s.recentLog), ['b', 'd', 'e']);
});

test('글자 도우미: 남은 날 · 기록 때 · 로그인 전 첫 손님까지', () => {
  assert.equal(dLabel(TODAY, TODAY), '오늘');
  assert.equal(dLabel('2026-10-30', TODAY), 'D-3');
  assert.equal(dLabel('2026-10-25', TODAY), '2일 지남');
  const local = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).toISOString();
  assert.equal(logWhen(local(2026, 10, 27, 14, 5), TODAY), '오늘 14:05');
  assert.equal(logWhen(local(2026, 10, 26, 9, 0), TODAY), '어제');
  assert.equal(logWhen(local(2026, 10, 24, 9, 0), TODAY), '10/24');
  assert.deepEqual(guestFinish(STEPS, TODAY), { days: 30, date: '2026-11-26' });
});

test('날수 · 달 표기: 1부터 세고(0 → 1), 규정 날짜는 연도 + 뜻', async () => {
  const { dayLabel, dayRangeLabel, updateWhen } = await import('../../lib/client/format.ts');
  assert.equal(dayRangeLabel(0, 12), '1~12일째');
  assert.equal(dayRangeLabel(12, 13), '12~13일째');
  assert.equal(dayRangeLabel(0, 0), '1일째');
  assert.equal(dayLabel('Day 0-12'), '1~12일째');
  assert.equal(updateWhen('2026-11', '시행'), '2026년 11월 시행');
  assert.equal(updateWhen('2025-10', '발표'), '2025년 10월 발표');
  assert.equal(updateWhen('2026-09'), '2026년 9월');
  assert.equal(updateWhen('곧', '시행'), '곧 시행');
});

// ── 그림 재료(첫 손님 날 · 링 · 14단계 길 · 할 일 그림 · 담당 숫자 · 계좌별 남는 돈) ──
const stepSt = (status: 'todo' | 'doing' | 'done', targetDate: string | null = null) => ({ status, targetDate, note: '', version: 1, updatedAt: '', updatedBy: '' });

test('첫 손님 날: 마지막 단계 목표일이 있으면 그 날(추정 아님) · D-day · 링', () => {
  const s = summaryOf(STEPS, docOf([{ id: 'a', due: '2026-10-01', stepId: 1 }], {
    steps: { 1: stepSt('done'), 4: stepSt('todo', '2026-11-28') },
  }), TODAY);
  assert.deepEqual(s.finish, { date: '2026-11-28', estimate: false });
  assert.equal(s.dday, 32);
  assert.equal(s.start, '2026-10-01');
  assert.equal(s.span, 58);
  assert.equal(s.elapsed, 26);
});

test('첫 손님 날: 목표일이 없으면 단계 끝 중 가장 늦은 날(추정)', () => {
  const s = summaryOf(STEPS, docOf([]), TODAY);
  // 할 일 · 목표일이 없으면 출발일 = 오늘, 마지막 단계 끝 날수 30
  assert.deepEqual(s.finish, { date: '2026-11-26', estimate: true });
  assert.equal(s.dday, 30);
  assert.equal(s.elapsed, 0);
  assert.equal(s.span, 30);
});

test('첫 손님 날이 지났으면 D-day 는 음수, 링은 꽉 참(지난 날 = 전체 날)', () => {
  const s = summaryOf(STEPS, docOf([{ id: 'a', due: '2026-09-01' }], { steps: { 4: stepSt('doing', '2026-10-20') } }), TODAY);
  assert.equal(s.dday, -7);
  assert.equal(s.elapsed, s.span);
});

test('14단계 길: 끝 · 지금 · 하는 중 · 남음, 종류 그대로', () => {
  const s = summaryOf(STEPS, docOf([], { steps: { 1: stepSt('done'), 2: stepSt('doing'), 3: stepSt('doing') } }), TODAY, { currentId: 3 });
  assert.deepEqual(s.stepStates.map((r) => [r.id, r.state, r.type]), [[1, 'done', 'prep'], [2, 'doing', 'milestone'], [3, 'now', 'admin'], [4, 'todo', 'open']]);
});

test('지금 하는 단계: 할 일 끝낸 수 / 전체 수(지운 일 빼고), 목표일이 없으면 계산된 끝 날', () => {
  const s = summaryOf(STEPS, docOf([
    { id: 'a', stepId: 3, done: true }, { id: 'b', stepId: 3 }, { id: 'c', stepId: 3, deleted: true }, { id: 'd', stepId: 2 },
  ], { steps: { 3: stepSt('doing') } }), TODAY, { currentId: 3 });
  assert.deepEqual(s.active.map((a) => [a.id, a.done, a.all, a.openTasks]), [[3, 1, 2, 1]]);
  assert.equal(s.active[0].due, '2026-11-16'); // 출발일 = 오늘(할 일 마감 없음) + 셋째 단계 끝 20일
});

test('할 일 그림: 지남 칸 + 오늘 ~ 6일 뒤 7칸, 하루 5개 넘어도 다 담는다(그리기에서 줄인다)', () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, due: TODAY, stepId: i % 2 ? 2 : 1 }));
  const s = summaryOf(STEPS, docOf([...many, { id: 'late', due: '2026-10-20', stepId: 4 }, { id: 'd6', due: '2026-11-02' }, { id: 'd7', due: '2026-11-03' }]), TODAY);
  assert.equal(s.week.days.length, 7);
  assert.equal(s.week.days[0].date, TODAY);
  assert.equal(s.week.days[0].items.length, 7);
  assert.equal(s.week.days[0].items.filter((x) => x.type === 'milestone').length, 3);
  assert.deepEqual(s.week.late, [{ id: 'late', type: 'open' }]);
  assert.deepEqual(ids(s.week.days[6].items), ['d6']);
  assert.ok(!s.week.days.some((d) => d.items.some((x) => x.id === 'd7')));
});

test('담당 거르기: 그림은 거른 대로, 담당 숫자는 늘 전체 기준(같이 = 둘 다, 담당 없음 = 전체만)', () => {
  const doc = docOf([
    { id: 'both', due: TODAY, owner: '같이' }, { id: 'h', due: '2026-10-28', owner: '남편' }, { id: 'w', due: '2026-10-20', owner: '아내' },
    { id: 'none', due: TODAY }, { id: 'far', due: '2026-12-01', owner: '남편' },
  ]);
  const h = summaryOf(STEPS, doc, TODAY, { owner: '남편' });
  assert.deepEqual(ids(h.week.days[0].items), ['both']);
  assert.deepEqual(ids(h.week.days[1].items), ['h']);
  assert.deepEqual(h.week.late, []);
  assert.deepEqual(h.ownerCounts, { all: 4, 남편: 2, 아내: 2 });
  assert.deepEqual(summaryOf(STEPS, doc, TODAY).ownerCounts, h.ownerCounts);
});

test('돈: 계좌별 지금 · 다가오는 두 건 뒤 남는 돈 · 나가는 돈 합, 0 아래도 그대로', () => {
  const m = (id: string, date: string | null, amount: number | null, via: 'cash' | 'credit' = 'cash') => ({ ...meta, id, date, text: id, amount, via, estimate: false, project: 'oedomin' as const });
  const s = summaryOf(STEPS, docOf([], {
    money: { past: m('past', '2026-10-01', -5), a: m('a', '2026-10-30', -30), b: m('b', '2026-11-02', null, 'credit'), c: m('c', '2026-11-20', -1) },
    plan: { cash: 20, credit: 50, fork: '', version: 1, updatedAt: '', updatedBy: '' },
  }), TODAY);
  assert.ok(s.money);
  assert.deepEqual(s.money.after.map((a) => [a.via, a.now, a.after, a.out, a.rows.map((r) => r.item.id)]), [
    ['cash', 15, -15, 30, ['a']],
    ['credit', 50, 50, 0, ['b']],
  ]);
});

test('돈: 지금 여유를 안 적은 계좌는 빼고, 다가오는 건이 없으면 지금 = 뒤', () => {
  const m = (id: string, date: string, amount: number) => ({ ...meta, id, date, text: id, amount, via: 'cash' as const, estimate: false, project: 'oedomin' as const });
  const s = summaryOf(STEPS, docOf([], { money: { a: m('a', '2026-10-01', -5) }, plan: { cash: 20, credit: null, fork: '', version: 1, updatedAt: '', updatedBy: '' } }), TODAY);
  assert.deepEqual(s.money?.after.map((a) => [a.via, a.now, a.after, a.out]), [['cash', 15, 15, 0]]);
});

test('빈 데이터: 단계도 할 일도 없으면 그림 재료가 비어 있고 깨지지 않는다', () => {
  const s = summaryOf([], docOf([]), TODAY);
  assert.equal(s.finish, null);
  assert.equal(s.dday, null);
  assert.equal(s.start, null);
  assert.equal(s.span, 0);
  assert.equal(s.elapsed, 0);
  assert.deepEqual(s.stepStates, []);
  assert.equal(s.week.days.length, 7);
  assert.ok(s.week.days.every((d) => d.items.length === 0));
  assert.deepEqual(s.ownerCounts, { all: 0, 남편: 0, 아내: 0 });
  assert.equal(s.pinsTotal, 0);
  assert.equal(s.money, null);
});

test('firstGuest: 요약의 첫 손님 날 · D-day 와 같은 값(새 홈 달력 탭 맨 위 줄)', () => {
  for (const doc of [
    docOf([{ id: 'a', due: '2026-10-01', stepId: 1 }], { steps: { 1: stepSt('done'), 4: stepSt('todo', '2026-11-28') } }),
    docOf([]),
    docOf([{ id: 'a', due: '2026-09-01' }], { steps: { 4: stepSt('doing', '2026-10-20') } }),
  ]) {
    const s = summaryOf(STEPS, doc, TODAY);
    assert.deepEqual(firstGuest(STEPS, doc, TODAY), { finish: s.finish, dday: s.dday });
  }
  assert.deepEqual(firstGuest([], docOf([]), TODAY), { finish: null, dday: null });
});
