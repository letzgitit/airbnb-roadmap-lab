#!/usr/bin/env node
// 사진 · PDF 를 터미널에서 올리고 · 보고 · 지우는 CLI. 사이트 API 와 같은 처리(lib/core/photos.ts)를 쓴다.
// 저장소: 환경변수에 Upstash(KV_REST_API_* 또는 UPSTASH_REDIS_REST_*)가 있으면 원격(운영), 없으면 .data/photos/ (로컬 연습용)
// 어느 저장소에 붙었는지는 매번 stderr 첫 줄에 찍힌다. 원격(운영)에 쓰려면 --yes 가 필요하다.
// 🔴 사진 · 설명은 공개 저장소에 두지 않는다. manifest 도 저장소 밖(예: 스크래치패드)에 둔다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userCwd = process.cwd();
process.chdir(root);
for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(path.join(root, f)); } catch { /* 없으면 건너뜀 */ } }

const P = await import('../lib/core/photos.ts');
const { byStepPosition } = await import('../lib/core/photo-order.ts');

function usage(msg) {
  if (msg) console.error(`오류: ${msg}\n`);
  console.error(`사용법:
  node scripts/photos.mjs list [--json]
  node scripts/photos.mjs add --step <1~14> <파일...> [--album "묶음 이름"] [--caption "설명"] [--doc] [--original-url <주소>] [--by <이름>] [--yes]
  node scripts/photos.mjs add-manifest <manifest.json> [--by <이름>] [--yes]
  node scripts/photos.mjs delete <id> [--purge] [--yes]
  node scripts/photos.mjs restore <id> [--yes]
  --step   타임라인 단계 번호(필수). manifest 는 항목마다 "step"
  --doc    글씨 많은 문서(계약서 · 등기부): 큰 사진을 2400px 로
  --original-url  「원본 보기」 주소. 없으면 구글 드라이브(데스크톱) 안 파일의 드라이브 id 로 자동으로 만든다
  --purge  삭제 표시가 아니라 바로 완전히 지움(되살릴 수 없음)
  --yes    원격(운영) 저장소에 실제로 쓸 때 필요
자세한 내용: scripts/README-photos.md`);
  process.exit(2);
}

// ── 인자 ──
const [cmd, ...rest] = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--step', '--album', '--caption', '--by', '--original-url']);
const KNOWN = new Set(['--json', '--yes', '--doc', '--purge', ...VALUE_FLAGS]);
const opts = {};
const pos = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (!a.startsWith('--')) { pos.push(a); continue; }
  if (!KNOWN.has(a)) usage(`모르는 옵션 ${a}`);       // 오타로 실제 쓰기가 되는 일을 막는다
  if (VALUE_FLAGS.has(a)) {
    const v = rest[++i];
    if (v === undefined || v.startsWith('--')) usage(`${a} 뒤에 값이 필요합니다.`);
    opts[a] = v;
  } else opts[a] = true;
}

const store = P.photoStoreInfo();
const remote = store.kind === 'redis';
console.error(`[저장소] ${store.label}${remote ? '  ← 원격(운영) 데이터' : '  (로컬 연습용)'}`);

function needYes(summary) {
  for (const l of summary) console.error(`  ${l}`);
  if (remote && !opts['--yes']) {
    console.error('원격(운영) 저장소입니다. 위 내용이 맞으면 --yes 를 붙여 다시 실행하세요.');
    process.exit(3);
  }
}

// PDF 첫 쪽을 PNG 로 그린다(맥: pdftoppm 이 있으면 그것, 없으면 sips). 못 하면 null → 화면엔 PDF 칸으로 보인다.
function pdfPreview(file) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'photos-pdf-'));
  try {
    const base = path.join(dir, 'p');
    let r = spawnSync('pdftoppm', ['-png', '-r', '200', '-f', '1', '-l', '1', '-singlefile', file, base]);
    if (r.status === 0 && fs.existsSync(`${base}.png`)) return fs.readFileSync(`${base}.png`);
    r = spawnSync('sips', ['-s', 'format', 'png', file, '--out', `${base}.png`]);
    if (r.status === 0 && fs.existsSync(`${base}.png`)) return fs.readFileSync(`${base}.png`);
    return null;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// 구글 드라이브(데스크톱) 안의 파일이면 확장 속성에서 드라이브 id 를 읽어 「원본 보기」 주소를 만든다.
// 막 옮긴 파일은 id 가 늦게 붙으므로 30초까지 기다리고, 그래도 없으면 조용히 건너뛴다(맥 전용).
async function driveUrl(file) {
  if (process.platform !== 'darwin' || !/\/Library\/CloudStorage\/GoogleDrive-/.test(file)) return null;
  const until = Date.now() + 30_000;
  for (;;) {
    const r = spawnSync('xattr', ['-p', 'com.google.drivefs.item-id#S', file], { encoding: 'utf8' });
    const id = r.status === 0 ? r.stdout.trim() : '';
    if (/^[A-Za-z0-9_-]{10,}$/.test(id)) return `https://drive.google.com/file/d/${id}/view`;
    if (Date.now() > until) return null;
    await new Promise((res) => setTimeout(res, 2000));
  }
}

const kb = (n) => (n ? `${Math.round(n / 1024)}KB` : '-');

async function addItems(items, by) {
  needYes([`올릴 파일 ${items.length}개:`, ...items.map((it, i) => `#${i} [${it.step}단계${it.album ? ` · ${it.album}` : ''}] ${path.basename(it.file)}${it.caption ? ` — ${it.caption}` : ''}${it.doc ? ' (문서)' : ''}`)]);
  const added = [], failed = [];
  for (const [i, it] of items.entries()) {
    try {
      const data = fs.readFileSync(it.file);
      const pdf = P.isPdf(data);
      const originalUrl = it.originalUrl || await driveUrl(it.file);
      // 찍은 시각: EXIF 가 없으면 파일 수정 시각
      const m = await P.addPhoto({ stepId: it.step, album: it.album ?? '', takenAtFallback: fs.statSync(it.file).mtime, caption: it.caption ?? '', by, data, doc: !!it.doc, originalUrl, pdfPreview: pdf ? pdfPreview(it.file) : null });
      added.push({ index: i, id: m.id, stepId: m.stepId, album: m.album, takenAt: m.takenAt, kind: m.kind, width: m.width, height: m.height, bytes: m.bytes, original: !!m.originalUrl });
      console.error(`  ✓ #${i} ${path.basename(it.file)} → ${m.id} ${m.width}x${m.height} 큰 ${kb(m.bytes.full)} · 작은 ${kb(m.bytes.thumb)}${m.bytes.file ? ` · PDF ${kb(m.bytes.file)}` : ''}${m.originalUrl ? ' · 원본 링크' : ''}`);
    } catch (e) {
      failed.push({ index: i, file: path.basename(it.file), error: e instanceof Error ? e.message : String(e) });
      console.error(`  ✗ #${i} ${path.basename(it.file)}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(JSON.stringify({ store: store.kind, added, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
}

try {
  const by = opts['--by'] || 'claude';
  if (cmd === 'list') {
    const all = await P.listPhotos();
    if (opts['--json']) { console.log(JSON.stringify(all.map(P.toView), null, 2)); process.exit(0); }
    const live = all.filter((m) => !m.deletedAt);
    const albums = new Map();
    const sorted = live.sort(byStepPosition);
    for (const m of sorted) { const k = `${m.stepId}단계`; albums.set(k, [...(albums.get(k) ?? []), m]); }
    console.log(`사진 ${live.length}장 · 단계 ${albums.size}개 · 원본 링크 ${live.filter((m) => m.originalUrl).length}장 · 삭제한 사진 ${all.length - live.length}장`);
    for (const [album, items] of albums) {
      const by = new Map();
      for (const m of items) by.set(m.album || '(묶음 없음)', (by.get(m.album || '(묶음 없음)') ?? 0) + 1);
      console.log(`\n[${album}] ${items.length}  (${[...by].map(([k, v]) => `${k} ${v}`).join(' · ')})`);
      for (const m of items) console.log(`  ${m.id}  ${m.takenAt.slice(0, 16)}  ${m.kind === 'pdf' ? 'PDF ' : ''}${m.width}x${m.height}  큰 ${kb(m.bytes.full)}  작은 ${kb(m.bytes.thumb)}${m.bytes.file ? `  PDF ${kb(m.bytes.file)}` : ''}${m.originalUrl ? '  [원본]' : ''}  ${m.caption}`);
    }
  } else if (cmd === 'add') {
    const files = pos;
    if (!opts['--step'] || files.length === 0) usage('--step <단계 번호> 와 파일이 필요합니다.');
    await addItems(files.map((f) => ({ step: Number(opts['--step']), album: opts['--album'] ?? '', file: path.resolve(userCwd, f), caption: opts['--caption'], doc: !!opts['--doc'], originalUrl: opts['--original-url'] })), by);
  } else if (cmd === 'add-manifest') {
    if (!pos[0]) usage('manifest.json 경로가 필요합니다.');
    const mf = path.resolve(userCwd, pos[0]);
    const j = JSON.parse(fs.readFileSync(mf, 'utf8'));
    const list = Array.isArray(j) ? j : j.items;
    if (!Array.isArray(list) || !list.length) throw new Error('manifest 는 [{step,file,album?,caption?,doc?,originalUrl?}] 배열이거나 {"items":[...]} 여야 합니다.');
    // file 은 manifest 파일 기준 상대 경로 또는 절대 경로
    const items = list.map((it) => {
      if (!it || it.step === undefined || typeof it.file !== 'string') throw new Error('항목마다 step · file 이 필요합니다.');
      const file = path.resolve(path.dirname(mf), it.file);
      if (!fs.existsSync(file)) throw new Error(`파일이 없습니다: ${it.file}`);
      return { step: Number(it.step), album: it.album ?? '', file, caption: it.caption, doc: !!it.doc, originalUrl: it.originalUrl };
    });
    await addItems(items, opts['--by'] || (!Array.isArray(j) && j.by) || 'claude');
  } else if (cmd === 'delete' || cmd === 'restore') {
    const id = pos[0];
    if (!id) usage('사진 id 가 필요합니다.');
    const m = await P.getPhoto(id);
    if (!m) throw new Error(`사진을 찾지 못했습니다: ${id}`);
    const what = cmd === 'restore' ? '되살리기' : opts['--purge'] ? '완전히 지우기(되살릴 수 없음)' : '삭제 표시(30일 보관)';
    needYes([`${what}: ${m.id} [${m.stepId}단계${m.album ? ` · ${m.album}` : ''}] ${m.caption}`]);
    if (cmd === 'restore') console.log(JSON.stringify({ ok: true, photo: P.toView(await P.updatePhoto(id, { restore: true }, by)) }));
    else if (opts['--purge']) console.log(JSON.stringify({ ok: await P.purgePhoto(id), id }));
    else console.log(JSON.stringify({ ok: true, photo: P.toView(await P.deletePhoto(id, by)) }));
  } else usage(cmd ? `모르는 명령 ${cmd}` : undefined);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
