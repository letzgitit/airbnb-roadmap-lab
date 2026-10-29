// 할 일 설명서 저장소(2026-10-28). 현황 문서(progress)에 넣으면 문서가 400KB 상한을 넘고 화면을 열 때마다 통째로 받아야 해서 따로 둔다.
//   운영 = Upstash 해시 `oedomin:guides`(필드 = 할 일 id, 값 = JSON { md, version, updatedAt, updatedBy }), 로컬 연습 = .data/guides.json.
//   저장소 갈래는 현황 · 사진 · 꾸미기 참고와 같은 규칙(redisEnv 가 있으면 운영).
// 쓰기 규칙: version 이 다르면 409(현황 문서와 같은 충돌 규칙), 빈 글이면 지움, 6000자 제한.
// 할 일을 지워도 설명서는 그대로 둔다(되살리기 대비). 목록(guideIndex)에서만 지운 할 일을 뺀다.
// API(app/api/guides) · CLI(scripts/guides.mjs)가 함께 쓴다. Node 에서 바로 읽히도록 지우기만 하면 되는 TS 문법만 쓴다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Redis } from '@upstash/redis';
import { redisEnv, sanitize } from './store.ts';
import type { ProgressDoc } from './types.ts';
import { stripMarkdown } from '../client/search-text.ts';

export const GUIDES_KEY = 'oedomin:guides';
export const GUIDE_MAX = 6000;
const ID_RE = /^t_[A-Za-z0-9]{1,60}$/;

export interface GuideRecord { md: string; version: number; updatedAt: string; updatedBy: string }
export interface GuideActor { name: string }

export class GuideError extends Error {
  status: number;
  code: string;
  current: GuideRecord | null;
  constructor(status: number, code: string, message: string, current: GuideRecord | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.current = current;
  }
}

// ── 저장소 ──
interface Backend {
  kind: 'redis' | 'file';
  label: string;
  all(): Promise<Record<string, string>>;
  get(id: string): Promise<string | null>;
  /** 읽었던 값(expected, 없으면 null)이 그대로일 때만 next 로 바꾼다(next = null 이면 지움). 바꿨으면 true */
  cas(id: string, expected: string | null, next: string | null): Promise<boolean>;
}

// 해시 필드 하나의 compare-and-set. ARGV[1]=필드, ARGV[2]=읽었던 값('' = 없음), ARGV[3]=새 값('' = 지움)
const HCAS_LUA = `
local cur = redis.call('HGET', KEYS[1], ARGV[1])
if (cur == false and ARGV[2] == '') or (cur ~= false and cur == ARGV[2]) then
  if ARGV[3] == '' then redis.call('HDEL', KEYS[1], ARGV[1]) else redis.call('HSET', KEYS[1], ARGV[1], ARGV[3]) end
  return 1
end
return 0`;

function redisBackend(url: string, token: string): Backend {
  const redis = new Redis({ url, token, automaticDeserialization: false });
  // 오류 메시지에 요청 본문(설명서 글)이 실리지 않게 잘라서 다시 던진다
  const wrap = async <T>(what: string, fn: () => Promise<T>) => { try { return await fn(); } catch (e) { throw sanitize(e, what); } };
  return {
    kind: 'redis',
    label: `redis ${new URL(url).host}`,
    all: () => wrap('설명서 읽기', async () => {
      const raw = (await redis.hgetall(GUIDES_KEY)) as unknown;
      if (Array.isArray(raw)) {
        const m: Record<string, string> = {};
        for (let i = 0; i + 1 < raw.length; i += 2) m[String(raw[i])] = String(raw[i + 1]);
        return m;
      }
      return (raw ?? {}) as Record<string, string>;
    }),
    get: (id) => wrap('설명서 읽기', async () => {
      const v = await redis.hget<string>(GUIDES_KEY, id);
      return v === null || v === undefined ? null : String(v);
    }),
    cas: (id, expected, next) => wrap('설명서 쓰기', async () => Number(await redis.eval(HCAS_LUA, [GUIDES_KEY], [id, expected ?? '', next ?? ''])) === 1),
  };
}

let fileLock: Promise<unknown> = Promise.resolve();
function fileBackend(): Backend {
  // 불러올 때의 작업 폴더 기준(현황 · 꾸미기 참고와 같다 — 시험은 임시 폴더로 옮겨 놓고 쓴다)
  const file = () => path.join(process.cwd(), '.data', 'guides.json');
  const readMap = async (): Promise<Record<string, string>> => {
    try { return JSON.parse(await fs.readFile(file(), 'utf8')) as Record<string, string>; } catch { return {}; }
  };
  return {
    kind: 'file',
    label: 'file .data/guides.json',
    all: readMap,
    get: async (id) => { const m = await readMap(); return Object.hasOwn(m, id) ? m[id] : null; },
    cas(id, expected, next) {
      // 단일 프로세스 개발용: 프로세스 안에서 직렬화 → 값 비교 → 임시 파일 → 교체
      const run = async () => {
        const m = await readMap();
        const cur = Object.hasOwn(m, id) ? m[id] : null;
        if (cur !== expected) return false;
        if (next === null) delete m[id]; else m[id] = next;
        await fs.mkdir(path.dirname(file()), { recursive: true });
        const tmp = `${file()}.${process.pid}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(m), 'utf8');
        await fs.rename(tmp, file());
        return true;
      };
      const p = fileLock.then(run, run);
      fileLock = p.catch(() => undefined);
      return p;
    },
  };
}

let cached: Backend | null = null;
function backend(): Backend {
  if (cached) return cached;
  const env = redisEnv();
  cached = env ? redisBackend(env.url, env.token) : fileBackend();
  return cached;
}
export function guideStoreInfo() { const b = backend(); return { kind: b.kind, label: b.label }; }

function parse(raw: string | null): GuideRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<GuideRecord>;
    if (typeof v?.md !== 'string' || typeof v.version !== 'number') return null;
    return { md: v.md, version: v.version, updatedAt: String(v.updatedAt ?? ''), updatedBy: String(v.updatedBy ?? '') };
  } catch { return null; }
}

function checkId(id: unknown): string {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new GuideError(400, 'invalid', '할 일 id 형식이 올바르지 않습니다.');
  return id;
}
/** 앞뒤 공백만 지운 본문(줄바꿈은 그대로). 6000자를 넘으면 400 */
export function cleanMd(md: unknown): string {
  if (typeof md !== 'string') throw new GuideError(400, 'invalid', '도움말은 글이어야 해요.');
  const s = md.replace(/\r\n?/g, '\n').trim();
  if (s.length > GUIDE_MAX) throw new GuideError(400, 'too_long', `도움말은 ${GUIDE_MAX}자까지 적을 수 있어요.`);
  return s;
}

// ── 읽기 ──
export async function getGuide(id: string): Promise<GuideRecord | null> {
  return parse(await backend().get(checkId(id)));
}
export async function listGuides(): Promise<Record<string, GuideRecord>> {
  const out: Record<string, GuideRecord> = {};
  for (const [id, raw] of Object.entries(await backend().all())) { const g = parse(raw); if (g) out[id] = g; }
  return out;
}
/** 화면용 목록: 지우지 않은 할 일에 달린 설명서만 { len, version } — 본문은 싣지 않는다 */
export function guideIndex(guides: Record<string, GuideRecord>, doc: Pick<ProgressDoc, 'tasks'>): Record<string, { len: number; version: number }> {
  const out: Record<string, { len: number; version: number }> = {};
  for (const [id, g] of Object.entries(guides)) {
    const t = Object.hasOwn(doc.tasks, id) ? doc.tasks[id] : undefined;
    if (t && !t.deletedAt && g.md) out[id] = { len: g.md.length, version: g.version };
  }
  return out;
}

/**
 * 검색용 본문(GET /api/guides?body=1): 지우지 않은 할 일에 달린 설명서만 { text, version } — text 는 마크다운 기호 · 링크 주소를 뺀 글(검색 창이 찾고 조각으로 보인다).
 * 화면은 검색 단추에 손이 닿을 때 한 번 받는다(components/search/guide-bodies.ts).
 */
export function guideBodies(guides: Record<string, GuideRecord>, doc: Pick<ProgressDoc, 'tasks'>): Record<string, { text: string; version: number }> {
  const out: Record<string, { text: string; version: number }> = {};
  for (const [id, g] of Object.entries(guides)) {
    const t = Object.hasOwn(doc.tasks, id) ? doc.tasks[id] : undefined;
    if (t && !t.deletedAt && g.md) out[id] = { text: stripMarkdown(g.md), version: g.version };
  }
  return out;
}

// ── 쓰기 ──
/**
 * 설명서 저장. baseVersion = 읽었을 때의 version(설명서가 없었으면 0). 다르면 409(current = 지금 값).
 * 빈 글이면 지운다(없던 것을 지우면 아무 일 없음). force 면 version 을 보지 않는다(CLI import · set).
 * 돌려주는 값: 저장한 설명서, 지웠거나 없으면 null.
 */
export async function putGuide(id: string, md: unknown, baseVersion: unknown, actor: GuideActor, opts: { force?: boolean } = {}): Promise<GuideRecord | null> {
  checkId(id);
  const body = cleanMd(md);
  if (!opts.force && (typeof baseVersion !== 'number' || !Number.isInteger(baseVersion) || baseVersion < 0)) {
    throw new GuideError(400, 'baseVersion_required', 'baseVersion(읽었을 때의 version, 없던 설명서면 0)이 필요합니다.');
  }
  const b = backend();
  for (let attempt = 0; attempt < 5; attempt++) {
    const raw = await b.get(id);
    const cur = parse(raw);
    const curVersion = cur?.version ?? 0;
    if (!opts.force && curVersion !== baseVersion) {
      throw new GuideError(409, 'conflict', '그 사이 다른 사람이 도움말을 고쳤어요. 새로 불러와 다시 고쳐 주세요.', cur);
    }
    if (!body) {
      if (!raw) return null;
      if (await b.cas(id, raw, null)) return null;
      continue;
    }
    if (cur && cur.md === body) return cur; // 같은 글이면 version 을 올리지 않는다
    const next: GuideRecord = { md: body, version: curVersion + 1, updatedAt: new Date().toISOString(), updatedBy: actor.name };
    if (await b.cas(id, raw, JSON.stringify(next))) return next;
  }
  throw new GuideError(503, 'busy', '잠시 후 다시 시도하세요.');
}

export interface ImportReport { created: string[]; updated: string[]; deleted: string[]; unchanged: string[]; missingTask: string[] }
/**
 * 여러 개를 한 번에: { "<taskId>": "<md>", … }. 전부 먼저 검사하고(하나라도 틀리면 아무것도 쓰지 않음) 덮어쓴다(force).
 * doc 을 주면 현황 문서에 없는 할 일 id 를 missingTask 로 알려 준다(그래도 쓴다 — 할 일을 나중에 만들 수도 있으므로 막지는 않음).
 */
export async function importGuides(map: unknown, actor: GuideActor, opts: { dryRun?: boolean; doc?: Pick<ProgressDoc, 'tasks'> } = {}): Promise<ImportReport> {
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new GuideError(400, 'invalid', '{ "<할 일 id>": "<설명서 마크다운>", … } 모양이어야 합니다.');
  const items = Object.entries(map as Record<string, unknown>).map(([id, md]) => ({ id: checkId(id), md: cleanMd(md) }));
  const rep: ImportReport = { created: [], updated: [], deleted: [], unchanged: [], missingTask: [] };
  const now = await listGuides();
  for (const { id, md } of items) {
    if (opts.doc && !Object.hasOwn(opts.doc.tasks, id)) rep.missingTask.push(id);
    const cur = now[id];
    const kind = !md ? (cur ? 'deleted' : 'unchanged') : !cur ? 'created' : cur.md === md ? 'unchanged' : 'updated';
    rep[kind].push(id);
    if (!opts.dryRun && kind !== 'unchanged') await putGuide(id, md, undefined, actor, { force: true });
  }
  return rep;
}
