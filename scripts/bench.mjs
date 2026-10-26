#!/usr/bin/env node
// 「꾸미기 참고」(인테리어 벤치마킹 모음) 묶음을 터미널에서 넣고 · 보는 CLI. 사이트 API 와 같은 처리(lib/core/bench.ts)를 쓴다.
// 저장소: 환경변수에 Upstash(KV_REST_API_* 또는 UPSTASH_REDIS_REST_*)가 있으면 원격(운영), 없으면 .data/bench/ (로컬 연습용)
// 어느 저장소에 붙었는지는 매번 stderr 첫 줄에 찍힌다. 원격(운영)에 쓰려면 --yes 가 필요하다.
// 🔴 수집 결과(우리 집 이야기 포함)는 공개 저장소에 두지 않는다. 묶음 JSON 은 저장소 밖(예: 스크래치패드)에 둔다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userCwd = process.cwd();
process.chdir(root);
for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(path.join(root, f)); } catch { /* 없으면 건너뜀 */ } }

const B = await import('../lib/core/bench.ts');

function usage(msg) {
  if (msg) console.error(`오류: ${msg}\n`);
  console.error(`사용법:
  node scripts/bench.mjs get [--json]
  node scripts/bench.mjs add <묶음.json> [--replace] [--by <이름>] [--dry-run] [--yes]
  node scripts/bench.mjs delete <YYYY-MM-DD> [--yes]
  node scripts/bench.mjs links [--pending] [--json]
  node scripts/bench.mjs links-fill <파일.json> [--dry-run] [--yes]
  node scripts/bench.mjs public [--json]                  공개 화면(로그인 안 한 방문자)에 보일 항목 보기
  node scripts/bench.mjs publish <항목 id>... [--dry-run] [--yes]     공개로 고르기
  node scripts/bench.mjs unpublish <항목 id>... [--dry-run] [--yes]   공개에서 빼기
  --dry-run  형식만 검사하고 쓰지 않음
  --replace  같은 수집일(collectedAt) 묶음이 이미 있으면 바꿔 넣기(없으면 멈춤)
  --pending  (links) 설명이 아직 비어 있는 올린 링크만
  --yes      원격(운영) 저장소에 실제로 쓸 때 필요
자세한 내용: scripts/README-bench.md`);
  process.exit(2);
}

// ── 인자 ──
const [cmd, ...rest] = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--by']);
const KNOWN = new Set(['--json', '--yes', '--dry-run', '--replace', '--pending', ...VALUE_FLAGS]);
const opts = {};
const pos = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (!a.startsWith('--')) { pos.push(a); continue; }
  if (!KNOWN.has(a)) usage(`모르는 옵션 ${a}`);       // 오타(--dryrun 등)로 실제 쓰기가 되는 일을 막는다
  if (VALUE_FLAGS.has(a)) {
    const v = rest[++i];
    if (v === undefined || v.startsWith('--')) usage(`${a} 뒤에 값이 필요합니다.`);
    opts[a] = v;
  } else opts[a] = true;
}

const store = B.benchStoreInfo();
const remote = store.kind === 'redis';
// 결과 JSON 은 stdout, 안내는 stderr
console.error(`[저장소] ${store.label}${remote ? '  ← 원격(운영) 데이터' : '  (로컬 연습용)'}`);

function needYes(summary) {
  for (const l of summary) console.error(`  ${l}`);
  if (opts['--dry-run']) { console.error('dry-run: 쓰지 않았습니다.'); return false; }
  if (remote && !opts['--yes']) {
    console.error('원격(운영) 저장소입니다. 위 내용이 맞으면 --yes 를 붙여 다시 실행하세요(미리 보기는 --dry-run).');
    process.exit(3);
  }
  return true;
}

const VOTE = { up: '좋아요', down: '별로' };

try {
  if (cmd === 'get') {
    const [batches, reactions] = await Promise.all([B.listBatches(), B.listReactions()]);
    const byItem = new Map();
    for (const r of reactions) byItem.set(r.itemId, [...(byItem.get(r.itemId) ?? []), r]);
    if (opts['--json']) {
      // 반응을 항목 안에 붙여 낸다(이메일 포함 — 터미널 전용)
      console.log(JSON.stringify(batches.map((b) => ({ ...b, items: b.items.map((it) => ({ ...it, reactions: byItem.get(it.id) ?? [] })) })), null, 2));
      process.exit(0);
    }
    console.log(`묶음 ${batches.length}개 · 항목 ${batches.reduce((n, b) => n + b.items.length, 0)}건 · 반응 ${reactions.length}건 · 올린 링크 ${(await B.listLinks()).length}건(자세히: links)`);
    for (const b of batches) {
      console.log(`\n[${b.collectedAt}] 항목 ${b.items.length}건 · 공통 패턴 ${b.insights.length}개  (넣은 사람 ${b.addedBy}, ${b.addedAt.slice(0, 16)})`);
      for (const ins of b.insights) console.log(`  * ${ins.title}`);
      for (const it of b.items) {
        console.log(`  - ${it.id}  [${it.space} · ${it.source}] ${it.title}`);
        for (const r of byItem.get(it.id) ?? []) console.log(`      ${r.name}: ${r.vote ? VOTE[r.vote] : '-'}${r.memo ? ` — ${r.memo}` : ''}  (${r.updatedAt.slice(0, 16)})`);
      }
    }
    const orphan = reactions.filter((r) => !batches.some((b) => b.items.some((it) => it.id === r.itemId)));
    if (orphan.length) console.log(`\n(지금 묶음에 없는 항목의 반응 ${orphan.length}건: ${[...new Set(orphan.map((r) => r.itemId))].join(', ')})`);
  } else if (cmd === 'add') {
    if (!pos[0]) usage('묶음 JSON 파일 경로가 필요합니다.');
    const raw = JSON.parse(fs.readFileSync(path.resolve(userCwd, pos[0]), 'utf8'));
    const b = B.parseBatch(raw);                     // 형식이 틀리면 여기서 멈춘다(아무것도 쓰지 않음)
    const cur = await B.getBatch(b.collectedAt);
    if (cur && !opts['--replace']) throw new B.BenchError(409, 'exists', `${b.collectedAt} 묶음이 이미 있습니다(${cur.items.length}건). 바꾸려면 --replace 를 붙이세요.`);
    const count = (k) => b.items.filter((it) => it.space === k).length;
    const lines = [
      `${cur ? '바꿔 넣기' : '새 묶음'} ${b.collectedAt}: 항목 ${b.items.length}건 · 공통 패턴 ${b.insights.length}개${cur ? ` (지금 ${cur.items.length}건 → ${b.items.length}건)` : ''}`,
      `공간별: ${B.BENCH_SPACES.map((k) => [k, count(k)]).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(' · ') || '-'}`,
      `그림 있음 ${b.items.filter((it) => it.image).length}건 · 주의점 있음 ${b.items.filter((it) => it.caution).length}건`,
    ];
    if (!needYes(lines)) { console.log(JSON.stringify({ store: store.kind, written: false, dryRun: true, collectedAt: b.collectedAt, items: b.items.length, insights: b.insights.length, exists: !!cur })); process.exit(0); }
    const { batch, replaced } = await B.addBatch(raw, opts['--by'] || 'claude', { replace: !!opts['--replace'] });
    console.log(JSON.stringify({ store: store.kind, written: true, replaced, collectedAt: batch.collectedAt, items: batch.items.length, insights: batch.insights.length }));
  } else if (cmd === 'delete') {
    const day = pos[0];
    if (!day) usage('지울 묶음의 수집일(YYYY-MM-DD)이 필요합니다.');
    const cur = await B.getBatch(day);
    if (!cur) throw new Error(`묶음을 찾지 못했습니다: ${day}`);
    if (!needYes([`묶음 지우기(되살릴 수 없음): ${day} 항목 ${cur.items.length}건. 반응은 남습니다.`])) process.exit(0);
    console.log(JSON.stringify({ ok: await B.deleteBatch(day), collectedAt: day }));
  } else if (cmd === 'links') {
    let links = await B.listLinks();
    if (opts['--pending']) links = links.filter((l) => l.status === 'pending');
    if (opts['--json']) {
      const rx = await B.listReactions();
      // 이메일 포함 — 터미널 전용
      console.log(JSON.stringify(links.map((l) => ({ ...l, reactions: rx.filter((r) => r.itemId === l.id) })), null, 2));
      process.exit(0);
    }
    console.log(`올린 링크 ${links.length}건${opts['--pending'] ? ' (설명 비어 있는 것만)' : ''}`);
    for (const l of links) {
      console.log(`  - ${l.id}  [${l.status === 'done' ? '채움' : '비어 있음'} · ${l.space ?? '공간 미정'} · ${l.source}] ${l.title}`);
      console.log(`      ${l.url}`);
      console.log(`      ${l.addedBy}${l.note ? ` — ${l.note}` : ''}  (${l.addedAt.slice(0, 16)})  그림 ${l.image ? '있음' : '없음'}`);
    }
  } else if (cmd === 'links-fill') {
    if (!pos[0]) usage('채울 내용 JSON 파일 경로가 필요합니다.');
    const fills = B.parseLinkFills(JSON.parse(fs.readFileSync(path.resolve(userCwd, pos[0]), 'utf8')));   // 형식이 틀리면 여기서 멈춘다
    const plan = await B.planLinkFills(fills);
    const lines = [
      `올린 링크 설명 채우기: ${plan.ok.length}건 채움 · ${plan.skipped.length}건 건너뜀`,
      ...plan.ok.map(({ fill, link }) => `채움  ${fill.id}  ${fill.title ?? link.title}`),
      ...plan.skipped.map((x) => `건너뜀  ${x.id} (${x.reason})`),
    ];
    if (!needYes(lines)) { console.log(JSON.stringify({ store: store.kind, written: false, dryRun: true, fill: plan.ok.map((o) => o.fill.id), skipped: plan.skipped })); process.exit(0); }
    const r = await B.applyLinkFills(fills);
    console.log(JSON.stringify({ store: store.kind, written: true, filled: r.filled, skipped: r.skipped }));
  } else if (cmd === 'public') {
    // 수집 항목마다 공개 여부 · 사진 유무. 공개 화면에는 「공개」이면서 사진이 있는 것만 실린다(사진 · 제목 · 출처 · 공간 · 원문 주소만).
    const [batches, ids] = await Promise.all([B.listBatches(), B.listPublicIds()]);
    const rows = batches.flatMap((b) => b.items.map((it) => ({ id: it.id, collectedAt: b.collectedAt, public: ids.has(it.id), image: !!it.image, shown: ids.has(it.id) && !!it.image, title: it.title })));
    if (opts['--json']) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
    console.log(`공개 화면에 보임 ${rows.filter((r) => r.shown).length}건 / 전체 ${rows.length}건`);
    for (const r of rows) console.log(`  ${r.shown ? '공개' : r.public ? '공개(사진 없음 — 안 보임)' : '숨김'}  ${r.id}  [${r.collectedAt}] ${r.title}`);
  } else if (cmd === 'publish' || cmd === 'unpublish') {
    if (!pos.length) usage('항목 id 가 필요합니다.');
    const on = cmd === 'publish';
    const batches = await B.listBatches();
    const known = new Set(batches.flatMap((b) => b.items.map((it) => it.id)));
    const missing = pos.filter((id) => on && !known.has(id));
    if (missing.length) throw new Error(`묶음에 없는 항목: ${missing.join(', ')}`);
    if (!needYes([`${on ? '공개로 고르기' : '공개에서 빼기'} ${pos.length}건: ${pos.join(', ')}`])) { console.log(JSON.stringify({ store: store.kind, written: false, dryRun: true, ids: pos, on })); process.exit(0); }
    for (const id of pos) await B.setPublic({ itemId: id, on }, { name: opts['--by'] || 'claude' });
    console.log(JSON.stringify({ store: store.kind, written: true, ids: pos, on }));
  } else usage(cmd ? `모르는 명령 ${cmd}` : undefined);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
