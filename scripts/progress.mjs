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

const { readDoc, parseDoc, mutateMany, OpError } = await import('../lib/core/engine.ts');
const { opSchema } = await import('../lib/core/validate.ts');
const { readContent } = await import('../lib/core/content-read.ts');
const { renderMarkdown, kst } = await import('../lib/core/markdown.ts');
const { getStore } = await import('../lib/core/store.ts');
const { treeOrder } = await import('../lib/core/task-tree.ts');
const { pushToTodoist, todoistConfig, pushAllowed, isRealTodoist, planSync, applySync, fetchTodoistLabeled } = await import('../lib/core/todoist-push.ts');

// 손님 링크 주소를 찍을 때 쓰는 사이트 주소(NEXT_PUBLIC_SITE_URL 이 있으면 그것)
const SITE_URL = 'https://jumoney-oedomin.vercel.app';
const STATUS = { todo: '시작 전', doing: '진행 중', done: '완료' };
const AUTO = { claude: 'Claude', keyword: '낱말 규칙', default: '기본 단계' };

function usage(msg) {
  if (msg) console.error(`오류: ${msg}\n`);
  console.error(`사용법:
  node scripts/progress.mjs get [--json]
  node scripts/progress.mjs apply <patch.json> [--by <이름>] [--dry-run] [--yes]
  node scripts/progress.mjs export-md <out.md>
  node scripts/progress.mjs todoist-sync [--yes] [--json]   운영 현황 ↔ Todoist 차이 보기(--yes: 사이트 값으로 맞춤)
  node scripts/progress.mjs export-md <out.md> --doc <progress.json>   (저장소 대신 사이트 /api/progress 응답 파일로)
  --dry-run  지금 저장된 값에 적용해 보기만 하고 쓰지 않음
  --yes      원격(운영) 저장소에 실제로 쓸 때 필요
  --no-todoist  운영 저장소에 쓰는데 Todoist 토큰이 없을 때, Todoist 에 안 보내는 것을 알고 쓴다는 표시
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
    case 'task.add': return `할 일 추가 [${op.parentId ? `세부 항목 ← ${op.parentId}` : `${op.stepId}단계`}] "${op.text}"${op.start ? ` 시작 ${op.start}` : ''}${op.due ? ` 마감 ${op.due}` : ''}${op.kind ? ` 종류 ${op.kind}` : ''}${op.note ? ` 자세히 ${op.note.length}자` : ''}${op.owner ? ` 맡은 사람 ${op.owner}` : ''}`;
    case 'task.update': if (op.patch && Object.keys(op.patch).length === 1 && 'todoistId' in op.patch) return `할 일 ${op.id} Todoist 짝 ${op.patch.todoistId ?? '끊기'}`; return `${op.op} ${op.id}${op.baseVersion !== undefined ? ` (v${op.baseVersion})` : ''}${op.force ? ' 덮어쓰기' : ''}${p}`;
    case 'log.add': return `기록 추가 [${op.kind}] "${op.text}"`;
    case 'property.add': return `집 정보 추가 ${op.label}: ${op.value}`;
    case 'money.add': return `돈 흐름 추가 ${op.date ?? '날짜 미정'} "${op.text}" ${op.amount ?? '금액 미정'}만 (${op.via})${op.estimate ? ' 추정' : ''}`;
    case 'plan.update': return `한 장 일정 출발점 수정 (v${op.baseVersion}${op.force ? ', 덮어쓰기' : ''})${p}`;
    case 'question.add': return `질문 추가 → ${op.to}: "${op.text}"`;
    case 'question.answer': return `질문 ${op.id}에 답 달기: "${op.text}"`;
    case 'guest.add': return `손님 링크 만들기: ${op.name}`;
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
  // 세부 항목은 부모 밑에 들여 쓴다(└). 부모가 지워졌거나 없으면 맨 위 층에 「상위 id」
  const sorted = live.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  for (const { item: t, depth, orphanOf } of treeOrder(sorted)) {
    const auto = t.autoFill ? ` · 단계 자동(${AUTO[t.autoFill] ?? t.autoFill})` : '';
    const pad = depth ? '    └ ' : '  ';
    const span = t.start ? ` · 시작 ${t.start}` : '';
    console.log(`${pad}${t.done ? '☑' : '☐'} ${t.kind ? `[${t.kind}] ` : ''}${t.text}  — ${t.stepId}단계${auto}${t.owner ? ` · ${t.owner}` : ''}${span}${t.due ? ` · 마감 ${t.due}` : ''}${t.done ? ` · ${t.doneBy}` : ''}  (id ${t.id} v${t.version}${orphanOf ? ` · 상위 ${orphanOf}` : ''}${t.todoistId ? ` · todoist ${t.todoistId}` : ''})`);
    const notePad = depth ? '          ' : '      ';
    if (t.note) for (const line of t.note.split('\n')) console.log(`${notePad}${line}`);
    if (t.todoistError) console.log(`${notePad}⚠️ Todoist 보내기 실패: ${t.todoistError} (todoist-sync 로 다시 맞춤)`);
  }
  const money = Object.values(doc.money ?? {}).filter((m) => !m.deletedAt).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  console.log(`\n[돈 흐름] 출발점 ${doc.plan ? `현금 ${doc.plan.cash ?? '-'}만 · 마통 여유 ${doc.plan.credit ?? '-'}만  (plan v${doc.plan.version})` : '(없음, plan v0)'}`);
  for (const m of money) console.log(`  ${m.date ?? '날짜 미정'} ${m.text} ${m.amount ?? '금액 미정'}만 (${m.via})${m.estimate ? ' 추정' : ''}  (id ${m.id} v${m.version})`);
  const QS = { open: '답 기다림', answered: '답함', closed: '닫음' };
  const qs = Object.values(doc.questions ?? {}).filter((q) => !q.deletedAt).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  console.log(`\n[질문] ${qs.length}개 · 답 기다림 ${qs.filter((q) => q.status === 'open').length} · 새 답 ${qs.filter((q) => q.unread).length}`);
  for (const q of qs) {
    const ans = q.answers.filter((a) => !a.deletedAt);
    console.log(`  ${q.seq}. [${QS[q.status]}${q.unread ? ' · 새 답' : ''}] → ${q.to}: ${q.text}  (id ${q.id} v${q.version})`);
    for (const a of ans) console.log(`      ↳ ${a.by}${a.guestId ? '(링크)' : ''} ${kst(a.at)}: ${a.text}  (답 id ${a.id})`);
  }
  const guests = Object.values(doc.guests ?? {}).filter((g) => !g.revokedAt);
  const site = (process.env.NEXT_PUBLIC_SITE_URL || SITE_URL).replace(/\/$/, '');
  console.log('\n[손님 링크]');
  if (!guests.length) console.log('  (없음)');
  for (const g of guests) console.log(`  ${g.name}: ${site}/q/${g.token}  (id ${g.id})`);
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
const KNOWN = new Set(['--json', '--dry-run', '--yes', '--by', '--doc', '--no-todoist']);
const byIdx = rest.indexOf('--by');
const byFlag = byIdx >= 0 ? rest[byIdx + 1] : undefined;
if (byIdx >= 0 && (!byFlag || byFlag.startsWith('--'))) usage('--by 뒤에 이름이 필요합니다.');
// --doc <progress.json>: export-md 가 저장소 대신 이 파일(사이트 GET /api/progress 응답 또는 그 doc)을 읽는다. 운영 키 없이 md 만 만들 때.
const docIdx = rest.indexOf('--doc');
const docFlag = docIdx >= 0 ? rest[docIdx + 1] : undefined;
if (docIdx >= 0 && (!docFlag || docFlag.startsWith('--'))) usage('--doc 뒤에 progress.json 경로가 필요합니다.');
if (docIdx >= 0 && cmd !== 'export-md') usage('--doc 는 export-md 에서만 쓸 수 있습니다.');
const flags = new Set(rest.filter((a) => a.startsWith('--')));
for (const f of flags) if (!KNOWN.has(f)) usage(`모르는 옵션 ${f}`); // 오타(--dryrun 등)로 실제 쓰기가 되는 일을 막는다
const pos = rest.filter((a, i) => !a.startsWith('--') && !(byIdx >= 0 && i === byIdx + 1) && !(docIdx >= 0 && i === docIdx + 1));

// --doc 이면 저장소에 붙지 않는다(키가 없어도 되고, 실수로 운영에 붙을 일도 없다)
const store = docFlag ? null : getStore();
const remote = store?.kind === 'redis';
// 결과 JSON 은 stdout, 안내는 stderr — Claude 가 stdout 만 파싱해도 되게
if (store) console.error(`[저장소] ${store.label}${remote ? '  ← 원격(운영) 데이터' : '  (로컬 연습용)'}`);
else console.error(`[입력] 파일 ${path.resolve(userCwd, docFlag)}  (저장소 접근 안 함)`);

// 사이트 GET /api/progress 응답({doc, me}) 또는 doc 자체를 읽는다. since 응답({unchanged:true})은 본문이 없어 거부.
function readDocFile(file) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(userCwd, file), 'utf8'));
  if (raw && raw.unchanged) throw new Error('--doc 파일이 「unchanged」 응답입니다. ?since 없이 받은 /api/progress 응답을 저장하세요.');
  const d = raw && typeof raw === 'object' && raw.doc && typeof raw.doc === 'object' ? raw.doc : raw;
  if (!d || typeof d !== 'object' || typeof d.version !== 'number' || typeof d.steps !== 'object') {
    throw new Error('--doc 파일이 현황 문서 모양이 아닙니다(version·steps 가 필요). /api/progress 응답이나 그 doc 를 저장하세요.');
  }
  return parseDoc(JSON.stringify(d));
}

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
    // 운영에 할 일을 쓰는데 Todoist 토큰이 없으면 Todoist 와 어긋난다 → 알고 쓰는지 묻는다
    const hasTaskOps = items.some((it) => it.op.op.startsWith('task.'));
    if (remote && !dryRun && hasTaskOps && !todoistConfig() && !flags.has('--no-todoist')) {
      console.error('🔴 운영 저장소에 할 일을 쓰는데 TODOIST_API_TOKEN 이 없어 Todoist 에 반영되지 않습니다.');
      console.error('   토큰을 같이 받아 다시 실행하거나, Todoist 에 안 보내도 되면 --no-todoist 를 붙이세요(나중에 todoist-sync 로 맞출 수 있음).');
      process.exit(4);
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
    // 할 일이 바뀌었으면 Todoist 에도 반영(TODOIST_API_TOKEN 이 없으면 건너뜀). 결과는 stderr 한 줄.
    let todoist;
    if (!dryRun && !flags.has('--no-todoist')) {
      const taskOps = outcomes.filter((o) => o.ok && items[o.index].op.op.startsWith('task.')).map((o) => ({ op: items[o.index].op, result: o.result }));
      if (taskOps.length) {
        const r = await pushToTodoist(taskOps);
        todoist = r.skipped ? { skipped: r.skipped } : { calls: r.calls.length, linked: r.linked, errors: r.errors };
        console.error(r.skipped === 'no_token' ? '[Todoist] 토큰 없음 — 반영 건너뜀' : r.skipped === 'local_store' ? '[Todoist] 로컬 연습 저장소 — 반영 건너뜀(운영 저장소일 때만 보낸다)' : `[Todoist] 호출 ${r.calls.length}건 · 짝 적음 ${r.linked.length}건${r.errors.length ? ` · 실패 ${r.errors.length}건` : ''}`);
      }
    }
    console.log(JSON.stringify({ store: store.kind, written: !dryRun && applied.length > 0, dryRun, applied, failed, ...(todoist ? { todoist } : {}) }, null, 2));
    if (failed.length) process.exitCode = 1;
  } else if (cmd === 'export-md') {
    if (!pos[0]) usage('출력 파일 경로가 필요합니다.');
    const out = path.resolve(userCwd, pos[0]);
    assertNotTracked(out);
    const doc = docFlag ? readDocFile(docFlag) : await readDoc();
    const md = renderMarkdown(doc, readContent().steps, new Date().toISOString());
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, md, 'utf8');
    console.log(JSON.stringify({ ok: true, out, version: doc.version }));
  } else if (cmd === 'todoist-sync') {
    // 운영 현황 ↔ Todoist(라벨 붙은 끝나지 않은 할 일) 차이를 보여 주고, --yes 면 사이트 값으로 맞춘다
    const cfg = todoistConfig();
    if (!cfg) { console.error('오류: TODOIST_API_TOKEN 이 없습니다. 운영 env 를 받은 괄호 안에서 실행하세요(README-progress 맨 위).'); process.exit(2); }
    if (!pushAllowed(cfg)) { console.error('오류: 로컬 연습 저장소입니다. todoist-sync 는 운영 저장소에서만 돕니다(시험은 TODOIST_API_BASE 에 가짜 서버).'); process.exit(2); }
    if (!isRealTodoist(cfg)) console.error(`[Todoist] 가짜 서버 ${cfg.base}`);
    const doc = await readDoc();
    const rows = planSync(doc, await fetchTodoistLabeled());
    const LABEL = { differs: '값이 다름', missing: 'Todoist 에 없음(완료 · 삭제됨?)', error: '보내기 실패 표시', unpaired: '짝 없음', todoistOnly: 'Todoist 에만' };
    const count = Object.fromEntries(Object.keys(LABEL).map((k) => [k, rows.filter((r) => r.kind === k).length]));
    for (const k of ['differs', 'error', 'missing']) for (const r of rows.filter((x) => x.kind === k)) {
      console.error(`  [${LABEL[k]}] ${r.text}  (사이트 ${r.siteId} · todoist ${r.todoistId})${r.fields ? `  칸: ${r.fields.join(', ')}` : ''}${r.error ? `  ${r.error}` : ''}`);
    }
    console.error(`차이 ${count.differs} · 실패 표시 ${count.error} · Todoist 에 없음 ${count.missing} · 짝 없음 ${count.unpaired} · Todoist 에만 ${count.todoistOnly}`);
    let pushed = null;
    if (flags.has('--yes')) {
      pushed = await applySync(rows);
      console.error(`[Todoist] 맞춤: 호출 ${pushed.calls.length}건${pushed.errors.length ? ` · 실패 ${pushed.errors.length}건` : ''}`);
    } else if (count.differs + count.error) console.error('사이트 값으로 맞추려면 --yes 를 붙이세요. 「Todoist 에 없음」 · 「짝 없음」 · 「Todoist 에만」은 손대지 않습니다(짝 맞추기는 scripts/todoist-match.mjs).');
    console.log(JSON.stringify(flags.has('--json') ? { count, rows, pushed } : { count, pushed }, null, 2));
    if (pushed?.errors.length) process.exitCode = 1;
  } else usage(cmd ? `모르는 명령 ${cmd}` : undefined);
} catch (e) {
  if (e instanceof OpError) console.error(JSON.stringify({ error: e.body }));
  else console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
