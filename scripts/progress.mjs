#!/usr/bin/env node
// 사이트 DB(현황 정본)를 터미널에서 읽고 쓰는 CLI. 앱 API 와 같은 병합·version 규칙(lib/core/engine.ts)을 공유한다.
// 저장소: .env.local / 환경변수에 Upstash(KV_REST_API_* 또는 UPSTASH_REDIS_REST_*)가 있으면 원격, 없으면 .data/progress.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(path.join(root, f)); } catch { /* 없으면 건너뜀 */ } }

const { readDoc, mutateMany, OpError } = await import('../lib/core/engine.ts');
const { opSchema } = await import('../lib/core/validate.ts');
const { readContent } = await import('../lib/core/content-read.ts');
const { renderMarkdown, kst } = await import('../lib/core/markdown.ts');
const { getStore } = await import('../lib/core/store.ts');

const STATUS = { todo: '시작 전', doing: '진행 중', done: '완료' };

function usage() {
  console.error(`사용법:
  node scripts/progress.mjs get [--json]
  node scripts/progress.mjs apply <patch.json> [--by <이름>]
  node scripts/progress.mjs export-md <out.md>
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

function printGet(doc, steps) {
  const live = Object.values(doc.tasks).filter((t) => !t.deletedAt);
  const doneN = live.filter((t) => t.done).length;
  const doneSteps = steps.filter((s) => doc.steps[String(s.id)]?.status === 'done').length;
  console.log(`문서 version ${doc.version} · 마지막 수정 ${doc.lastAction ? `${doc.lastAction.by} ${kst(doc.lastAction.at)} ${doc.lastAction.text}` : '-'}`);
  console.log(`진행률: 단계 ${doneSteps}/${steps.length} 완료 · 할 일 ${doneN}/${live.length} 완료`);
  console.log('\n[매물 정보]');
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

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--') && a !== '--by'));
const byIdx = rest.indexOf('--by');
const byFlag = byIdx >= 0 ? rest[byIdx + 1] : undefined;
const pos = rest.filter((a, i) => !a.startsWith('--') && !(byIdx >= 0 && i === byIdx + 1));

try {
  if (cmd === 'get') {
    const doc = await readDoc();
    if (flags.has('--json')) console.log(JSON.stringify(doc, null, 2));
    else printGet(doc, readContent().steps);
  } else if (cmd === 'apply') {
    if (!pos[0]) usage();
    const patch = JSON.parse(fs.readFileSync(pos[0], 'utf8'));
    const list = Array.isArray(patch) ? patch : patch.ops;
    if (!Array.isArray(list)) throw new Error('patch.json 은 연산 배열이거나 {"by":"claude","ops":[...]} 여야 합니다.');
    const defaultBy = byFlag || (!Array.isArray(patch) && patch.by) || 'claude';
    // 연산마다 by 가 다를 수 있어 by 별로 묶되, 순서를 지키기 위해 연속된 같은 by 끼리만 묶는다.
    const outcomes = [];
    const groups = [];
    list.forEach((raw, index) => {
      const { op, by } = normalize(raw);
      const parsed = opSchema.safeParse(op);
      if (!parsed.success) {
        outcomes.push({ index, ok: false, error: { error: 'invalid', message: parsed.error.issues[0]?.message, path: parsed.error.issues[0]?.path.join('.') } });
        return;
      }
      const name = by || defaultBy;
      const last = groups[groups.length - 1];
      if (last && last.name === name) { last.ops.push(parsed.data); last.idx.push(index); }
      else groups.push({ name, ops: [parsed.data], idx: [index] });
    });
    for (const g of groups) {
      const res = await mutateMany(g.ops, { email: `${g.name}@cli.local`, name: g.name });
      res.outcomes.forEach((o) => outcomes.push({ ...o, index: g.idx[o.index] }));
    }
    outcomes.sort((a, b) => a.index - b.index);
    const applied = outcomes.filter((o) => o.ok).map((o) => ({ index: o.index, op: list[o.index].op, result: o.result }));
    const failed = outcomes.filter((o) => !o.ok).map((o) => ({ index: o.index, op: list[o.index].op, status: o.status, error: o.error }));
    console.log(JSON.stringify({ store: getStore().kind, applied, failed }, null, 2));
    if (failed.length) process.exitCode = 1;
  } else if (cmd === 'export-md') {
    if (!pos[0]) usage();
    const doc = await readDoc();
    const md = renderMarkdown(doc, readContent().steps, new Date().toISOString());
    fs.mkdirSync(path.dirname(path.resolve(pos[0])), { recursive: true });
    fs.writeFileSync(pos[0], md, 'utf8');
    console.log(JSON.stringify({ ok: true, out: path.resolve(pos[0]), version: doc.version }));
  } else usage();
} catch (e) {
  if (e instanceof OpError) console.error(JSON.stringify({ error: e.body }));
  else console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
