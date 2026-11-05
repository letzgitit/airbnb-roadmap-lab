// 받는 파일 이름 확인(node --test). 글은 모두 가짜 일반 낱말이다(공개 저장소).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDownloadName, cleanPart, datePart } from './download-name.ts';

test('묶음 · 설명 · 날짜를 하이픈으로 잇는다', () => {
  assert.equal(buildDownloadName({ label: '3. 공사', caption: '주방 벽', date: '2026-10-14T13:05:22', ext: 'jpg' }), '3. 공사-주방 벽-2026-10-14.jpg');
});
test('비어 있는 조각은 건너뛴다', () => {
  assert.equal(buildDownloadName({ label: '', caption: '거실', date: '', ext: 'pdf' }), '거실.pdf');
  assert.equal(buildDownloadName({ label: '참고', caption: '', date: '2026-01-02', ext: 'jpg' }), '참고-2026-01-02.jpg');
});
test('다 비면 「사진」', () => {
  assert.equal(buildDownloadName({ ext: 'jpg' }), '사진.jpg');
});
test('설명이 묶음 이름과 같으면 한 번만', () => {
  assert.equal(buildDownloadName({ label: '거실', caption: '거실', date: '2026-01-02', ext: 'jpg' }), '거실-2026-01-02.jpg');
});
test('파일 이름에 못 쓰는 글자를 거른다', () => {
  assert.equal(cleanPart('a/b\\c:d*e?f"g<h>i|j'), 'a b c d e f g h i j');
  assert.equal(cleanPart('줄\n바꿈\t탭'), '줄 바꿈 탭');
  assert.equal(cleanPart('..숨김..'), '숨김');
});
test('긴 설명은 글자 수로 자른다(이모지도 안 깨짐)', () => {
  assert.equal(cleanPart('가나다라마바사아자차', 4), '가나다라');
  assert.equal(cleanPart('😀😀😀😀', 2), '😀😀');
});
test('날짜 조각', () => {
  assert.equal(datePart('2026-10-14T13:05:22'), '2026-10-14');
  assert.equal(datePart('어제'), '');
  assert.equal(datePart(null), '');
});
