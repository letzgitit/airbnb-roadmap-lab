#!/usr/bin/env node
// 이미 있는 할 일 짝 맞추기: 사이트 할 일과 Todoist 할 일 목록(JSON 파일)을 제목 · 날짜로 짝지어 표를 만든다.
// 저장소 · Todoist 에 붙지 않는다(파일만 읽고 쓴다). 결과로 나온 patch.json 을 `progress.mjs apply` 로 적용하면 todoistId 가 채워진다.
//
// node scripts/todoist-match.mjs --site site.json --todoist todoist.json --out <저장소 밖>/match [--ops <저장소 밖>/patch.json] [--min 확실|날짜다름|비슷함] [--all-labels]
//   site.json    : `progress.mjs get --json` 출력, 또는 사이트 GET /api/progress 응답({doc, me})
//   todoist.json : Todoist 할 일 배열, 또는 {results:[...]}(GET /api/v1/tasks 응답 모양) — content · due · labels · id 만 쓴다
//   --out        : <out>.json(표) · <out>.md(사람이 읽는 표)
//   --ops        : 짝을 적는 연산 묶음(patch.json). 기본은 「확실」만 넣는다
//   --all-labels : 라벨(기본 외도민, TODOIST_LABEL)이 없는 Todoist 할 일도 후보에 넣는다
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { siteText, siteDue, hasLabel, labelName } = await import('../lib/core/todoist.ts');

const LEVELS = ['확실', '날짜다름', '비슷함'];
const LEVEL_LABEL = { 확실: '확실(제목 · 날짜 같음)', 날짜다름: '제목 같음 · 날짜 다름', 비슷함: '제목 비슷함' };

function usage(msg) {
  if (msg) console.error(`오류: ${msg}\n`);
  console.error('사용법: node scripts/todoist-match.mjs --site site.json --todoist todoist.json --out <저장소 밖>/match [--ops patch.json] [--min 확실|날짜다름|비슷함] [--all-labels]');
  process.exit(2);
}

// 저장소 안(공개 GitHub)에 실제 할 일 목록을 쓰지 않는다: git 이 무시하는 경로만 허용(progress.mjs 와 같은 규칙)
function assertNotTracked(out) {
  const rel = path.relative(root, out);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return;
  const r = spawnSync('git', ['check-ignore', '-q', rel], { cwd: root });
  if (r.status !== 0) { console.error(`오류: ${out} 은 공개 저장소 안의 추적 가능한 경로입니다. 저장소 밖에 쓰세요.`); process.exit(2); }
}

// 비교용: 200자 줄이기와 같은 방식으로 자른 뒤 공백 · 문장부호 · 대소문자 무시
export function norm(s) {
  return siteText(String(s ?? '')).replace(/…$/, '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}
function bigrams(s) { const out = new Map(); for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); out.set(b, (out.get(b) ?? 0) + 1); } return out; }
export function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a); const B = bigrams(b);
  let hit = 0;
  for (const [k, n] of A) hit += Math.min(n, B.get(k) ?? 0);
  return (2 * hit) / (a.length - 1 + b.length - 1);
}

// 사이트 할 일 하나와 Todoist 할 일 하나의 짝 정도. null = 짝 아님
export function grade(site, td) {
  const a = norm(site.text); const b = norm(td.text);
  const sameDate = (site.due ?? null) === (td.due ?? null);
  if (a && a === b) return { level: sameDate ? '확실' : '날짜다름', sim: 1, sameDate };
  // 사이트 쪽이 200자로 잘렸거나 한쪽이 덧붙인 경우
  const prefix = Math.min(a.length, b.length) >= 8 && (a.startsWith(b) || b.startsWith(a));
  const sim = prefix ? 0.95 : dice(a, b);
  if (sim >= 0.75) return { level: '비슷함', sim, sameDate };
  return null;
}

// 1:1 짝짓기 — 정도가 높은 것부터(같으면 날짜 같은 것 · 비슷한 정도 순)
export function matchTasks(siteTasks, todoistTasks) {
  const cand = [];
  for (const s of siteTasks) for (const t of todoistTasks) {
    const g = grade(s, t);
    if (g) cand.push({ s, t, ...g });
  }
  cand.sort((x, y) => LEVELS.indexOf(x.level) - LEVELS.indexOf(y.level) || Number(y.sameDate) - Number(x.sameDate) || y.sim - x.sim);
  const usedS = new Set(); const usedT = new Set(); const pairs = [];
  for (const c of cand) {
    if (usedS.has(c.s.id) || usedT.has(c.t.id)) continue;
    usedS.add(c.s.id); usedT.add(c.t.id);
    pairs.push({ level: c.level, sim: Math.round(c.sim * 100) / 100, sameDate: c.sameDate, site: c.s, todoist: c.t });
  }
  return {
    pairs,
    siteOnly: siteTasks.filter((s) => !usedS.has(s.id)),
    todoistOnly: todoistTasks.filter((t) => !usedT.has(t.id)),
  };
}

// 표 → progress.mjs apply 에 넣을 연산 묶음(todoistId 만 적는 task.update 는 baseVersion 이 필요 없다)
export function opsFor(pairs, min = '확실') {
  const upto = LEVELS.indexOf(min);
  return {
    by: 'claude',
    ops: pairs.filter((p) => LEVELS.indexOf(p.level) <= upto).map((p) => ({ op: 'task.update', id: p.site.id, patch: { todoistId: p.todoist.id } })),
  };
}

export function loadSite(raw) {
  const doc = raw && raw.doc && typeof raw.doc === 'object' ? raw.doc : raw;
  if (!doc || typeof doc.tasks !== 'object') throw new Error('site.json 이 현황 문서 모양이 아닙니다(tasks 가 필요).');
  const all = Object.values(doc.tasks).filter((t) => !t.deletedAt);
  return {
    linked: all.filter((t) => t.todoistId),
    tasks: all.filter((t) => !t.todoistId).map((t) => ({ id: t.id, text: t.text, due: t.due ?? null, done: !!t.done, stepId: t.stepId, version: t.version })),
    linkedIds: new Set(all.map((t) => t.todoistId).filter(Boolean)),
  };
}
export function loadTodoist(raw, { allLabels = false, label = labelName(), linkedIds = new Set() } = {}) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : Array.isArray(raw?.items) ? raw.items : null;
  if (!list) throw new Error('todoist.json 은 할 일 배열이거나 {results:[...]} 여야 합니다.');
  const keep = list.filter((t) => t && !t.is_deleted && (allLabels || hasLabel(t.labels, label)));
  return {
    tasks: keep.filter((t) => !linkedIds.has(String(t.id))).map((t) => ({ id: String(t.id), text: siteText(t.content ?? ''), due: siteDue(t.due), done: !!t.checked })),
    skippedNoLabel: list.length - keep.length,
  };
}

export function renderMd(result, meta) {
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
  const out = [];
  out.push('# Todoist 짝 맞추기 표');
  out.push('');
  out.push(`- 만든 때: ${meta.at} · 라벨: ${meta.allLabels ? '(모두)' : meta.label}`);
  out.push(`- 사이트(짝 없는) ${meta.siteN}개 · Todoist ${meta.todoistN}개 · 이미 짝 있는 사이트 할 일 ${meta.linkedN}개`);
  out.push(`- 연산 묶음에 넣은 정도: ${LEVELS.slice(0, LEVELS.indexOf(meta.min) + 1).map((l) => LEVEL_LABEL[l]).join(' · ')}`);
  out.push('- 짝을 적어도 제목 · 날짜 · 완료 여부를 서로 맞추지는 않는다. 다른 칸은 다음에 한쪽에서 고칠 때 맞춰진다.');
  out.push('');
  for (const lv of LEVELS) {
    const rows = result.pairs.filter((p) => p.level === lv);
    out.push(`## ${LEVEL_LABEL[lv]} (${rows.length})`);
    out.push('');
    if (!rows.length) { out.push('- (없음)'); out.push(''); continue; }
    out.push('| 사이트 할 일 | 날짜 | Todoist 할 일 | 날짜 | 닮음 | 사이트 id | Todoist id |');
    out.push('|---|---|---|---|---|---|---|');
    for (const p of rows) out.push(`| ${esc(p.site.text)} | ${p.site.due ?? '-'} | ${esc(p.todoist.text)} | ${p.todoist.due ?? '-'} | ${p.sim} | ${p.site.id} | ${p.todoist.id} |`);
    out.push('');
  }
  out.push(`## 사이트에만 있음 (${result.siteOnly.length})`);
  out.push('');
  if (!result.siteOnly.length) out.push('- (없음)');
  for (const s of result.siteOnly) out.push(`- ${s.done ? '☑' : '☐'} ${s.text}${s.due ? ` · ${s.due}` : ''} — ${s.stepId}단계 (${s.id})`);
  out.push('');
  out.push(`## Todoist 에만 있음 (${result.todoistOnly.length})`);
  out.push('');
  if (!result.todoistOnly.length) out.push('- (없음)');
  for (const t of result.todoistOnly) out.push(`- ${t.done ? '☑' : '☐'} ${t.text}${t.due ? ` · ${t.due}` : ''} (${t.id})`);
  out.push('');
  return out.join('\n');
}

// ── 명령줄 ──
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const val = (name) => { const i = args.indexOf(name); if (i < 0) return undefined; const v = args[i + 1]; if (!v || v.startsWith('--')) usage(`${name} 뒤에 값이 필요합니다.`); return v; };
  const KNOWN = new Set(['--site', '--todoist', '--out', '--ops', '--min', '--all-labels']);
  for (const a of args) if (a.startsWith('--') && !KNOWN.has(a)) usage(`모르는 옵션 ${a}`);
  const siteF = val('--site'); const tdF = val('--todoist'); const outP = val('--out'); const opsF = val('--ops');
  const min = val('--min') ?? '확실';
  const allLabels = args.includes('--all-labels');
  if (!siteF || !tdF || !outP) usage('--site · --todoist · --out 이 필요합니다.');
  if (!LEVELS.includes(min)) usage(`--min 은 ${LEVELS.join(' · ')} 중 하나`);
  const outBase = path.resolve(outP.replace(/\.(json|md)$/, ''));
  for (const f of [`${outBase}.json`, `${outBase}.md`, ...(opsF ? [path.resolve(opsF)] : [])]) assertNotTracked(f);

  const site = loadSite(JSON.parse(fs.readFileSync(path.resolve(siteF), 'utf8')));
  const td = loadTodoist(JSON.parse(fs.readFileSync(path.resolve(tdF), 'utf8')), { allLabels, linkedIds: site.linkedIds });
  const result = matchTasks(site.tasks, td.tasks);
  const meta = { at: new Date().toISOString(), label: labelName(), allLabels, min, siteN: site.tasks.length, todoistN: td.tasks.length, linkedN: site.linked.length };
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  fs.writeFileSync(`${outBase}.json`, JSON.stringify({ meta, ...result }, null, 2));
  fs.writeFileSync(`${outBase}.md`, renderMd(result, meta));
  const ops = opsFor(result.pairs, min);
  if (opsF) fs.writeFileSync(path.resolve(opsF), JSON.stringify(ops, null, 2));
  const count = Object.fromEntries(LEVELS.map((l) => [l, result.pairs.filter((p) => p.level === l).length]));
  console.log(JSON.stringify({ out: [`${outBase}.json`, `${outBase}.md`], ops: opsF ? path.resolve(opsF) : null, opsCount: ops.ops.length, pairs: count, siteOnly: result.siteOnly.length, todoistOnly: result.todoistOnly.length, todoistNoLabel: td.skippedNoLabel }, null, 2));
}
