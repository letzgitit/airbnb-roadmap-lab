// 검색 글자 다루기 확인(node --test). 글은 모두 가짜 일반 낱말이다(공개 저장소 — 주소 · 이름 · 금액 · 전화번호 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  choseongOf, composingAt, fieldHas, isChoseongTerm, isLoneJamo, markRanges, mergeRanges, normalizeQuery, prepText, searchTerms, snippet, stripMarkdown,
} from './search-text.ts';

const cut = (raw: string, rs: [number, number][]) => rs.map(([a, b]) => raw.slice(a, b));

test('정규화: NFC 로 합치기 · 소문자 · 공백 여러 개 · 앞뒤 공백 · 100자 · 낱말 8개', () => {
  const nfd = '계약서'.normalize('NFD');
  assert.notEqual(nfd, '계약서');
  assert.equal(normalizeQuery(`  ${nfd}   SAMPLE\tCase  `), '계약서 sample case');
  assert.deepEqual(searchTerms('도배  장판 도배'), ['도배', '장판']);
  assert.equal(normalizeQuery('가'.repeat(150)).length, 100);
  assert.equal(searchTerms('가 나 다 라 마 바 사 아 자 차').length, 8);
  assert.deepEqual(searchTerms('   '), []);
  // 필드 글도 같은 규칙(화면 글은 공백 하나로)
  const p = prepText(`  욕실\n\n타일   ${'줄눈'.normalize('NFD')} `);
  assert.equal(p.raw, '욕실 타일 줄눈');
  assert.equal(p.compact, '욕실타일줄눈');
});

test('띄어쓰기: 「사업자등록」 ↔ 「사업자 등록」 양쪽', () => {
  const spaced = prepText('사업자 등록은 세무서에서 해요');
  const joined = prepText('사업자등록증 사본 준비');
  assert.ok(fieldHas(spaced, '사업자등록'));
  assert.ok(fieldHas(joined, '사업자등록'));
  assert.ok(fieldHas(joined, '등록'));
  assert.ok(fieldHas(spaced, '등록'));
  assert.ok(!fieldHas(spaced, '등록증'));
});

test('입력 중: 계 · 곙 · 계야 · 계약 · 계앿 · 계약서가 모두 같은 글을 찾음, 자모 한 글자는 찾지 않음', () => {
  const p = prepText('계약서를 두 부 챙겨 가요');
  for (const t of ['계', '곙', '계야', '계약', '계앿', '계약서']) assert.ok(fieldHas(p, t, { last: true }), t);
  assert.ok(isLoneJamo('ㄱ'));
  assert.ok(isLoneJamo(' ㅎ '));
  assert.ok(!isLoneJamo('계'));
  assert.ok(!isLoneJamo('ㄱㅇ'));
  // 마지막 낱말이 아니면 덜 친 글자를 보정하지 않는다
  assert.ok(!fieldHas(p, '곙', { last: false }));
  assert.ok(!fieldHas(p, '계앿', { last: false }));
  // 겹모음 · 겹받침으로 이어지는 중간 글자
  assert.ok(fieldHas(prepText('과자 사기'), '고', { last: true }));
  assert.ok(fieldHas(prepText('값 알아보기'), '갑', { last: true }));
  assert.ok(fieldHas(prepText('계약서'), '계약ㅅ', { last: true }));
  // 엉뚱한 글자는 안 걸림
  assert.ok(!fieldHas(p, '곳', { last: true }));
  assert.deepEqual(composingAt('계약서 계약금', '계앿'), [0]);
});

test('초성: 「ㄱㅇㅅ」가 제목 「계약서 챙기기」를 찾음, 본문에만 있으면 안 찾음, 한 글자는 초성 찾기가 아님', () => {
  const title = prepText('계약서 챙기기');
  const cho = choseongOf(title.raw);
  assert.equal(cho.s, 'ㄱㅇㅅㅊㄱㄱ');
  assert.ok(isChoseongTerm('ㄱㅇㅅ'));
  assert.ok(!isChoseongTerm('ㄱ'));
  assert.ok(!isChoseongTerm('ㄱa'));
  assert.ok(fieldHas(title, 'ㄱㅇㅅ', { cho }));
  assert.ok(!fieldHas(prepText('계약서 챙기기'), 'ㄱㅇㅅ')); // 초성 판을 주지 않은 필드(본문)
  assert.ok(!fieldHas(title, 'ㄱ', { cho }));
});

test('밑줄 자리: 겹침 합치기 · 같은 낱말 여러 번 · 대소문자 · 공백 뺀 판 · 초성 · 입력 중 · 써로게이트', () => {
  assert.deepEqual(mergeRanges([[5, 8], [0, 2], [1, 3], [8, 9]]), [[0, 3], [5, 9]]);
  const a = prepText('도배 하고 또 도배');
  assert.deepEqual(cut(a.raw, markRanges(a, ['도배'])), ['도배', '도배']);
  const b = prepText('Sample 계약 SAMPLE');
  assert.deepEqual(cut(b.raw, markRanges(b, ['sample'])), ['Sample', 'SAMPLE']);
  const c = prepText('사업자 등록은 세무서에서');
  assert.deepEqual(cut(c.raw, markRanges(c, ['사업자등록'])), ['사업자 등록']);
  const d = prepText('계약서 챙기기');
  assert.deepEqual(cut(d.raw, markRanges(d, ['ㄱㅇㅅ'], { cho: choseongOf(d.raw) })), ['계약서']);
  assert.deepEqual(cut(d.raw, markRanges(d, ['계앿'], { composeLast: true })), ['계약']);
  assert.deepEqual(cut(d.raw, markRanges(d, ['계약', '약서'])), ['계약서']); // 겹친 두 낱말은 한 줄로
  const e = prepText('😀 욕실 😀 타일');
  const re = markRanges(e, ['타일']);
  assert.deepEqual(cut(e.raw, re), ['타일']);
  const f = prepText('A😀B');
  assert.deepEqual(cut(f.raw, markRanges(f, ['😀'])), ['😀']); // 짝을 가르지 않는다
});

test('조각: 첫 걸린 자리 앞 18자쯤부터 · 잘렸으면 「…」 · 밑줄 자리도 옮김', () => {
  const long = `${'가나다라마바사아자차카타파하'.repeat(3)} 줄눈 다시 하기`;
  const p = prepText(long);
  const s = snippet(p, markRanges(p, ['줄눈']));
  assert.ok(s.text.startsWith('…'));
  assert.equal(s.text.indexOf('줄눈'), 1 + 18);
  assert.deepEqual(s.ranges.map(([a, b]) => s.text.slice(a, b)), ['줄눈']);
  const short = prepText('줄눈 다시 하기');
  const t = snippet(short, markRanges(short, ['다시']));
  assert.equal(t.text, '줄눈 다시 하기');
});

test('마크다운 기호 · 링크 주소 빼기', () => {
  const md = '## 왜 해야 하나요\n- **신분증** 챙기기\n1. [구청 안내](https://example.test/a) 보기\n> 알아 둘 것\n| 칸 | 값 |\n|---|---|\n| 서류 | 두 부 |\n---\n자세한 건 https://example.test/b 에서';
  const s = stripMarkdown(md);
  assert.ok(!/[#*>|]/.test(s), s);
  assert.ok(!s.includes('https://'), s);
  assert.ok(!s.includes('---'), s);
  for (const w of ['왜 해야 하나요', '신분증 챙기기', '구청 안내 보기', '알아 둘 것', '서류', '두 부', '자세한 건']) assert.ok(s.includes(w), w);
});
