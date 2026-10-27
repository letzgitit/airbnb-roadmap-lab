#!/usr/bin/env node
// 할 일 설명서 CLI(lib/core/guides.ts 와 같은 규칙). 설명서는 현황 문서 밖 따로 저장한다 — 운영 = Upstash 해시 oedomin:guides, 로컬 = .data/guides.json.
// 어느 저장소에 붙었는지는 매번 stderr 첫 줄 [저장소] 로 찍는다(progress.mjs 와 같은 규칙). 원격(운영)에 쓰려면 --yes 가 필요하다.
//   node scripts/guides.mjs list                          설명서가 있는 할 일(글자 수 · version · 할 일 제목, 지운 할 일 표시)
//   node scripts/guides.mjs get <할 일 id>                 본문(stdout)
//   node scripts/guides.mjs set <할 일 id> <file.md> [--by 이름] [--yes]   한 개 덮어쓰기(빈 파일이면 지움)
//   node scripts/guides.mjs import <guides.json> [--by 이름] [--dry-run|--yes]   { "<할 일 id>": "<마크다운>", … } 한 번에
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userCwd = process.cwd();
process.chdir(root);
for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(path.join(root, f)); } catch { /* 없으면 건너뜀 */ } }

const { getGuide, listGuides, putGuide, importGuides, guideStoreInfo, GuideError } = await import('../lib/core/guides.ts');
const { readDoc } = await import('../lib/core/engine.ts');

function usage(msg) {
  if (msg) console.error(`오류: ${msg}\n`);
  console.error(`사용법:
  node scripts/guides.mjs list
  node scripts/guides.mjs get <할 일 id>
  node scripts/guides.mjs set <할 일 id> <file.md> [--by 이름] [--yes]
  node scripts/guides.mjs import <guides.json> [--by 이름] [--dry-run | --yes]
    guides.json = { "t_xxxxxxxxxxxx": "## 왜 해야 하나요\\n…", … }  (빈 글이면 그 설명서를 지움)`);
  process.exit(2);
}

const [cmd, ...rest] = process.argv.slice(2);
const KNOWN = new Set(['--yes', '--dry-run', '--by']);
const byIdx = rest.indexOf('--by');
const by = byIdx >= 0 ? rest[byIdx + 1] : 'claude';
if (byIdx >= 0 && (!by || by.startsWith('--'))) usage('--by 뒤에 이름이 필요합니다.');
const flags = new Set(rest.filter((a) => a.startsWith('--')));
for (const f of flags) if (!KNOWN.has(f)) usage(`모르는 옵션 ${f}`);
const pos = rest.filter((a, i) => !a.startsWith('--') && !(byIdx >= 0 && i === byIdx + 1));
if (!cmd) usage();

const info = guideStoreInfo();
const remote = info.kind === 'redis';
console.error(`[저장소] ${info.label}${remote ? '  ← 원격(운영) 데이터' : '  (로컬 연습용)'}`);
const needYes = () => {
  if (remote && !flags.has('--yes')) {
    console.error('원격(운영) 저장소입니다. 위 내용이 맞으면 --yes 를 붙여 다시 실행하세요(import 는 --dry-run 으로 미리 보기).');
    process.exit(3);
  }
};

try {
  if (cmd === 'list') {
    const [guides, doc] = await Promise.all([listGuides(), readDoc()]);
    const ids = Object.keys(guides).sort();
    if (!ids.length) console.log('(설명서 없음)');
    for (const id of ids) {
      const g = guides[id];
      const t = Object.hasOwn(doc.tasks, id) ? doc.tasks[id] : null;
      const state = !t ? '  ⚠️ 현황에 없는 할 일' : t.deletedAt ? '  (지운 할 일 — 화면에 안 보임)' : '';
      console.log(`${id}  ${String(g.md.length).padStart(5)}자  v${g.version}  ${t ? t.text : ''}${state}`);
    }
  } else if (cmd === 'get') {
    if (!pos[0]) usage('할 일 id 가 필요합니다.');
    const g = await getGuide(pos[0]);
    if (!g) { console.error('설명서 없음'); process.exit(1); }
    console.error(`v${g.version} · ${g.updatedBy} · ${g.updatedAt}`);
    process.stdout.write(`${g.md}\n`);
  } else if (cmd === 'set') {
    if (!pos[0] || !pos[1]) usage('할 일 id 와 .md 파일이 필요합니다.');
    const md = fs.readFileSync(path.resolve(userCwd, pos[1]), 'utf8');
    console.error(`설명서 ${md.trim() ? `덮어쓰기 ${md.trim().length}자` : '지우기'} → ${pos[0]}  — ${by}`);
    needYes();
    const g = await putGuide(pos[0], md, undefined, { name: by }, { force: true });
    console.log(JSON.stringify({ store: info.kind, id: pos[0], guide: g ? { len: g.md.length, version: g.version } : null }));
  } else if (cmd === 'import') {
    if (!pos[0]) usage('guides.json 경로가 필요합니다.');
    const map = JSON.parse(fs.readFileSync(path.resolve(userCwd, pos[0]), 'utf8'));
    const dryRun = flags.has('--dry-run');
    const doc = await readDoc();
    // 먼저 미리 보기(형식 검사 포함) → 운영이면 --yes 확인 → 쓰기
    const plan = await importGuides(map, { name: by }, { dryRun: true, doc });
    console.error(`새로 ${plan.created.length} · 바꿈 ${plan.updated.length} · 지움 ${plan.deleted.length} · 그대로 ${plan.unchanged.length}${plan.missingTask.length ? ` · ⚠️ 현황에 없는 할 일 ${plan.missingTask.length}개(${plan.missingTask.join(', ')})` : ''}${dryRun ? '  (dry-run: 쓰지 않음)' : ''}`);
    if (!dryRun) needYes();
    const rep = dryRun ? plan : await importGuides(map, { name: by }, { doc });
    console.log(JSON.stringify({ store: info.kind, written: !dryRun, ...rep }, null, 2));
  } else usage(`모르는 명령 ${cmd}`);
} catch (e) {
  if (e instanceof GuideError) { console.error(`오류(${e.status} ${e.code}): ${e.message}`); process.exit(1); }
  throw e;
}
