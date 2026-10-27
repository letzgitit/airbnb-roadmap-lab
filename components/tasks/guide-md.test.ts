// 할 일 참고(설명서) 마크다운 읽기 확인(node --test). 예시 글은 일반 설명만 — 개인정보 없음.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostOf, parseGuide, parseInline, plainText } from './guide-md.ts';

test('소제목 · 문단 · 줄바꿈', () => {
  const b = parseGuide('## 왜 해야 하나요\n첫 줄\n둘째 줄\n\n### 작은 제목\n다음 문단');
  assert.deepEqual(b.map((x) => x.t), ['h', 'p', 'h', 'p']);
  assert.equal(b[0].t === 'h' && b[0].level, 1);
  assert.equal(b[2].t === 'h' && b[2].level, 2);
  assert.deepEqual(b[1].t === 'p' && b[1].c.map((x) => x.t), ['text', 'br', 'text']);
});

test('점 목록 · 번호 목록 · 들여 쓴 줄은 앞 항목에', () => {
  const b = parseGuide('- 신분증\n- 도장\n  (없으면 서명)\n\n3. 셋째\n4) 넷째');
  assert.equal(b[0].t, 'ul');
  if (b[0].t === 'ul') { assert.equal(b[0].items.length, 2); assert.equal(plainText(b[0].items[1]), '도장\n(없으면 서명)'); }
  assert.equal(b[1].t, 'ol');
  if (b[1].t === 'ol') { assert.equal(b[1].start, 3); assert.equal(b[1].items.length, 2); }
});

test('인용문 = 알아 두기 상자(안에 목록도)', () => {
  const b = parseGuide('> **알아 두기**\n> - 평일만\n> - 9시~6시\n밖');
  assert.equal(b[0].t, 'quote');
  if (b[0].t === 'quote') assert.deepEqual(b[0].blocks.map((x) => x.t), ['p', 'ul']);
  assert.equal(b[1].t, 'p');
});

test('표: 머리 줄 + 나눔 줄 + 본문', () => {
  const b = parseGuide('| 준비물 | 어디서 |\n|---|---|\n| 신분증 | 집 |\n| 계약서 | 서랍 |');
  assert.equal(b.length, 1);
  if (b[0].t === 'table') { assert.equal(b[0].head?.length, 2); assert.equal(b[0].rows.length, 2); assert.equal(plainText(b[0].rows[1][0]), '계약서'); }
  else assert.fail('표가 아님');
});

test('굵게 · 링크(도메인) · 맨 주소 · 위험한 주소는 글자로', () => {
  const a = parseInline('**꼭** [정부24](https://www.gov.kr/portal) 또는 https://example.com/a. 끝');
  assert.deepEqual(a.map((x) => x.t), ['b', 'text', 'a', 'text', 'a', 'text']);
  const link = a[2];
  assert.ok(link.t === 'a' && link.host === 'gov.kr' && link.href === 'https://www.gov.kr/portal');
  const bare = a[4];
  assert.ok(bare.t === 'a' && bare.href === 'https://example.com/a'); // 끝의 마침표는 빼고
  const bad = parseInline('[눌러](javascript:alert(1))');
  assert.ok(bad.every((x) => x.t === 'text'));
  assert.equal(hostOf('tel:010'), '');
});

test('가로줄 · 빈 글', () => {
  assert.deepEqual(parseGuide('위\n\n---\n\n아래').map((x) => x.t), ['p', 'hr', 'p']);
  assert.deepEqual(parseGuide(''), []);
  assert.deepEqual(parseGuide('  \n \n'), []);
});
