import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import { redisEnv, sanitize } from './store.ts';
import { fetchPreview, LinkBlockedError } from './link-preview.ts';

// 「꾸미기 참고」(인테리어 벤치마킹 모음) 저장소 — 서버 API 와 CLI scripts/bench.mjs 공용.
// 🔴 101호 평수 · 구조 같은 우리 집 이야기가 들어가므로 공개 저장소(content/)에 두지 않는다. 운영은 Upstash, 로컬 연습은 .data/bench/ (git 무시).
// 현황 문서(oedomin:progress:v1)와는 따로 둔다: 문서 version · 병합 규칙을 건드리지 않고, 큰 묶음이 현황 폴링 응답에 실리지 않게.
//
// Redis 배치
//   oedomin:bench:batches    해시. 필드 = 수집일(collectedAt, YYYY-MM-DD), 값 = 묶음 JSON(BenchBatch). 같은 날 다시 넣으면 --replace 로 교체
//   oedomin:bench:links      해시. 필드 = 링크 id(b_link_<주소 해시>), 값 = 두 사람이 화면에서 올린 링크 JSON(BenchLink). 설명은 Claude 가 CLI(links-fill)로 채운다
//   oedomin:bench:reactions  해시. 필드 = 「<항목 id>|<이메일>」, 값 = 반응 JSON(BenchReaction). 사람마다 따로 써서 두 사람이 동시에 남겨도 서로 덮지 않는다

export const BATCHES_KEY = 'oedomin:bench:batches';
export const LINKS_KEY = 'oedomin:bench:links';
export const REACTIONS_KEY = 'oedomin:bench:reactions';

export const BENCH_SOURCES = ['오늘의집', '에어비앤비', '블로그', '브런치', '유튜브', '인스타', '스레드', '핀터레스트', '기타'] as const;
export const BENCH_SPACES = ['전체', '거실주방', '손님방', '호스트방', '욕실', '현관', '조명·소품'] as const;
export type BenchSource = (typeof BENCH_SOURCES)[number];
export type BenchSpace = (typeof BENCH_SPACES)[number];

export class BenchError extends Error {
  status: number; code: string;
  // CLI 는 타입만 지우고 돌리므로(Node strip-types) 생성자 매개변수 속성 문법을 쓰지 않는다
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

// ── 들어오는 묶음 모양(수집 결과) ──
const dateStr = z.string().refine((s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'collectedAt 은 YYYY-MM-DD 날짜여야 합니다.');
// 링크는 http(s) 만(javascript: 같은 주소가 화면 링크로 들어가지 않게)
const webUrl = z.string().trim().max(2000).refine((s) => {
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}, 'http(s) 주소여야 합니다.');
const str = (max: number) => z.string().trim().max(max, `${max}자 이하로 써 주세요.`);

export const benchItemSchema = z.object({
  id: z.string().regex(/^b_[A-Za-z0-9_-]{1,60}$/, 'id 는 b_ 로 시작하는 영문 · 숫자 · _ · - 이어야 합니다.'),
  title: str(150).min(1, '제목이 비었습니다.'),
  source: z.enum(BENCH_SOURCES),
  url: webUrl,
  image: z.union([webUrl, z.null()]).optional().transform((v) => v ?? null),
  space: z.enum(BENCH_SPACES),
  fit: str(600).default(''),
  takeaways: z.array(str(300)).max(12).default([]).transform((a) => a.filter(Boolean)),
  cost: str(150).default(''),
  caution: z.union([str(400), z.null()]).optional().transform((v) => (v ? v : null)),
});
export const benchBatchSchema = z.object({
  collectedAt: dateStr,
  insights: z.array(z.object({ title: str(150).min(1, '공통 패턴 제목이 비었습니다.'), detail: str(800).default('') })).max(20).default([]),
  items: z.array(benchItemSchema).max(150, '한 묶음은 150건까지입니다.'),
}).superRefine((b, ctx) => {
  const seen = new Set<string>();
  b.items.forEach((it, i) => {
    if (seen.has(it.id)) ctx.addIssue({ code: 'custom', path: ['items', i, 'id'], message: `같은 id 가 두 번 있습니다: ${it.id}` });
    seen.add(it.id);
  });
});
export type BenchItem = z.infer<typeof benchItemSchema>;
export type BenchBatchInput = z.infer<typeof benchBatchSchema>;
export interface BenchBatch extends BenchBatchInput { addedAt: string; addedBy: string }

export const VOTES = ['up', 'down'] as const;
export type Vote = (typeof VOTES)[number];
export interface BenchReaction { itemId: string; email: string; name: string; vote: Vote | null; memo: string; updatedAt: string }
export const MEMO_MAX = 200;

/** 묶음 JSON 검사. 틀리면 BenchError(400) — 메시지에 어느 칸인지 적는다 */
export function parseBatch(raw: unknown): BenchBatchInput {
  const r = benchBatchSchema.safeParse(raw);
  if (!r.success) {
    const lines = r.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(전체)'}: ${i.message}`);
    throw new BenchError(400, 'invalid', `묶음 형식이 틀렸습니다.\n  ${lines.join('\n  ')}`);
  }
  return r.data;
}

// ── 저장소 ──
interface Backend {
  kind: 'redis' | 'file';
  label: string;
  all(key: string): Promise<Record<string, string>>;
  get(key: string, field: string): Promise<string | null>;
  put(key: string, field: string, json: string): Promise<void>;
  drop(key: string, field: string): Promise<void>;
}

function redisBackend(url: string, token: string): Backend {
  const redis = new Redis({ url, token, automaticDeserialization: false });
  // 오류 메시지에 요청 본문(우리 집 이야기 · 메모)이 실리지 않게 잘라서 다시 던진다
  const wrap = async <T>(what: string, fn: () => Promise<T>) => { try { return await fn(); } catch (e) { throw sanitize(e, what); } };
  return {
    kind: 'redis',
    label: `redis ${new URL(url).host}`,
    all: (key) => wrap('꾸미기 참고 읽기', async () => ((await redis.hgetall<Record<string, string>>(key)) ?? {}) as Record<string, string>),
    get: (key, field) => wrap('꾸미기 참고 읽기', async () => {
      const v = await redis.hget<string>(key, field);
      return v === null || v === undefined ? null : String(v);
    }),
    put: (key, field, json) => wrap('꾸미기 참고 쓰기', async () => { await redis.hset(key, { [field]: json }); }),
    drop: (key, field) => wrap('꾸미기 참고 지우기', async () => { await redis.hdel(key, field); }),
  };
}

const DIR = path.join(process.cwd(), '.data', 'bench');
const fileOf = (key: string) => path.join(DIR, key === BATCHES_KEY ? 'batches.json' : key === LINKS_KEY ? 'links.json' : 'reactions.json');
let fileLock: Promise<unknown> = Promise.resolve();

function fileBackend(): Backend {
  const readMap = async (key: string): Promise<Record<string, string>> => {
    try { return JSON.parse(await fs.readFile(fileOf(key), 'utf8')); } catch { return {}; }
  };
  // 단일 프로세스 개발용: 프로세스 안에서 직렬화 → 임시 파일 → 교체
  const edit = (key: string, fn: (m: Record<string, string>) => void) => {
    const run = async () => {
      const m = await readMap(key);
      fn(m);
      await fs.mkdir(DIR, { recursive: true });
      const tmp = `${fileOf(key)}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(m), 'utf8');
      await fs.rename(tmp, fileOf(key));
    };
    const p = fileLock.then(run, run);
    fileLock = p.catch(() => undefined);
    return p;
  };
  return {
    kind: 'file',
    label: `file ${path.relative(process.cwd(), DIR) || DIR}`,
    all: readMap,
    get: async (key, field) => (await readMap(key))[field] ?? null,
    put: (key, field, json) => edit(key, (m) => { m[field] = json; }),
    drop: (key, field) => edit(key, (m) => { delete m[field]; }),
  };
}

let cached: Backend | null = null;
function backend(): Backend {
  if (cached) return cached;
  const env = redisEnv();
  cached = env ? redisBackend(env.url, env.token) : fileBackend();
  return cached;
}
export function benchStoreInfo() { const b = backend(); return { kind: b.kind, label: b.label }; }

function parseJson<T>(s: string | null): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

// ── 묶음 ──
/** 모든 묶음, 최신 수집일이 위 */
export async function listBatches(): Promise<BenchBatch[]> {
  const all = await backend().all(BATCHES_KEY);
  return Object.values(all).map((s) => parseJson<BenchBatch>(s)).filter((b): b is BenchBatch => !!b)
    .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
}

export async function getBatch(collectedAt: string): Promise<BenchBatch | null> {
  return parseJson<BenchBatch>(await backend().get(BATCHES_KEY, collectedAt));
}

/** 묶음 넣기. 같은 수집일이 이미 있으면 replace 일 때만 교체 */
export async function addBatch(raw: unknown, by: string, opts: { replace?: boolean } = {}): Promise<{ batch: BenchBatch; replaced: boolean }> {
  const b = parseBatch(raw);
  const cur = await getBatch(b.collectedAt);
  if (cur && !opts.replace) throw new BenchError(409, 'exists', `${b.collectedAt} 묶음이 이미 있습니다(${cur.items.length}건). 바꾸려면 --replace 를 붙이세요.`);
  const batch: BenchBatch = { ...b, addedAt: new Date().toISOString(), addedBy: by };
  await backend().put(BATCHES_KEY, b.collectedAt, JSON.stringify(batch));
  return { batch, replaced: !!cur };
}

/** CLI 전용: 묶음 하나 지우기(반응은 항목 id 에 붙어 있어 남는다 — 같은 id 가 다시 들어오면 다시 보인다) */
export async function deleteBatch(collectedAt: string): Promise<boolean> {
  if (!(await getBatch(collectedAt))) return false;
  await backend().drop(BATCHES_KEY, collectedAt);
  return true;
}

// ── 반응(좋아요 · 별로 · 메모) ──
const reactionField = (itemId: string, email: string) => `${itemId}|${email}`;

export async function listReactions(): Promise<BenchReaction[]> {
  const all = await backend().all(REACTIONS_KEY);
  return Object.values(all).map((s) => parseJson<BenchReaction>(s)).filter((r): r is BenchReaction => !!r);
}

/** 한 사람의 한 항목 반응을 통째로 바꾼다. 좋아요 · 별로도 메모도 없으면 지운다 */
export async function setReaction(input: { itemId: unknown; vote: unknown; memo: unknown }, actor: { email: string; name: string }): Promise<BenchReaction | null> {
  const itemId = typeof input.itemId === 'string' && /^b_[A-Za-z0-9_-]{1,60}$/.test(input.itemId) ? input.itemId : null;
  if (!itemId) throw new BenchError(400, 'invalid', '항목을 찾지 못했어요.');
  const vote = input.vote === null || input.vote === undefined ? null : (VOTES as readonly unknown[]).includes(input.vote) ? (input.vote as Vote) : undefined;
  if (vote === undefined) throw new BenchError(400, 'invalid', '좋아요 · 별로 값이 올바르지 않아요.');
  const memo = typeof input.memo === 'string' ? input.memo.replace(/\s+/g, ' ').trim() : '';
  if (memo.length > MEMO_MAX) throw new BenchError(400, 'memo_too_long', `메모는 ${MEMO_MAX}자까지예요.`);
  // 지금 있는 묶음의 항목에만 남긴다(엉뚱한 id 로 저장소가 불어나지 않게)
  const known = (await listBatches()).some((b) => b.items.some((it) => it.id === itemId)) || (await listLinks()).some((l) => l.id === itemId);
  if (!known) throw new BenchError(404, 'not_found', '이 참고 자료를 찾지 못했어요. 새로고침해 주세요.');
  const field = reactionField(itemId, actor.email);
  if (!vote && !memo) { await backend().drop(REACTIONS_KEY, field); return null; }
  const r: BenchReaction = { itemId, email: actor.email, name: actor.name, vote, memo, updatedAt: new Date().toISOString() };
  await backend().put(REACTIONS_KEY, field, JSON.stringify(r));
  return r;
}

// 화면에 보내는 반응(이메일은 빼고, 내 것인지만)
export interface ReactionView { name: string; vote: Vote | null; memo: string; updatedAt: string; mine: boolean }
export const toReactionView = (r: BenchReaction, myEmail: string): ReactionView => ({
  name: r.name, vote: r.vote, memo: r.memo, updatedAt: r.updatedAt, mine: r.email === myEmail,
});
export type BatchView = Pick<BenchBatch, 'collectedAt' | 'insights' | 'items'>;
export const toBatchView = (b: BenchBatch): BatchView => ({ collectedAt: b.collectedAt, insights: b.insights, items: b.items });

// ── 올린 링크 ──
// 두 사람이 「링크 올리기」로 넣은 참고 자료. 설명(fit · takeaways …)은 처음엔 비어 있고(status pending), Claude 가 CLI 로 채우면 done.
export const NOTE_MAX = 200;
export const LINK_ID_RE = /^b_link_[0-9a-f]{10}$/;
export const LINK_MAX = 300;
export interface BenchLink {
  id: string; url: string; title: string; image: string | null; space: BenchSpace | null; note: string;
  addedBy: string; addedByEmail: string; addedAt: string; status: 'pending' | 'done';
  fit?: string; takeaways?: string[]; cost?: string; caution?: string | null; source: BenchSource;
  /** 지우면 이 시각이 붙는다(화면에서만 사라지고 되돌릴 수 있다) */
  deletedAt?: string | null;
}

/** 같은 주소인지 보는 기준: 호스트 소문자 · #뒤 · 추적용 주소 변수 · 끝 슬래시를 뺀다 */
export function normalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|igshid$|igsh$|gclid$)/i.test(k)) u.searchParams.delete(k);
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  return u.toString();
}
export const linkIdOf = (url: string) => `b_link_${createHash('sha1').update(normalizeUrl(url)).digest('hex').slice(0, 10)}`;

/** 주소의 도메인으로 출처 짐작 */
export function sourceOf(url: string): BenchSource {
  let h = '';
  try { h = new URL(url).hostname.toLowerCase(); } catch { return '기타'; }
  const is = (d: string) => h === d || h.endsWith(`.${d}`);
  if (is('ohou.se')) return '오늘의집';
  if (/(^|\.)airbnb\.[a-z.]+$/.test(h) || is('abnb.me')) return '에어비앤비';
  if (/(^|\.)pinterest\.[a-z.]+$/.test(h) || is('pin.it')) return '핀터레스트';
  if (is('instagram.com')) return '인스타';
  if (is('threads.net') || is('threads.com')) return '스레드';
  if (is('brunch.co.kr')) return '브런치';
  if (is('blog.naver.com') || is('tistory.com')) return '블로그';
  if (is('youtube.com') || is('youtu.be')) return '유튜브';
  return '기타';
}

export async function listLinks(opts: { withDeleted?: boolean } = {}): Promise<BenchLink[]> {
  const all = await backend().all(LINKS_KEY);
  return Object.values(all).map((s) => parseJson<BenchLink>(s)).filter((l): l is BenchLink => !!l && (opts.withDeleted || !l.deletedAt))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}
const getLink = async (id: string) => parseJson<BenchLink>(await backend().get(LINKS_KEY, id));

export interface AddLinkResult { link: BenchLink; fetched: boolean }
/** 링크 올리기. 주소가 안 되는 것이면 400, 이미 있으면 409. 제목 · 그림을 못 읽어도 도메인 이름으로 올린다 */
export async function addLink(input: { url: unknown; note: unknown; space: unknown }, actor: { email: string; name: string }): Promise<AddLinkResult> {
  const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
  if (!rawUrl) throw new BenchError(400, 'invalid', '링크를 붙여 넣어 주세요.');
  if (rawUrl.length > 2000 || !webUrl.safeParse(rawUrl).success) throw new BenchError(400, 'invalid', '링크가 올바르지 않아요. https:// 로 시작하는 주소를 붙여 넣어 주세요.');
  const note = typeof input.note === 'string' ? input.note.replace(/\s+/g, ' ').trim() : '';
  if (note.length > NOTE_MAX) throw new BenchError(400, 'note_too_long', `메모는 ${NOTE_MAX}자까지예요.`);
  const space = input.space === null || input.space === undefined || input.space === '' ? null
    : (BENCH_SPACES as readonly unknown[]).includes(input.space) ? (input.space as BenchSpace) : undefined;
  if (space === undefined) throw new BenchError(400, 'invalid', '공간 값이 올바르지 않아요.');

  const norm = normalizeUrl(rawUrl);
  const id = linkIdOf(rawUrl);
  const [mine, batches] = await Promise.all([listLinks({ withDeleted: true }), listBatches()]);
  if (batches.some((b) => b.items.some((it) => { try { return normalizeUrl(it.url) === norm; } catch { return false; } }))
    || mine.some((l) => !l.deletedAt && l.id === id)) {
    throw new BenchError(409, 'exists', '이미 있어요.');
  }
  if (mine.filter((l) => !l.deletedAt).length >= LINK_MAX) throw new BenchError(400, 'too_many', `올린 링크가 ${LINK_MAX}개를 넘었어요.`);

  let preview;
  try { preview = await fetchPreview(rawUrl); } catch (e) {
    if (e instanceof LinkBlockedError) throw new BenchError(400, 'blocked', '이 주소는 올릴 수 없어요.');
    throw e;
  }
  const host = new URL(rawUrl).hostname.replace(/^www\./, '');
  const link: BenchLink = {
    id, url: rawUrl, title: preview.title ?? host, image: preview.image, space, note,
    addedBy: actor.name, addedByEmail: actor.email, addedAt: new Date().toISOString(), status: 'pending',
    source: sourceOf(rawUrl), deletedAt: null,
  };
  await backend().put(LINKS_KEY, id, JSON.stringify(link));
  return { link, fetched: preview.fetched };
}

async function ownLink(id: unknown, actor: { email: string }): Promise<BenchLink> {
  const l = typeof id === 'string' && LINK_ID_RE.test(id) ? await getLink(id) : null;
  if (!l) throw new BenchError(404, 'not_found', '이 링크를 찾지 못했어요. 새로고침해 주세요.');
  if (l.addedByEmail !== actor.email) throw new BenchError(403, 'not_yours', '내가 올린 링크만 지울 수 있어요.');
  return l;
}
/** 올린 사람만. 흔적을 남겨 두고 화면에서만 감춘다(되돌릴 수 있음) */
export async function deleteLink(id: unknown, actor: { email: string }): Promise<void> {
  const l = await ownLink(id, actor);
  if (l.deletedAt) return;
  await backend().put(LINKS_KEY, l.id, JSON.stringify({ ...l, deletedAt: new Date().toISOString() }));
}
export async function restoreLink(id: unknown, actor: { email: string }): Promise<BenchLink> {
  const l = await ownLink(id, actor);
  const back = { ...l, deletedAt: null };
  await backend().put(LINKS_KEY, l.id, JSON.stringify(back));
  return back;
}

// CLI: 설명 채우기
export const linkFillSchema = z.array(z.object({
  id: z.string().regex(LINK_ID_RE, 'id 는 b_link_ 로 시작하는 올린 링크의 id 여야 합니다.'),
  fit: str(600).min(1, 'fit(101호에 맞는 이유)이 비었습니다.'),
  takeaways: z.array(str(300)).max(12).default([]).transform((a) => a.filter(Boolean)),
  cost: str(150).default(''),
  caution: z.union([str(400), z.null()]).optional().transform((v) => (v ? v : null)),
  space: z.enum(BENCH_SPACES).optional(),
  title: str(150).min(1).optional(),
  image: z.union([webUrl, z.null()]).optional(),
})).max(100, '한 번에 100건까지입니다.');
export type LinkFill = z.infer<typeof linkFillSchema>[number];
export function parseLinkFills(raw: unknown): LinkFill[] {
  const r = linkFillSchema.safeParse(raw);
  if (!r.success) {
    const lines = r.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(전체)'}: ${i.message}`);
    throw new BenchError(400, 'invalid', `채우기 형식이 틀렸습니다.\n  ${lines.join('\n  ')}`);
  }
  const seen = new Set<string>();
  for (const f of r.data) { if (seen.has(f.id)) throw new BenchError(400, 'invalid', `같은 id 가 두 번 있습니다: ${f.id}`); seen.add(f.id); }
  return r.data;
}
/** 올린 링크가 실제로 있는지 미리 본다(없거나 지워진 것은 건너뛴다) */
export async function planLinkFills(fills: LinkFill[]): Promise<{ ok: { fill: LinkFill; link: BenchLink }[]; skipped: { id: string; reason: string }[] }> {
  const ok: { fill: LinkFill; link: BenchLink }[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const fill of fills) {
    const link = await getLink(fill.id);
    if (!link) skipped.push({ id: fill.id, reason: '없는 링크' });
    else if (link.deletedAt) skipped.push({ id: fill.id, reason: '지워진 링크' });
    else ok.push({ fill, link });
  }
  return { ok, skipped };
}
export async function applyLinkFills(fills: LinkFill[]): Promise<{ filled: string[]; skipped: { id: string; reason: string }[] }> {
  const { ok, skipped } = await planLinkFills(fills);
  for (const { fill } of ok) {
    // 쓰기 직전에 다시 읽는다(그 사이 지워졌거나 바뀐 것 반영)
    const cur = await getLink(fill.id);
    if (!cur || cur.deletedAt) { skipped.push({ id: fill.id, reason: '지워진 링크' }); continue; }
    const next: BenchLink = {
      ...cur, status: 'done', fit: fill.fit, takeaways: fill.takeaways, cost: fill.cost, caution: fill.caution ?? null,
      ...(fill.space ? { space: fill.space } : {}), ...(fill.title ? { title: fill.title } : {}), ...(fill.image !== undefined ? { image: fill.image } : {}),
    };
    await backend().put(LINKS_KEY, cur.id, JSON.stringify(next));
  }
  return { filled: ok.map((o) => o.fill.id).filter((id) => !skipped.some((s) => s.id === id)), skipped };
}

// 화면에 보내는 링크(이메일은 빼고, 내가 올렸는지만)
export type LinkView = Omit<BenchLink, 'addedByEmail' | 'deletedAt'> & { mine: boolean };
export const toLinkView = (l: BenchLink, myEmail: string): LinkView => {
  const { addedByEmail, deletedAt, ...rest } = l;
  void deletedAt;
  return { ...rest, mine: addedByEmail === myEmail };
};
