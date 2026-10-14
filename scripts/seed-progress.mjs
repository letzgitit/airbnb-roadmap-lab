#!/usr/bin/env node
// 로컬 JSON 을 현황 저장소에 밀어 넣는다. Upstash env 가 있으면 Redis, 없으면 .data/progress.json
// 사용: node scripts/seed-progress.mjs <json파일> [--force] [--yes]
//   기본은 저장소가 비어 있을 때만 넣는다. --force 는 기존 현황을 지우고 새로 넣는다.
//   원격(운영) 저장소에 쓰려면 --yes 도 필요하다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userCwd = process.cwd();
process.chdir(root);
for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(path.join(root, f)); } catch { /* 없으면 건너뜀 */ } }

const { readDoc, mutateMany, emptyDoc } = await import('../lib/core/engine.ts');
const { opSchema } = await import('../lib/core/validate.ts');
const { getStore } = await import('../lib/core/store.ts');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const unknown = args.filter((a) => a.startsWith('--') && a !== '--force' && a !== '--yes');
if (!file || unknown.length) { console.error('사용법: node scripts/seed-progress.mjs <json파일> [--force] [--yes]'); process.exit(2); }
const input = JSON.parse(fs.readFileSync(path.resolve(userCwd, file), 'utf8'));

const store = getStore();
const remote = store.kind === 'redis';
console.error(`[저장소] ${store.label}${remote ? '  ← 원격(운영) 데이터' : '  (로컬 연습용)'}`);
if (remote && !args.includes('--yes')) {
  console.error('원격(운영) 저장소입니다. 정말 넣으려면 --yes 를 붙이세요.');
  process.exit(3);
}

const existing = await readDoc();
const hasData = existing.version > 0;
if (hasData && !args.includes('--force')) {
  console.error(`저장소(${store.kind})에 이미 현황 데이터가 있습니다(version ${existing.version}). 덮어쓰려면 --force.`);
  process.exit(1);
}

const ops = [];
for (const p of input.property ?? []) ops.push({ op: 'property.add', label: p.label, value: p.value });
for (const [id, s] of Object.entries(input.steps ?? {})) {
  ops.push({ op: 'step.update', stepId: Number(id), baseVersion: 0, patch: { status: s.status, targetDate: s.targetDate ?? null, note: s.note ?? '' } });
}
const taskIdx = [];
for (const t of input.tasks ?? []) { ops.push({ op: 'task.add', stepId: t.stepId, text: t.text, due: t.due ?? null }); taskIdx.push({ at: ops.length - 1, done: !!t.done }); }
for (const l of input.log ?? []) ops.push({ op: 'log.add', kind: l.kind, text: l.text });

// 지우기 전에 입력부터 전부 검증(틀린 입력 때문에 기존 데이터만 날아가는 일이 없게)
const parsed = ops.map((o, i) => { const r = opSchema.safeParse(o); if (!r.success) { console.error(`입력 ${i}번째 항목이 올바르지 않습니다: ${r.error.issues[0]?.message}`); process.exit(1); } return r.data; });

if (hasData) {
  const raw = await store.read();
  if (!(await store.cas(raw, JSON.stringify(emptyDoc())))) {
    console.error('비우는 사이 누군가 현황을 고쳤습니다. 아무것도 바꾸지 않았으니 다시 실행하세요.');
    process.exit(1);
  }
}

const actor = { email: 'seed@cli.local', name: input.by || 'seed' };
const first = await mutateMany(parsed, actor);
// 완료 표시는 만들어진 id 로 한 번 더
const doneOps = taskIdx.filter((t) => t.done && first.outcomes[t.at].ok).map((t) => ({ op: 'task.update', id: first.outcomes[t.at].result.id, patch: { done: true } }));
const second = doneOps.length ? await mutateMany(doneOps.map((o) => opSchema.parse(o)), actor) : null;
const failed = [...first.outcomes, ...(second?.outcomes ?? [])].filter((o) => !o.ok);
console.log(JSON.stringify({ store: store.kind, applied: parsed.length + doneOps.length - failed.length, failed: failed.length }));
process.exit(failed.length ? 1 : 0);
