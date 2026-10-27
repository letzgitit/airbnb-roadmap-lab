#!/usr/bin/env node
// 블록 메모 CLI(lib/core/cardnotes.ts 와 같은 규칙). 메모는 현황 문서 밖 따로 저장한다 — 운영 = Upstash 해시 oedomin:cardnotes, 로컬 = .data/cardnotes.json.
// 어느 저장소에 붙었는지는 매번 stderr 첫 줄 [저장소] 로 찍는다(progress.mjs 와 같은 규칙). 원격(운영)에 쓰려면 --yes 가 필요하다.
//   node scripts/cardnotes.mjs list [블록 id]                          메모 목록(블록 id · 메모 id · 적은 날 · 쓴 사람 · 글)
//   node scripts/cardnotes.mjs add <블록 id> <글…> [--by 이름] [--yes]   한 줄 더하기
//   node scripts/cardnotes.mjs rm <블록 id> <메모 id> [--yes]            지우기(되살릴 수 없다 — 지운 메모는 출력 JSON 에 남는다)
// 블록 id = 「<분야>.<블록>」: admin.move-in · admin.register · admin.safety · admin.inspect · admin.biz · admin.step-1~3,
//   facility.bath · facility.wall · facility.aircon · facility.light · facility.buy · facility.other, ops.listing · ops.guide · ops.supplies · ops.other
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(path.join(root, f)); } catch { /* 없으면 건너뜀 */ } }

const { listCardNotes, getCardNotes, addCardNote, removeCardNote, cardNoteStoreInfo, CardNoteError } = await import('../lib/core/cardnotes.ts');

function usage(msg) {
  if (msg) console.error(`오류: ${msg}\n`);
  console.error(`사용법:
  node scripts/cardnotes.mjs list [블록 id]
  node scripts/cardnotes.mjs add <블록 id> <글…> [--by 이름] [--yes]
  node scripts/cardnotes.mjs rm <블록 id> <메모 id> [--yes]
    블록 id 예: admin.move-in · facility.bath · ops.other`);
  process.exit(2);
}

const [cmd, ...rest] = process.argv.slice(2);
const KNOWN = new Set(['--yes', '--by']);
const byIdx = rest.indexOf('--by');
const by = byIdx >= 0 ? rest[byIdx + 1] : 'claude';
if (byIdx >= 0 && (!by || by.startsWith('--'))) usage('--by 뒤에 이름이 필요합니다.');
const flags = new Set(rest.filter((a, i) => a.startsWith('--') && !(byIdx >= 0 && i === byIdx + 1)));
for (const f of flags) if (!KNOWN.has(f)) usage(`모르는 옵션 ${f}`);
const pos = rest.filter((a, i) => !a.startsWith('--') && !(byIdx >= 0 && i === byIdx + 1));
if (!cmd) usage();

const info = cardNoteStoreInfo();
const remote = info.kind === 'redis';
console.error(`[저장소] ${info.label}${remote ? '  ← 원격(운영) 데이터' : '  (로컬 연습용)'}`);
const needYes = () => {
  if (remote && !flags.has('--yes')) {
    console.error('원격(운영) 저장소입니다. 위 내용이 맞으면 --yes 를 붙여 다시 실행하세요.');
    process.exit(3);
  }
};
// 적은 날(한국 날짜)
const day = (iso) => new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString().slice(0, 10);

try {
  if (cmd === 'list') {
    const all = pos[0] ? { [pos[0]]: await getCardNotes(pos[0]) } : await listCardNotes();
    const ids = Object.keys(all).filter((id) => all[id].length).sort();
    if (!ids.length) console.log('(메모 없음)');
    for (const id of ids) {
      console.log(`${id}  ${all[id].length}개`);
      for (const n of all[id]) console.log(`  ${n.id}  ${day(n.at)}  ${n.by || '-'}  ${n.text}`);
    }
  } else if (cmd === 'add') {
    if (!pos[0] || pos.length < 2) usage('블록 id 와 글이 필요합니다.');
    const text = pos.slice(1).join(' ');
    console.error(`메모 더하기 → ${pos[0]}  「${text}」 — ${by}`);
    needYes();
    const note = await addCardNote(pos[0], text, { name: by });
    console.log(JSON.stringify({ store: info.kind, cardId: pos[0], note }));
  } else if (cmd === 'rm') {
    if (!pos[0] || !pos[1]) usage('블록 id 와 메모 id 가 필요합니다.');
    console.error(`메모 지우기 → ${pos[0]} ${pos[1]}`);
    needYes();
    const note = await removeCardNote(pos[0], pos[1]);
    console.log(JSON.stringify({ store: info.kind, cardId: pos[0], removed: note }));
  } else usage(`모르는 명령 ${cmd}`);
} catch (e) {
  if (e instanceof CardNoteError) { console.error(`오류(${e.status} ${e.code}): ${e.message}`); process.exit(1); }
  throw e;
}
