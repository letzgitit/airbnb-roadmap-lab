// 검색 계산 확인(node --test). 값은 모두 가짜 일반 낱말 · 가짜 번호(010-0000-0000 꼴)다 — 공개 저장소.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, countText, hotOfDoc, jumpOf, rowView, search, GROUPS, type GuideBodies } from './search-model.ts';

const iso = '2026-10-20T00:00:00.000Z';
const base = { version: 1, createdAt: iso, updatedAt: iso, updatedBy: '나', deletedAt: null, deletedBy: null };
const T = (id: string, stepId: number, text: string, extra: Record<string, unknown> = {}) => ({
  id, stepId, text, due: null, done: false, doneBy: null, doneAt: null, createdBy: '나', ...base, ...extra,
});
const L = (id: string, text: string, extra: Record<string, unknown> = {}) => ({ id, at: iso, by: '나', kind: '메모', text, ...base, ...extra });
const P = (id: string, label: string, value: string, extra: Record<string, unknown> = {}) => ({ id, label, value, ...base, ...extra });
const M = (id: string, text: string, extra: Record<string, unknown> = {}) => ({ id, date: '2026-11-02', text, amount: -300, via: 'cash', estimate: false, project: 'oedomin', ...base, ...extra });
const Q = (id: string, text: string, answers: { text: string; deletedAt?: string | null }[] = [], extra: Record<string, unknown> = {}) => ({
  id, seq: 1, to: '친구', text, status: 'open', unread: false, createdBy: '나',
  answers: answers.map((a, i) => ({ id: `${id}a${i}`, by: '친구', at: iso, guestId: null, deletedBy: null, deletedAt: null, ...a })), ...base, ...extra,
});
const byId = <V extends { id: string }>(list: V[]) => Object.fromEntries(list.map((x) => [x.id, x]));

const doc = () => ({
  tasks: byId([
    T('t_a', 4, '계약서 챙기기', { due: '2026-11-01', note: '신분증도 같이' }),
    T('t_b', 7, '욕실 타일 줄눈 다시 하기', { due: '2026-10-30', note: '계약서 사본은 집주인에게' }),
    T('t_c', 7, '도배 장판 견적', { kind: '구매' }),
    T('t_d', 4, '계약서 원본 보관', { done: true, due: '2026-10-01' }),
    T('t_e', 13, '사업자 등록 신청', { due: '2026-11-20' }),
    T('t_f', 7, '세부 항목 하나', { parentId: 't_b' }),
    T('t_g', 7, '지운 계약서 할 일', { deletedAt: iso }),
    T('t_h', 11, '숙소 이름 짓기'),
  ]),
  log: [
    L('l_a', '계약서 도장 찍음', { at: '2026-10-21T01:00:00.000Z', kind: '결정' }),
    L('l_b', '욕실 공사 날짜 통화', { at: '2026-10-25T01:00:00.000Z', kind: '통화' }),
    L('l_c', '지운 계약서 기록', { deletedAt: iso }),
  ],
  property: byId([
    P('p_a', '연락처 · 도배집', '010-0000-1234 · 도배 견적'),
    P('p_b', '정한 것 · 침대', '더블 두 개'),
    P('p_c', '연락처 · 지운 곳', '010-0000-0000', { deletedAt: iso }),
    P('p_d', '면적', '계약서 기준 약 50'),
  ]),
  money: byId([M('m_a', '계약금'), M('m_b', '지운 돈', { deletedAt: iso }), M('m_c', '잔금', { amount: null, date: null })]),
  questions: byId([
    Q('q_a', '침구는 어디서 샀어요?', [{ text: '온라인 매장에서 묶음으로' }, { text: '지운 답 계약서', deletedAt: iso }]),
    Q('q_b', '계약서 특약은 어떻게?', [], { status: 'answered', createdAt: '2026-10-22T00:00:00.000Z' }),
  ]),
  guests: {},
}) as never;

const ids = (r: ReturnType<typeof search>, kind: string) => r.groups.find((g) => g.kind === kind)?.hits.map((h) => h.entry.id) ?? [];

test('낱말 AND: 다른 필드에 나뉘어 있어도 걸림, 하나라도 없으면 안 걸림', () => {
  const index = buildIndex(doc());
  assert.deepEqual(ids(search(index, '계약서 신분증'), 'task'), ['t_a']); // 제목 + 메모
  assert.deepEqual(ids(search(index, '계약서 없는말'), 'task'), []);
  assert.equal(search(index, '   ').total, 0);
  assert.deepEqual(search(index, '').groups, []);
});

test('순위: 제목 전부 > 제목 일부 > 본문 > 도움말만, 끝난 할 일은 묶음 맨 아래, 묶음 순서 고정', () => {
  const bodies: GuideBodies = { t_h: { text: '계약서 사본을 준비해요', version: 1 }, t_g: { text: '계약서', version: 1 } };
  const index = buildIndex(doc(), bodies);
  const r = search(index, '계약서');
  // t_a(제목) → t_b(메모) → t_h(도움말만) → 끝난 t_d(제목이지만 맨 아래). 지운 t_g 와 그 도움말은 없다
  assert.deepEqual(ids(r, 'task'), ['t_a', 't_b', 't_h', 't_d']);
  const tiers = r.groups[0].hits.map((h) => h.tier);
  assert.deepEqual(tiers, [0, 2, 3, 0]);
  // 일부만 제목에: 「계약서 사본」 — t_b 는 메모에 둘 다, t_h 는 도움말에 둘 다(제목에 없음)
  const r2 = search(index, '계약서 챙기기');
  assert.deepEqual(ids(r2, 'task'), ['t_a']);
  const r3 = search(index, '계약서 신분증');
  assert.equal(r3.groups[0].hits[0].tier, 1);
  // 묶음 순서: 할 일 → 기록 → 연락처 → 집 정보 → 자금 → 질문(빈 묶음은 빠짐)
  assert.deepEqual(r.groups.map((g) => g.kind), ['task', 'log', 'property', 'money', 'question'].filter((k) => r.groups.some((g) => g.kind === k)));
  const order = GROUPS.map((g) => g.kind);
  const seen = r.groups.map((g) => order.indexOf(g.kind));
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b));
  assert.match(countText(r), /^할 일 4건, 기록 1건/);
});

test('빼는 것: 지운 할 일 · 기록 · 집 정보 · 자금 · 질문, 지운 답, 지운 할 일의 도움말, 손님 링크', () => {
  const index = buildIndex(doc(), { t_g: { text: '아무말', version: 1 } });
  assert.equal(index.some((e) => ['t_g', 'l_c', 'p_c', 'm_b'].includes(e.id)), false);
  assert.equal(search(index, '아무말').total, 0);
  assert.equal(search(index, '지운').total, 0); // 지운 것들의 제목 · 지운 답
  assert.equal(index.filter((e) => e.kind === 'contact').length, 1);
  assert.equal(index.some((e) => e.kind === 'property' && e.item.label.startsWith('연락처')), false);
});

test('종류별 필드: 연락처 전화 숫자만 · 자금 금액 · 질문 답 · 할 일 종류 · 집 정보 값', () => {
  const index = buildIndex(doc());
  assert.deepEqual(ids(search(index, '00001234'), 'contact'), ['p_a']);
  assert.deepEqual(ids(search(index, '0000-1234'), 'contact'), ['p_a']);
  assert.deepEqual(ids(search(index, '300만'), 'money'), ['m_a']);
  assert.deepEqual(ids(search(index, '미정'), 'money'), []); // 금액 미정은 화면 메타일 뿐 찾는 글이 아니다
  assert.deepEqual(ids(search(index, '온라인'), 'question'), ['q_a']);
  assert.deepEqual(ids(search(index, '구매'), 'task'), ['t_c']);
  assert.deepEqual(ids(search(index, '더블'), 'property'), ['p_b']);
  // 질문: 답 기다리는 질문 먼저
  const qs = buildIndex({ ...(doc() as object), questions: byId([Q('q1', '계약 하나', [], { status: 'answered', createdAt: '2026-10-25T00:00:00.000Z' }), Q('q2', '계약 둘')]) } as never);
  assert.deepEqual(ids(search(qs, '계약'), 'question'), ['q2', 'q1']);
});

test('줄 모양: 제목 밑줄 · 메타 · 제목 밖이면 조각(필드 이름) · 끝난 할 일 「완료」', () => {
  const index = buildIndex(doc(), { t_h: { md: '## 준비\n- **계약서** 사본', version: 2 } });
  const r = search(index, '계약서');
  const [a, b, h, d] = r.groups[0].hits;
  const va = rowView(a, r.terms);
  assert.deepEqual(va.title.ranges, [[0, 3]]);
  assert.equal(va.snip, null);
  assert.ok(va.meta.some((m) => m.text === '행정'));
  assert.ok(va.meta.some((m) => m.text === '11월 1일까지' && m.date));
  const vb = rowView(b, r.terms);
  assert.equal(vb.snip?.name, '메모');
  assert.deepEqual(vb.snip!.ranges.map(([x, y]) => vb.snip!.text.slice(x, y)), ['계약서']);
  const vh = rowView(h, r.terms);
  assert.equal(vh.snip?.name, '도움말');
  assert.ok(!vh.snip!.text.includes('**') && !vh.snip!.text.includes('#'));
  const vd = rowView(d, r.terms);
  assert.equal(vd.done, true);
  assert.ok(vd.meta.some((m) => m.text === '완료'));
  // 메타 필드에서 걸리면 메타에 밑줄
  const rc = search(index, '구매');
  const vc = rowView(rc.groups[0].hits[0], rc.terms);
  assert.deepEqual(vc.meta.find((m) => m.text === '구매')?.ranges, [[0, 2]]);
});

test('갈 곳: 할 일 → 분야 탭(세부 항목은 부모를 따라감) · 도움말에서만이면 guide, 연락처 · 자금, 기록 · 집 정보 · 질문은 펼침(null)', () => {
  const index = buildIndex(doc(), { t_h: { text: '계약서', version: 1 } });
  const r = search(index, '계약서');
  const task = (id: string) => r.groups[0].hits.find((h) => h.entry.id === id)!;
  assert.deepEqual(jumpOf(task('t_a')), { kind: 'task', id: 't_a', tab: 'admin', stepId: 4, guide: false });
  assert.deepEqual(jumpOf(task('t_h')), { kind: 'task', id: 't_h', tab: 'ops', stepId: 11, guide: true });
  const sub = search(index, '세부 항목');
  assert.equal(jumpOf(sub.groups[0].hits[0])?.kind === 'task' && (jumpOf(sub.groups[0].hits[0]) as { tab: string }).tab, 'facility');
  assert.deepEqual(jumpOf(search(index, '도배집').groups[0].hits[0]), { kind: 'contact', id: 'p_a' });
  assert.deepEqual(jumpOf(search(index, '계약금').groups[0].hits[0]), { kind: 'money', id: 'm_a' });
  for (const k of ['log', 'property', 'question']) {
    const g = r.groups.find((x) => x.kind === k)!;
    assert.equal(jumpOf(g.hits[0]), null, k);
  }
  // 「자세히 보기」 기기: 연락처는 갈 화면이 없어 null(그 자리에서 보임), 할 일 · 자금은 그대로
  assert.equal(jumpOf(search(index, '도배집').groups[0].hits[0], { detail: true }), null);
  assert.equal(jumpOf(task('t_a'), { detail: true })?.kind, 'task');
  // 분야 탭을 못 찾은 할 일: 단계가 있으면 갈 곳(단계 시트로), 단계도 없으면 null(펼침)
  const orphan = buildIndex({ ...(doc() as object), tasks: byId([T('t_x', 7, '부모 지운 세부', { parentId: 't_gone' }), T('t_y', 0, '단계 없는 일')]) } as never);
  const ox = search(orphan, '부모 지운').groups[0].hits[0];
  assert.deepEqual(jumpOf(ox), { kind: 'task', id: 't_x', tab: null, stepId: 7, guide: false });
  assert.equal(jumpOf(search(orphan, '단계 없는').groups[0].hits[0]), null);
});

test('줄 모양: 기록은 쓴 사람을 싣지 않음 · 집 정보 조각 이름은 「내용」 · 답 개수', () => {
  const index = buildIndex(doc());
  const log = search(index, '도장').groups[0].hits[0];
  assert.deepEqual(rowView(log, ['도장']).meta.map((m) => m.text), ['결정', '10월 21일']);
  const prop = search(index, '더블');
  assert.equal(rowView(prop.groups[0].hits[0], prop.terms).snip?.name, '내용');
  const q = search(index, '침구');
  assert.ok(rowView(q.groups[0].hits[0], q.terms).meta.some((m) => m.text === '답 1개'));
  // 많이 나온 말은 안 끝난 할 일 제목에서만(끝난 「계약서 원본 보관」은 세지 않아 계약서는 1번 — 빠짐)
  assert.deepEqual(hotOfDoc(doc()), []);
  const two = { tasks: byId([T('a', 4, '계약서 챙기기'), T('b', 4, '계약서를 복사'), T('c', 4, '계약서 보관', { done: true })]) } as never;
  assert.deepEqual(hotOfDoc(two), [{ word: '계약서', n: 2 }]);
});

test('입력 중 · 초성으로도 결과가 같다(깜빡임 없음)', () => {
  const index = buildIndex(doc());
  const want = ids(search(index, '계약서'), 'task').filter((id) => id !== 't_b' && id !== 't_h');
  for (const q of ['계', '곙', '계야', '계약', '계앿']) {
    const got = ids(search(index, q), 'task');
    for (const id of want) assert.ok(got.includes(id), `${q} → ${id}`);
  }
  assert.deepEqual(ids(search(index, 'ㄱㅇㅅ'), 'task').slice(0, 2), ['t_a', 't_d']);
});

test('속도 연기 시험: 68만 자 가짜 글에서 찾기 p95 < 10ms', () => {
  const words = ['계약서', '욕실', '타일', '줄눈', '도배', '장판', '소화기', '감지기', '사본', '준비', '확인', '세무서', '등록', '에어컨', '실외기', '자리', '침대', '수건'];
  let seed = 7;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const text = (n: number) => Array.from({ length: n }, () => words[rnd(words.length)]).join(' ');
  const tasks = Array.from({ length: 103 }, (_, i) => T(`t_${i}`, 4 + (i % 10), text(4), { note: text(30) }));
  const bodies: GuideBodies = Object.fromEntries(tasks.map((t) => [t.id, { text: text(1900), version: 1 }]));
  const big = { ...(doc() as object), tasks: byId(tasks), log: Array.from({ length: 300 }, (_, i) => L(`l_${i}`, text(20))) } as never;
  const index = buildIndex(big, bodies);
  const chars = index.reduce((n, e) => n + e.title.raw.length + e.fields.reduce((m, f) => m + f.text.raw.length, 0), 0);
  assert.ok(chars > 600_000, String(chars));
  const qs = ['계약서 사본', '도배 장판', '없는 낱말 하나 둘', '곙', '계앿', 'ㄱㅇㅅ', '실외기', '사업자등록', '줄눈 타일 욕실', '수건'];
  const times: number[] = [];
  for (let k = 0; k < 20; k++) for (const q of qs) { const t0 = performance.now(); search(index, q); times.push(performance.now() - t0); }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)];
  assert.ok(p95 < 10, `p95 ${p95.toFixed(2)}ms`);
});
