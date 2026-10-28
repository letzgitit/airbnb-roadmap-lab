// 트리 간트 줄 목록 · 축 계산 확인(node --test, 새 의존성 없이). 값은 모두 가짜다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ganttRows, initialOpen, phasesOf, spanOf, taskRange, tasksOf, type GTask, type PhaseIn, type Row } from './gantt-model.ts';
import { axisOf, dayWidth, todayScroll } from './gantt-scale.ts';

const TODAY = '2026-10-27';
const phase = (id: number, o: Partial<PhaseIn> = {}): PhaseIn => ({
  id, title: `단계 ${id}`, start: 0, end: 5, type: id % 2 ? 'prep' : 'setup', from: '2026-10-20', to: '2026-11-09',
  done: false, target: '2026-11-09', current: false, doing: false, ...o,
});
let n = 0;
const task = (stepId: number, o: Partial<GTask> = {}): GTask => ({
  id: `t${++n}`, stepId, text: `할 일 ${n}`, start: null, due: null, done: false, parentId: null, order: String(n).padStart(3, '0'), ...o,
});
const kinds = (rows: Row[]) => rows.map((r) => r.k);
const base = { open: new Set<number>(), openTask: new Set<string>(), showDone: false, types: [] as string[], editing: null, guest: false };

test('빈 데이터: 단계 줄만, 할 일 0/0, 처음엔 아무것도 안 펼침', () => {
  const ps = phasesOf([phase(1), phase(2)], [], TODAY);
  assert.deepEqual(ps.map((p) => [p.leafDone, p.leafTotal, p.pct]), [[0, 0, 0], [0, 0, 0]]);
  assert.equal(initialOpen(ps, TODAY).open.size, 0);
  assert.deepEqual(kinds(ganttRows(ps, base)), ['sep', 'phase', 'gap', 'phase']);
});

test('tasksOf: 지운 할 일은 빼고, 부모가 없어진 세부 항목은 맨 위로', () => {
  const meta = { version: 1, createdAt: '2026-10-01T00:00:00Z', createdBy: 'a', updatedAt: '', updatedBy: 'a', deletedBy: null, doneBy: null, doneAt: null };
  const doc = { tasks: {
    t_a: { ...meta, id: 't_a', stepId: 1, text: 'a', due: null, done: false, deletedAt: null },
    t_b: { ...meta, id: 't_b', stepId: 1, text: 'b', due: null, done: false, deletedAt: '2026-10-02T00:00:00Z' },
    t_c: { ...meta, id: 't_c', stepId: 1, text: 'c', due: '2026-10-30', start: '2026-10-28', done: false, deletedAt: null, parentId: 't_b' },
  } };
  const ts = tasksOf(doc);
  assert.deepEqual(ts.map((t) => t.id), ['t_a', 't_c']);
  assert.equal(ts[1].parentId, null);
  assert.equal(ts[1].start, '2026-10-28');
});

test('시작일 없음 · 세부 항목: 막대 기간, 시작일 순서, 할 일 n/m 은 세부 항목까지 센다', () => {
  const p = task(1, { due: '2026-11-02', text: '부모' });
  const k1 = task(1, { due: '2026-10-25', done: true, parentId: p.id });
  const k2 = task(1, { start: '2026-10-28', due: '2026-10-29', parentId: p.id });
  const solo = task(1, { start: '2026-10-21', due: '2026-10-23', done: true });
  const [ph] = phasesOf([phase(1)], [p, k1, k2, solo], TODAY);
  assert.deepEqual(ph.tasks.map((t) => t.id), [solo.id, p.id]); // 시작일(없으면 마감일) 순
  assert.deepEqual(ph.kids[p.id].map((t) => t.id), [k1.id, k2.id]);
  assert.equal(ph.leafTotal, 3); // 부모는 세지 않는다
  assert.equal(ph.leafDone, 2);
  assert.deepEqual(taskRange(p, ph.kids[p.id]), { from: '2026-11-02', to: '2026-11-02', derived: false }); // 시작일 없음 = 마감일 하루
  const bare = task(1, { text: '날짜 없음 부모' });
  assert.deepEqual(taskRange(bare, [k1, k2]), { from: '2026-10-25', to: '2026-10-29', derived: true });
  assert.equal(taskRange(task(1)), null);
  assert.deepEqual(taskRange(task(1, { start: '2026-11-01' })), { from: '2026-11-01', to: '2026-11-01', derived: false });
});

test('처음 펼침: 지금 · 진행 중 · 기한 지남 · 7일 안 마감만, 끝난 단계는 안 펼침', () => {
  const ts = [
    task(2, { due: '2026-10-20' }), // 기한 지남
    task(3, { due: '2026-11-03' }), // 7일 안
    task(4, { due: '2026-11-04' }), // 8일 뒤
    task(5, { due: '2026-10-20', done: true }),
  ];
  const ps = phasesOf([phase(1, { current: true }), phase(2), phase(3), phase(4), phase(5), phase(6, { doing: true }), phase(7, { done: true, current: false })], ts, TODAY);
  assert.deepEqual([...initialOpen(ps, TODAY).open].sort(), [1, 2, 3, 6]);
  assert.equal(ps[1].late, 1);
});

test('세부 항목: 7일 안 마감이 있으면 처음부터 펼치고, 줄 순서 · 트리 선이 맞다', () => {
  const p = task(1, { due: '2026-11-10' });
  const k1 = task(1, { due: '2026-10-29', parentId: p.id });
  const k2 = task(1, { due: '2026-11-08', parentId: p.id });
  const q = task(1, { due: '2026-11-12' });
  const ps = phasesOf([phase(1)], [p, k1, k2, q], TODAY);
  const o = initialOpen(ps, TODAY);
  assert.ok(o.open.has(1) && o.openTask.has(p.id));
  const rows = ganttRows(ps, { ...base, ...o });
  assert.deepEqual(kinds(rows), ['sep', 'phase', 'task', 'sub', 'sub', 'task', 'add']);
  const flags = rows.map((r) => ('more1' in r ? `${+r.more1}${+r.more2}` : '-'));
  assert.deepEqual(flags, ['-', '10', '11', '11', '10', '10', '00']);
  // 세부 항목을 접으면 sub 줄이 빠진다
  assert.deepEqual(kinds(ganttRows(ps, { ...base, open: o.open })), ['sep', 'phase', 'task', 'task', 'add']);
});

test('끝난 단계: 맨 위 「끝난 단계 n개」로 접고, 펴면 그 아래에', () => {
  const ps = phasesOf([phase(1, { done: true }), phase(2, { done: true }), phase(3)], [], TODAY);
  assert.deepEqual(kinds(ganttRows(ps, base)), ['fold', 'gap', 'phase']);
  const rows = ganttRows(ps, { ...base, showDone: true });
  assert.deepEqual(kinds(rows), ['fold', 'gap', 'phase', 'gap', 'phase', 'gap', 'phase']);
  assert.equal((rows[0] as { n: number }).n, 2);
});

test('거르기: 고른 종류의 단계만, 끝난 단계 수도 거른 뒤', () => {
  const ps = phasesOf([phase(1, { done: true }), phase(2), phase(3)], [], TODAY); // 1 · 3 = prep, 2 = setup
  const rows = ganttRows(ps, { ...base, types: ['setup'] });
  assert.deepEqual(kinds(rows), ['sep', 'phase']);
  assert.deepEqual(kinds(ganttRows(ps, { ...base, types: ['milestone'] })), []);
});

test('편집 폼 자리: 고치기 = 그 줄 밑, 새 할 일 = 단계 끝, 새 세부 항목 = 세부 항목 끝', () => {
  const p = task(1, { due: '2026-10-30' });
  const k = task(1, { due: '2026-10-29', parentId: p.id });
  const ps = phasesOf([phase(1)], [p, k], TODAY);
  const open = { ...base, open: new Set([1]), openTask: new Set([p.id]) };
  assert.deepEqual(kinds(ganttRows(ps, { ...open, editing: { kind: 'edit', id: p.id } })), ['sep', 'phase', 'task', 'form', 'sub', 'add']);
  assert.deepEqual(kinds(ganttRows(ps, { ...open, editing: { kind: 'new', stepId: 1 } })), ['sep', 'phase', 'task', 'sub', 'add', 'form']);
  const sub = ganttRows(ps, { ...open, editing: { kind: 'newsub', parentId: p.id } });
  assert.deepEqual(kinds(sub), ['sep', 'phase', 'task', 'sub', 'form', 'add']);
  assert.equal((sub[4] as { lv: number }).lv, 2);
  // 로그인 전: 단계 줄만
  assert.deepEqual(kinds(ganttRows(ps, { ...open, guest: true, editing: { kind: 'edit', id: p.id } })), ['sep', 'phase']);
});

test('축 범위: 보이는 단계 · 할 일 · 목표일 · 오늘을 담고 월요일~일요일, 먼 고정 일정은 넓히지 않는다', () => {
  const ps = phasesOf([phase(1, { done: true, from: '2026-09-01', to: '2026-09-10', target: '2026-09-10' }), phase(2, { from: '2026-10-21', to: '2026-11-09' })],
    [task(2, { start: '2026-10-14', due: '2026-10-16' }), task(2, { due: '2026-11-18' })], TODAY);
  const a = spanOf(ps, [{ date: '2026-11-25', label: '가까움' }, { date: '2027-03-01', label: '먼 날' }], TODAY, { showDone: false, types: [] });
  assert.deepEqual(a, { first: '2026-10-12', last: '2026-11-29' });
  const b = spanOf(ps, [], TODAY, { showDone: true, types: [] });
  assert.equal(b.first, '2026-08-31');
});

test('하루 폭: 일 · 주 · 달, 폰 · PC, 보이는 폭을 다 채움', () => {
  assert.equal(dayWidth('day', true, 360, 70), 30);
  assert.equal(dayWidth('week', false, 1000, 70), 16);
  assert.equal(dayWidth('month', true, 360, 70), 360 / 70); // 4px × 70 = 280 < 360 → 늘림
  assert.equal(dayWidth('month', false, 1200, 70), 1200 / 70);
});

test('날짜 머리: 달이 바뀌는 자리 · 월요일 숫자 · 오늘 글자 옆 숫자 빼기 · 주말', () => {
  // 2026-10-26(월) ~ 2026-11-08(일), 주 단위 12px
  const w = axisOf('2026-10-26', '2026-11-08', 12, 'week', TODAY);
  assert.deepEqual(w.months.map((m) => m.text), ['10월', '11월']); // 첫 칸: 다음 달까지 6일 × 12 = 72px > 40 이라 「10월」도
  assert.equal(w.todayX, 1 * 12 + 6);
  assert.deepEqual(w.days.map((d) => d.text), ['2']); // 10/26 은 오늘 글자와 겹쳐 뺀다
  assert.deepEqual(w.lines.map((l) => l.kind), ['month', 'week']);
  const d = axisOf('2026-10-26', '2026-11-08', 30, 'day', TODAY);
  assert.equal(d.weekends.length, 4);
  assert.ok(!d.days.some((x) => x.text === '27'));
  assert.ok(d.days.some((x) => x.text === '29'));
  const m = axisOf('2026-09-28', '2026-12-13', 4, 'month', TODAY);
  assert.deepEqual(m.months.map((x) => x.text), ['10월', '11월', '12월']);
  assert.ok(m.lines.every((l) => l.kind !== 'week'));
});

test('날짜 머리: 월요일 숫자 자리로 달이 바뀌는 선이 지나가면 숫자를 뺀다', () => {
  const m = axisOf('2026-11-23', '2026-12-13', 8, 'month', '2026-11-01'); // 11/30(월) 다음 날 12/1 → 8px 뒤 선
  assert.deepEqual(m.days.map((d) => d.text), ['23', '7']);
  const w = axisOf('2026-11-23', '2026-12-13', 16, 'week', '2026-11-01'); // 16px 뒤 선 → 숫자 자리 안
  assert.ok(!w.days.some((d) => d.text === '30'));
  assert.ok(axisOf('2026-11-23', '2026-12-13', 30, 'week', '2026-11-01').days.some((d) => d.text === '30')); // 30px 뒤면 남김
});

test('「오늘 27」: 달이 바뀌는 선을 넘거나 그달 이름이 없으면 「오늘 10/27」', () => {
  assert.equal(axisOf('2026-10-26', '2026-12-13', 12, 'week', TODAY).todayText, '오늘 27');
  const g = axisOf('2026-10-26', '2026-12-13', 360 / 49, 'month', TODAY); // 로그인 전 폰 달 단위: 11/1 선이 글자 안으로
  assert.equal(g.todayText, '오늘 10/27');
  assert.ok(g.labelX! >= 40);
  assert.equal(axisOf('2026-10-26', '2026-12-13', 4, 'month', '2026-11-11').todayText, '오늘 11');
});

test('오늘 자리: 보이는 폭 30%, 0 보다 작지 않음', () => {
  assert.equal(todayScroll('2026-10-26', 12, TODAY, 360), 0);
  assert.equal(todayScroll('2026-09-28', 12, TODAY, 360), 29 * 12 + 6 - 108);
});
