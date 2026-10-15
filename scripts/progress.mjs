#!/usr/bin/env node
// 사이트 DB(현황 정본)를 터미널에서 읽고 쓰는 CLI. 앱 API 와 같은 병합·version 규칙(lib/core/engine.ts)을 공유한다.
// 저장소: .env.local / 환경변수에 Upstash(KV_REST_API_* 또는 UPSTASH_REDIS_REST_*)가 있으면 원격, 없으면 .data/progress.json
// 어느 저장소에 붙었는지는 매번 stderr 첫 줄에 찍힌다. 원격(운영)에 쓰려면 --yes 가 필요하다.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userCwd = process.cwd();
process.chdir(root);
for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(path.join(root, f)); } catch { /* 없으면 건너뜀 */ } }

const { readDoc, mutateMany, OpError } = await import('../lib/core/engine.ts');
const { opSchema } = await import('../lib/core/validate.ts');
const { readContent } = await import('../lib/core/content-read.ts');
const { renderMarkdown, kst } = await import('../lib/core/markdown.ts');
const { getStore } = await import('../lib/core/store.ts');

const STATUS = { todo: '시작 전', doing: '진행 중', done: '완료' };

function usage(msg) {
  if (msg) console.error(`오류: ${msg}\n`);
  console.error(`사용법:
  node scripts/progress.mjs get [--json]
  node scripts/progress.mjs apply <patch.json> [--by <이름>] [--dry-run] [--yes]
  node scripts/progress.mjs export-md <out.md>
  --dry-run  지금 저장된 값에 적용해 보기만 하고 쓰지 않음
  --yes      원격(운영) 저장소에 실제로 쓸 때 필요
자세한 내용: scripts/README-progress.md`);
  process.exit(2);
}

// 연산 이름 별칭: 「사용자 체크리스트 항목」은 할 일(task)과 같은 항목이다.
const ALIAS = { 'checklist.add': 'task.add', 'checklist.update': 'task.update', 'checklist.delete': 'task.delete', 'checklist.restore': 'task.restore',
  'task.check': 'task.update', 'task.complete': 'task.update' };

function normalize(raw) {
  const op = { ...raw };
  const by = typeof op.by === 'string' ? op.by : undefined;
  delete op.by;
  const orig = op.op;
  if (ALIAS[orig]) op.op = ALIAS[orig];
  if ((orig === 'task.check' || orig === 'task.complete') && !op.patch) op.patch = { done: op.done !== false };
  if ((orig === 'task.check' || orig === 'task.complete')) delete op.done;
  return { op, by };
}

// 적용 전 요약 한 줄
function describeOp(op) {
  const p = op.patch ? ` ${JSON.stringify(op.patch)}` : '';
  switch (op.op) {
    case 'task.add': return `할 일 추가 [${op.stepId}단계] "${op.text}"${op.due ? ` 마감 ${op.due}` : ''}`;
    case 'log.add': return `기록 추가 [${op.kind}] "${op.text}"`;
    case 'property.add': return `집 정보 추가 ${op.label}: ${op.value}`;
    case 'step.update': return `${op.stepId}단계 수정 (v${op.baseVersion}${op.force ? ', 덮어쓰기' : ''})${p}`;
    default: return `${op.op} ${op.id ?? op.key ?? ''}${op.baseVersion !== undefined ? ` (v${op.baseVersion})` : ''}${op.force ? ' 덮어쓰기' : ''}${p}`;
  }
}

function printGet(doc, steps) {
  const live = Object.values(doc.tasks).filter((t) => !t.deletedAt);
  const doneN = live.filter((t) => t.done).length;
  const doneSteps = steps.filter((s) => doc.steps[String(s.id)]?.status === 'done').length;
  console.log(`문서 version ${doc.version} · 마지막 수정 ${doc.lastAction ? `${doc.lastAction.by} ${kst(doc.lastAction.at)} ${doc.lastAction.text}` : '-'}`);
  console.log(`진행률: 단계 ${doneSteps}/${steps.length} 완료 · 할 일 ${doneN}/${live.length} 완료`);
  console.log('\n[집 정보]');
  const props = Object.values(doc.property).filter((p) => !p.deletedAt);
  if (!props.length) console.log('  (없음)');
  for (const p of props) console.log(`  ${p.label}: ${p.value}   (id ${p.id} v${p.version})`);
  console.log('\n[단계]');
  for (const s of steps) {
    const st = doc.steps[String(s.id)];
    console.log(`  ${s.id}. ${s.title} — ${STATUS[st?.status ?? 'todo']}${st?.targetDate ? ` · 목표 ${st.targetDate}` : ''}  (v${st?.version ?? 0})${st?.note ? `\n      메모: ${st.note}` : ''}`);
  }
  console.log('\n[할 일]');
  if (!live.length) console.log('  (없음)');
  for (const t of live.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))) {
    console.log(`  ${t.done ? '☑' : '☐'} ${t.text}  — ${t.stepId}단계${t.due ? ` · 마감 ${t.due}` : ''}${t.done ? ` · ${t.doneBy}` : ''}  (id ${t.id} v${t.version})`);
  }
  console.log('\n[최근 기록]');
  const logs = doc.log.filter((l) => !l.deletedAt).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  if (!logs.length) console.log('  (없음)');
  for (const l of logs) console.log(`  ${kst(l.at)} [${l.kind}] ${l.text}  — ${l.by}  (id ${l.id} v${l.version})`);
}

// 저장소 안(공개 GitHub 저장소)에 개인정보 파일을 만들지 않는다: git 이 무시하는 경로만 허용
function assertNotTracked(out) {
  const rel = path.relative(root, out);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return;
  const r = spawnSync('git', ['check-ignore', '-q', rel], { cwd: root });
  if (r.status !== 0) {
    console.error(`오류: ${out} 은 공개 저장소 안의 추적 가능한 경로입니다. 현황(개인정보)을 여기 쓰지 마세요. 볼트 등 저장소 밖 경로나 .data/ 를 쓰세요.`);
    process.exit(2);
  }
}

// ── 인자 ──
const [cmd, ...rest] = process.argv.slice(2);
const KNOWN = new Set(['--json', '--dry-run', '--yes', '--by']);
const byIdx = rest.indexOf('--by');
const byFlag = byIdx >= 0 ? rest[byIdx + 1] : undefined;
if (byIdx >= 0 && (!byFlag || byFlag.startsWith('--'))) usage('--by 뒤에 이름이 필요합니다.');
const flags = new Set(rest.filter((a) => a.startsWith('--')));
for (const f of flags) if (!KNOWN.has(f)) usage(`모르는 옵션 ${f}`); // 오타(--dryrun 등)로 실제 쓰기가 되는 일을 막는다
const pos = rest.filter((a, i) => !a.startsWith('--') && !(byIdx >= 0 && i === byIdx + 1));

const store = getStore();
const remote = store.kind === 'redis';
// 결과 JSON 은 stdout, 안내는 stderr — Claude 가 stdout 만 파싱해도 되게
console.error(`[저장소] ${store.label}${remote ? '  ← 원격(운영) 데이터' : '  (로컬 연습용)'}`);

try {
  if (cmd === 'get') {
    const doc = await readDoc();
    if (flags.has('--json')) console.log(JSON.stringify(doc, null, 2));
    else printGet(doc, readContent().steps);
  } else if (cmd === 'apply') {
    if (!pos[0]) usage('patch.json 경로가 필요합니다.');
    const patch = JSON.parse(fs.readFileSync(path.resolve(userCwd, pos[0]), 'utf8'));
    const list = Array.isArray(patch) ? patch : patch.ops;
    if (!Array.isArray(list) || list.length === 0) throw new Error('patch.json 은 연산 배열이거나 {"by":"claude","ops":[...]} 여야 합니다(비어 있으면 안 됨).');
    const defaultBy = byFlag || (!Array.isArray(patch) && patch.by) || 'claude';
    const dryRun = flags.has('--dry-run');

    // 1) 전부 검증 — 하나라도 틀리면 아무것도 쓰지 않는다
    const invalid = [];
    const items = list.map((raw, index) => {
      const { op, by } = normalize(raw);
      const parsed = opSchema.safeParse(op);
      if (!parsed.success) invalid.push({ index, op: raw?.op, error: { error: 'invalid', message: parsed.error.issues[0]?.message, path: parsed.error.issues[0]?.path.join('.') } });
      return { index, by: by || defaultBy, op: parsed.success ? parsed.data : null };
    });
    if (invalid.length) {
      console.log(JSON.stringify({ store: store.kind, written: false, applied: [], failed: invalid }, null, 2));
      console.error('형식이 틀린 연산이 있어 아무것도 쓰지 않았습니다.');
      process.exit(1);
    }

    // 2) 적용 전 요약
    console.error(`적용할 연산 ${items.length}건${dryRun ? ' (dry-run: 쓰지 않음)' : ''}:`);
    for (const it of items) console.error(`  #${it.index} ${describeOp(it.op)}  — ${it.by}`);
    if (remote && !dryRun && !flags.has('--yes')) {
      console.error('원격(운영) 저장소입니다. 위 내용이 맞으면 --yes 를 붙여 다시 실행하세요(미리 보기는 --dry-run).');
      process.exit(3);
    }

    // 3) 연속된 같은 by 끼리 묶어 적용(순서 유지). dry-run 은 앞 묶음 결과가 다음 묶음에 이어지도록 한 번에 돌린다.
    const groups = [];
    for (const it of items) {
      const last = groups[groups.length - 1];
      if (last && (dryRun || last.name === it.by)) { last.ops.push(it.op); last.idx.push(it.index); }
      else groups.push({ name: it.by, ops: [it.op], idx: [it.index] });
    }
    const outcomes = [];
    for (const g of groups) {
      const res = await mutateMany(g.ops, { email: `${g.name}@cli.local`, name: g.name }, { dryRun });
      res.outcomes.forEach((o) => outcomes.push({ ...o, index: g.idx[o.index] }));
    }
    outcomes.sort((a, b) => a.index - b.index);
    const applied = outcomes.filter((o) => o.ok).map((o) => ({ index: o.index, op: list[o.index].op, result: o.result }));
    const failed = outcomes.filter((o) => !o.ok).map((o) => ({ index: o.index, op: list[o.index].op, status: o.status, error: o.error }));
    console.log(JSON.stringify({ store: store.kind, written: !dryRun && applied.length > 0, dryRun, applied, failed }, null, 2));
    if (failed.length) process.exitCode = 1;
  } else if (cmd === 'export-md') {
    if (!pos[0]) usage('출력 파일 경로가 필요합니다.');
    const out = path.resolve(userCwd, pos[0]);
    assertNotTracked(out);
    const doc = await readDoc();
    const md = renderMarkdown(doc, readContent().steps, new Date().toISOString());
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, md, 'utf8');
    console.log(JSON.stringify({ ok: true, out, version: doc.version }));
  } else usage(cmd ? `모르는 명령 ${cmd}` : undefined);
} catch (e) {
  if (e instanceof OpError) console.error(JSON.stringify({ error: e.body }));
  else console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
