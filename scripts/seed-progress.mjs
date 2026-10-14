#!/usr/bin/env node
// 로컬 JSON 을 현황 저장소에 밀어 넣는다. Upstash env 가 있으면 Redis, 없으면 .data/progress.json
// 사용: node scripts/seed-progress.mjs <json파일> [--force]
//   기본은 저장소가 비어 있을 때만 넣는다. --force 는 기존 현황을 지우고 새로 넣는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(path.join(root, f)); } catch { /* 없으면 건너뜀 */ } }

const { readDoc, mutateMany, emptyDoc } = await import('../lib/core/engine.ts');
const { opSchema } = await import('../lib/core/validate.ts');
const { getStore } = await import('../lib/core/store.ts');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('사용법: node scripts/seed-progress.mjs <json파일> [--force]'); process.exit(2); }
const input = JSON.parse(fs.readFileSync(file, 'utf8'));

const store = getStore();
const existing = await readDoc();
const hasData = existing.version > 0;
if (hasData && !args.includes('--force')) {
  console.error(`저장소(${store.kind})에 이미 현황 데이터가 있습니다(version ${existing.version}). 덮어쓰려면 --force.`);
  process.exit(1);
}
if (hasData) {
  const raw = await store.read();
  await store.cas(raw, JSON.stringify(emptyDoc()));
}

const ops = [];
for (const p of input.property ?? []) ops.push({ op: 'property.add', label: p.label, value: p.value });
for (const [id, s] of Object.entries(input.steps ?? {})) {
  ops.push({ op: 'step.update', stepId: Number(id), baseVersion: 0, patch: { status: s.status, targetDate: s.targetDate ?? null, note: s.note ?? '' } });
}
const taskIdx = [];
for (const t of input.tasks ?? []) { ops.push({ op: 'task.add', stepId: t.stepId, text: t.text, due: t.due ?? null }); taskIdx.push({ at: ops.length - 1, done: !!t.done }); }
for (const l of input.log ?? []) ops.push({ op: 'log.add', kind: l.kind, text: l.text });

const parsed = ops.map((o, i) => { const r = opSchema.safeParse(o); if (!r.success) throw new Error(`입력 ${i}번째 항목이 올바르지 않습니다: ${r.error.issues[0]?.message}`); return r.data; });
const actor = { email: 'seed@cli.local', name: input.by || 'seed' };
const first = await mutateMany(parsed, actor);
// 완료 표시는 만들어진 id 로 한 번 더
const doneOps = taskIdx.filter((t) => t.done).map((t) => ({ op: 'task.update', id: first.outcomes[t.at].result.id, patch: { done: true } }));
const second = doneOps.length ? await mutateMany(doneOps.map((o) => opSchema.parse(o)), actor) : null;
const failed = [...first.outcomes, ...(second?.outcomes ?? [])].filter((o) => !o.ok);
console.log(JSON.stringify({ store: store.kind, applied: parsed.length + doneOps.length - failed.length, failed: failed.length }));
process.exit(failed.length ? 1 : 0);
