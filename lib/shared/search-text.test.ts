// 검색 글자 다루기 확인(node --test). 글은 모두 가짜 일반 낱말이다(공개 저장소 — 주소 · 이름 · 금액 · 전화번호 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  choseongOf, composingAt, fieldHas, hotWords, isChoseongTerm, isLoneJamo, keywordPairs, markRanges, markText, mergeRanges, normalizeQuery, prepText, searchTerms, snippet, stripMarkdown,
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
  const long = `${'가나다라마바사아자차카타파하'.repeat(3)}줄눈 다시 하기`;
  const p = prepText(long);
  const s = snippet(p, markRanges(p, ['줄눈']));
  assert.ok(s.text.startsWith('…'));
  assert.equal(s.text.indexOf('줄눈'), 1 + 18); // 띄어쓰기도 문장 끝도 없으면 18자 앞 그대로
  assert.deepEqual(s.ranges.map(([a, b]) => s.text.slice(a, b)), ['줄눈']);
  const short = prepText('줄눈 다시 하기');
  const t = snippet(short, markRanges(short, ['다시']));
  assert.equal(t.text, '줄눈 다시 하기');
});

test('많이 나온 말: 조사 떼기(데일리 규칙) · 「○○하기」 · 흔한 말 빼기 · 제목 하나에 한 번 · 2번 이상', () => {
  assert.deepEqual(keywordPairs('계약서를 챙기기').map((p) => p[0]), ['계약서']);
  assert.deepEqual(keywordPairs('욕실에서 줄눈 다시 하기').map((p) => p[0]), ['욕실', '줄눈']);
  assert.deepEqual(keywordPairs('사업자 등록 신청하기').map((p) => p[0]), ['사업자', '등록', '신청']);
  const hot = hotWords(['계약서 사본 챙기기', '계약서를 다시 확인', '욕실 줄눈 계약서 계약서', '욕실 타일', '도배 견적']);
  assert.deepEqual(hot, [{ word: '계약서', n: 3 }, { word: '욕실', n: 2 }]);
  assert.equal(hotWords(['가 나 다']).length, 0);
});

test('많이 나온 말: 한 말이 다른 말 안에 들어 있으면 하나만(더 많이 나온 쪽, 같으면 짧은 쪽) · 상태 말(완료 · 진행) 빼기', () => {
  // 같으면 짧은 쪽: 「등기」 3 · 「등기부」 3 → 등기
  assert.deepEqual(hotWords(['등기 서류', '등기 신청', '등기 비용', '등기부 떼기', '등기부 확인', '등기부 사본']), [{ word: '등기', n: 3 }]);
  // 더 많이 나온 쪽: 「등기부」 3 · 「등기」 2 → 등기부
  assert.deepEqual(hotWords(['등기 서류', '등기 신청', '등기부 떼기', '등기부 확인', '등기부 사본']), [{ word: '등기부', n: 3 }]);
  // 셋이 이어져도 하나만: 등기 2 ⊂ 등기부 2 ⊂ 등기부등본 4 → 등기부등본
  assert.deepEqual(hotWords(['등기 a', '등기 b', '등기부 c', '등기부 d', '등기부등본 e', '등기부등본 f', '등기부등본 g', '등기부등본 h']), [{ word: '등기부등본', n: 4 }]);
  // 겹치지 않는 말은 그대로
  assert.deepEqual(hotWords(['계약서 사본', '계약서 원본', '욕실 사본']), [{ word: '계약서', n: 2 }, { word: '사본', n: 2 }]);
  // 상태 말은 세지 않는다
  assert.deepEqual(hotWords(['서류 접수 (완료)', '은행 답변 완료', '도배 진행 중', '타일 진행']), []);
});

test('많이 나온 말: 이름을 자르거나 빼지 않음(냉장고 · 영업신고 · 벽지 · 도면 · 와이파이), 받침에 맞는 조사만, 동작 말 빼기', () => {
  const ws = (s: string) => keywordPairs(s).map((p) => p[0]);
  assert.deepEqual(ws('냉장고 영업신고 벽지 도면 와이파이'), ['냉장고', '영업신고', '벽지', '도면', '와이파이']);
  assert.deepEqual(ws('에어컨이 계약을 계약서를 사진으로 거실로 침대와 이불과'), ['에어컨', '계약', '계약서', '사진', '거실', '침대', '이불']);
  assert.deepEqual(ws('커튼 고르기 문고리 바꾸기 하고 했다'), ['커튼', '문고리']);
});

test('조각: 소제목은 조각에서 빼고(따로 두어 찾기는 됨) · 목록 줄 끝에 「.」 · 문장 처음부터면 「…」 없이 · 없으면 띄어쓰기 뒤', () => {
  const md = '이름이 있어야 등록 서류에 쓸 수 있어요.\n## 어떻게 하나요\n- 짧고 부르기 쉬운 이름\n- **계약서 주소**와 헷갈리지 않게';
  assert.equal(stripMarkdown(md), '이름이 있어야 등록 서류에 쓸 수 있어요.\n어떻게 하나요.\n짧고 부르기 쉬운 이름.\n계약서 주소와 헷갈리지 않게.');
  const s = stripMarkdown(md, { headings: 'drop' });
  assert.equal(s, '이름이 있어야 등록 서류에 쓸 수 있어요.\n짧고 부르기 쉬운 이름.\n계약서 주소와 헷갈리지 않게.');
  assert.equal(stripMarkdown(md, { headings: 'only' }), '어떻게 하나요.');
  const p = prepText(s);
  const a = snippet(p, markRanges(p, ['계약서']));
  assert.equal(a.text, '계약서 주소와 헷갈리지 않게.');
  assert.deepEqual(a.ranges.map(([x, y]) => a.text.slice(x, y)), ['계약서']);
  const q = prepText('가나다라마바사아자차카타파하 가나다 계약서 사본');
  assert.equal(snippet(q, markRanges(q, ['계약서'])).text, '…가나다 계약서 사본');
});

test('줄바꿈을 살린 긴 글의 밑줄(펼친 기록 · 답)', () => {
  const m = markText('첫 줄\n계약서 사본\n끝', ['계약서']);
  assert.equal(m.text, '첫 줄\n계약서 사본\n끝');
  assert.deepEqual(m.ranges.map(([a, b]) => m.text.slice(a, b)), ['계약서']);
});

test('마크다운 기호 · 링크 주소 빼기', () => {
  const md = '## 왜 해야 하나요\n- **신분증** 챙기기\n1. [구청 안내](https://example.test/a) 보기\n> 알아 둘 것\n| 칸 | 값 |\n|---|---|\n| 서류 | 두 부 |\n---\n자세한 건 https://example.test/b 에서';
  const s = stripMarkdown(md);
  assert.ok(!/[#*>|]/.test(s), s);
  assert.ok(!s.includes('https://'), s);
  assert.ok(!s.includes('---'), s);
  for (const w of ['왜 해야 하나요', '신분증 챙기기', '구청 안내 보기', '알아 둘 것', '서류', '두 부', '자세한 건']) assert.ok(s.includes(w), w);
});
