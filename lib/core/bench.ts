import fs from 'node:fs/promises';
import path from 'node:path';
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import { redisEnv, sanitize } from './store.ts';

// 「꾸미기 참고」(인테리어 벤치마킹 모음) 저장소 — 서버 API 와 CLI scripts/bench.mjs 공용.
// 🔴 101호 평수 · 구조 같은 우리 집 이야기가 들어가므로 공개 저장소(content/)에 두지 않는다. 운영은 Upstash, 로컬 연습은 .data/bench/ (git 무시).
// 현황 문서(oedomin:progress:v1)와는 따로 둔다: 문서 version · 병합 규칙을 건드리지 않고, 큰 묶음이 현황 폴링 응답에 실리지 않게.
//
// Redis 배치
//   oedomin:bench:batches    해시. 필드 = 수집일(collectedAt, YYYY-MM-DD), 값 = 묶음 JSON(BenchBatch). 같은 날 다시 넣으면 --replace 로 교체
//   oedomin:bench:reactions  해시. 필드 = 「<항목 id>|<이메일>」, 값 = 반응 JSON(BenchReaction). 사람마다 따로 써서 두 사람이 동시에 남겨도 서로 덮지 않는다

export const BATCHES_KEY = 'oedomin:bench:batches';
export const REACTIONS_KEY = 'oedomin:bench:reactions';

export const BENCH_SOURCES = ['오늘의집', '에어비앤비', '블로그', '브런치', '유튜브', '인스타', '스레드', '기타'] as const;
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
const fileOf = (key: string) => path.join(DIR, key === BATCHES_KEY ? 'batches.json' : 'reactions.json');
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
  const known = (await listBatches()).some((b) => b.items.some((it) => it.id === itemId));
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
