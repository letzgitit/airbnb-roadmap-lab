#!/usr/bin/env node
// 개발 서버(DEV_FAKE_LOGIN_EMAIL 설정, ALLOWED_EMAILS 에 두 주소 포함)에 두 가짜 세션으로 붙어 동기화·충돌 규칙을 확인한다.
// 사용: node scripts/verify-sync.mjs [http://localhost:3100] [a@example.test] [b@example.test]
const BASE = process.argv[2] || 'http://localhost:3100';
const A = process.argv[3] || 'me@example.test';
const B = process.argv[4] || 'wife@example.test';
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) fails++; };

const call = async (who, path, body, qs = '') => {
  const res = await fetch(`${BASE}${path}${qs}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-dev-fake-email': who, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const get = (who, qs = '') => call(who, '/api/progress', null, qs);
const mut = (who, op) => call(who, '/api/progress/mutate', op);

// 0. 인증
{
  const anon = await fetch(`${BASE}/api/progress`);
  const forb = await get('stranger@example.test');
  const post = await fetch(`${BASE}/api/progress/mutate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  // 가짜 로그인이 켜진 개발 서버에서는 헤더가 없어도 env 기본 계정으로 들어간다 → 허용 밖 이메일 403 만 확인
  ok('허용 목록 밖 이메일 → 403', forb.status === 403, `(${forb.status})`);
  ok('(참고) 헤더 없는 요청', true, `GET ${anon.status} / POST ${post.status}`);
}

// 입력 검증
{
  const r1 = await mut(A, { op: 'task.add', stepId: 1, text: '   ' });
  const r2 = await mut(A, { op: 'task.add', stepId: 1, text: 'x'.repeat(201) });
  const r3 = await mut(A, { op: 'task.add', stepId: 1, text: 'ok', due: '2026-13-45' });
  const r4 = await mut(A, { op: 'task.add', stepId: 99, text: 'ok' });
  ok('빈 텍스트 400', r1.status === 400, r1.json?.message);
  ok('201자 400', r2.status === 400, r2.json?.message);
  ok('잘못된 날짜 400', r3.status === 400, r3.json?.message);
  ok('없는 단계 400', r4.status === 400);
}

// (d) 서로 다른 항목 동시 수정은 둘 다 반영
const t1 = (await mut(A, { op: 'task.add', stepId: 1, text: '[가짜] 항목1' })).json.result;
const t2 = (await mut(B, { op: 'task.add', stepId: 1, text: '[가짜] 항목2' })).json.result;
{
  const [ra, rb] = await Promise.all([
    mut(A, { op: 'task.update', id: t1.id, baseVersion: t1.version, patch: { text: '[가짜] 항목1 수정(A)' } }),
    mut(B, { op: 'task.update', id: t2.id, baseVersion: t2.version, patch: { text: '[가짜] 항목2 수정(B)' } }),
  ]);
  const doc = (await get(A)).json.doc;
  ok('(d) 서로 다른 항목 동시 수정 둘 다 200', ra.status === 200 && rb.status === 200, `(${ra.status},${rb.status})`);
  ok('(d) 둘 다 반영됨', doc.tasks[t1.id].text.endsWith('(A)') && doc.tasks[t2.id].text.endsWith('(B)'));
}

// (a) 같은 항목을 같은 version 으로 동시 수정 → 한쪽 409
{
  const cur = (await get(A)).json.doc.tasks[t1.id];
  const [ra, rb] = await Promise.all([
    mut(A, { op: 'task.update', id: t1.id, baseVersion: cur.version, patch: { text: '[가짜] A가 고침' } }),
    mut(B, { op: 'task.update', id: t1.id, baseVersion: cur.version, patch: { text: '[가짜] B가 고침' } }),
  ]);
  const codes = [ra.status, rb.status].sort();
  ok('(a) 같은 version 동시 수정: 한쪽 200 · 한쪽 409', codes[0] === 200 && codes[1] === 409, `(${ra.status},${rb.status})`);
  const loser = ra.status === 409 ? ra : rb;
  ok('(a) 409 응답에 최신 내용·수정자 포함', !!loser.json?.current?.text && !!loser.json?.by, `by=${loser.json?.by} current=${loser.json?.current?.text}`);
  // 덮어쓰기(force)
  const who = ra.status === 409 ? A : B;
  const f = await mut(who, { op: 'task.update', id: t1.id, baseVersion: cur.version, patch: { text: '[가짜] 덮어쓴 내용' }, force: true });
  ok('(a) force=true 덮어쓰기 200', f.status === 200 && f.json.result.text === '[가짜] 덮어쓴 내용');
}

// 체크는 version 없이도 병합(다른 사람이 글을 고친 뒤에도 체크는 통과)
{
  const r = await mut(B, { op: 'task.update', id: t2.id, patch: { done: true } });
  const doc = (await get(A)).json.doc;
  ok('체크 토글은 version 없이 병합', r.status === 200 && doc.tasks[t2.id].done && doc.tasks[t2.id].text.endsWith('(B)') && doc.tasks[t2.id].doneBy === 'wife');
}

// 동기화: A 가 체크 → B 가 폴링(since=version)으로 받는다
{
  const before = (await get(B)).json.doc;
  const un = await get(B, `?since=${before.version}`);
  ok('변경 없으면 unchanged', un.json.unchanged === true);
  const t0 = Date.now();
  await mut(A, { op: 'task.update', id: t1.id, patch: { done: true } });
  let got = null;
  while (Date.now() - t0 < 10_000) {
    const r = await get(B, `?since=${before.version}`);
    if (r.json.doc) { got = r.json.doc; break; }
    await new Promise((r2) => setTimeout(r2, 500));
  }
  ok('A 가 체크 → B 가 10초 안에 변경 수신', !!got && got.tasks[t1.id].done === true && got.lastAction.by === 'me', `(${Date.now() - t0}ms, 마지막 수정자=${got?.lastAction?.by}: ${got?.lastAction?.text})`);
}

// (b) 편집 중 배지
{
  await mut(A, { op: 'editing.set', key: `task:${t2.id}` });
  const r = await get(B);
  const m = r.json.doc.editing[`task:${t2.id}`];
  ok('(b) A 가 편집창 열면 B 에게 편집 중 표시', !!m && m.byName === 'me' && m.until > Date.now(), JSON.stringify(m));
  const r2 = await get(B, `?since=${r.json.doc.version}`);
  ok('(b) unchanged 응답에도 편집 중 표시 포함', r2.json.unchanged && !!r2.json.editing[`task:${t2.id}`]);
  await mut(A, { op: 'editing.clear', key: `task:${t2.id}` });
  const r3 = await get(B);
  ok('(b) 닫으면 표시 사라짐', !r3.json.doc.editing[`task:${t2.id}`]);
}

// (c) 삭제 후 복원, 삭제된 항목 수정은 410
{
  const t3 = (await mut(A, { op: 'task.add', stepId: 2, text: '[가짜] 지울 항목' })).json.result;
  await mut(A, { op: 'task.delete', id: t3.id });
  const upd = await mut(B, { op: 'task.update', id: t3.id, baseVersion: t3.version, patch: { text: '[가짜] 삭제된 걸 고침' } });
  ok('(3) 삭제된 항목을 상대가 수정 → 410 deleted', upd.status === 410 && upd.json.error === 'deleted', `by=${upd.json?.by}`);
  const res = await mut(B, { op: 'task.restore', id: t3.id });
  const doc = (await get(A)).json.doc;
  ok('(c) 복원 → 다시 보임', res.status === 200 && doc.tasks[t3.id].deletedAt === null);
}

// 기록·매물 정보 CRUD + 충돌
{
  const l = (await mut(A, { op: 'log.add', kind: '결정', text: '[가짜] 결정 기록' })).json.result;
  const l2 = await mut(B, { op: 'log.update', id: l.id, baseVersion: l.version, patch: { text: '[가짜] 수정됨' } });
  const l3 = await mut(A, { op: 'log.update', id: l.id, baseVersion: l.version, patch: { text: '[가짜] 낡은 version' } });
  ok('기록 수정 · 낡은 version 409', l2.status === 200 && l3.status === 409);
  const p = (await mut(A, { op: 'property.add', label: '인도일', value: '[가짜] 2026-12-01' })).json.result;
  const p2 = await mut(B, { op: 'property.update', id: p.id, baseVersion: p.version, patch: { value: '[가짜] 2026-12-15' } });
  ok('매물 정보 추가·수정', p2.status === 200 && p2.json.result.value.endsWith('12-15'));
  await mut(A, { op: 'property.delete', id: p.id });
  const restored = await mut(B, { op: 'property.restore', id: p.id });
  ok('매물 정보 삭제·복원', restored.status === 200 && restored.json.result.deletedAt === null);
  const step = await mut(A, { op: 'step.update', stepId: 3, baseVersion: 0, patch: { status: 'doing', targetDate: '2026-11-20', note: '[가짜]' } });
  const stale = await mut(B, { op: 'step.update', stepId: 3, baseVersion: 0, patch: { note: '낡은 version' } });
  ok('단계 수정 · 낡은 version 409', step.status === 200 && stale.status === 409);
}

console.log(fails ? `\n실패 ${fails}건` : '\n모두 통과');
process.exit(fails ? 1 : 0);
