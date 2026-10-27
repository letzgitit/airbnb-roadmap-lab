import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { redisEnv, sanitize } from './store';

// 꾸미기 › 3D 시안에서 가구를 옮긴 배치를 이름 붙여 여러 개 저장한다. 로그인한 두 사람이 같이 본다.
// 고른 상태(oedomin:room3d:state)와 따로 둔다. 배치 하나 = { 이름, 저장한 사람, 시각, 가구별 [옮긴 x, 옮긴 z, 90° 돌린 횟수], 항목별 고른 모양(있으면) }.
// 가구 id · 옮긴 거리는 3D 시안 HTML(private/)이 정하고, 여기서는 모양 · 상한만 검사한다(공개 저장소라 집 치수는 코드에 없다).
// 벽에 거는 것(선반 · 액자 · 벽등 …)도 같은 꼴로 적는다 — 시안마다 따로인 id(w-시안-이름), 돌린 횟수 = 바라보는 벽 방향. 그래서 묶음 수 상한이 바닥 가구보다 넉넉하다.
// Redis 해시 한 개(필드 = 배치 id)라 두 사람이 동시에 다른 배치를 고쳐도 서로 덮어쓰지 않는다.
export const ROOM3D_LAYOUTS_KEY = 'oedomin:room3d:layouts';
export const MAX_LAYOUTS = 20;
export const MAX_NAME = 30;
const MAX_UNITS = 80;
const MAX_SHIFT = 2000;          // cm. 집보다 넉넉히 — 이보다 크면 잘못 온 값
const UNIT_RE = /^[a-z0-9-]{1,40}$/;
const LAYOUT_ID_RE = /^l-[0-9a-f]{8}$/;

export type Room3dMove = [number, number, number];          // [옮긴 x, 옮긴 z, 90° 돌린 횟수 0~3]
// variants = 항목별로 고른 모양(예: 창 가리개 모양). 없으면(옛 배치) 3D 시안이 처음 모양으로 연다
export interface Room3dLayout { units: Record<string, Room3dMove>; variants?: Record<string, string> }

const MAX_VARIANTS = 40;
const VARIANT_RE = /^[a-z0-9-]{1,20}$/;
/** 고른 모양 지도: { 항목 id: 모양 이름 } — 짧은 영문 소문자 · 숫자 · - 만, 40개까지. 없으면 undefined, 틀리면 null */
export function parseVariants(raw: unknown): Record<string, string> | null | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_VARIANTS) return null;
  const out: Record<string, string> = {};
  for (const [id, v] of entries) {
    if (!UNIT_RE.test(id) || typeof v !== 'string' || !VARIANT_RE.test(v)) return null;
    out[id] = v;
  }
  return out;
}
export interface Room3dLayoutItem { id: string; name: string; by: string; at: string; layout: Room3dLayout }

export class LayoutError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

/** 이름: 앞뒤 공백을 지우고 공백을 하나로. 1~30자(글자 수), 제어 문자 · 꺾쇠 없이. 틀리면 null */
export function parseLayoutName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  const n = [...name].length;
  if (n < 1 || n > MAX_NAME) return null;
  if (/[\u0000-\u001f\u007f<>]/.test(name)) return null;
  return name;
}

/** 배치 모양 검사. 옮기지 않은 가구([0,0,0])는 뺀다. 틀리면 null */
export function parseLayout(raw: unknown): Room3dLayout | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const u = (raw as Record<string, unknown>).units;
  if (!u || typeof u !== 'object' || Array.isArray(u)) return null;
  const entries = Object.entries(u as Record<string, unknown>);
  if (entries.length > MAX_UNITS) return null;
  const units: Record<string, Room3dMove> = {};
  for (const [id, v] of entries) {
    if (!UNIT_RE.test(id) || !Array.isArray(v) || v.length !== 3) return null;
    const [dx, dz, r] = v as unknown[];
    if (typeof dx !== 'number' || typeof dz !== 'number' || typeof r !== 'number') return null;
    if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.abs(dx) > MAX_SHIFT || Math.abs(dz) > MAX_SHIFT) return null;
    if (!Number.isInteger(r) || r < 0 || r > 3) return null;
    const m: Room3dMove = [Math.round(dx), Math.round(dz), r];
    if (m[0] || m[1] || m[2]) units[id] = m;
  }
  const variants = parseVariants((raw as Record<string, unknown>).variants);
  if (variants === null) return null;
  return variants ? { units, variants } : { units };
}

export const isLayoutId = (v: unknown): v is string => typeof v === 'string' && LAYOUT_ID_RE.test(v);

function parseItem(id: string, text: string): Room3dLayoutItem | null {
  try {
    const v = JSON.parse(text) as Record<string, unknown>;
    const name = parseLayoutName(v.name), layout = parseLayout(v.layout);
    if (!isLayoutId(id) || !name || !layout) return null;
    return { id, name, by: String(v.by ?? '').slice(0, 40), at: String(v.at ?? '').slice(0, 40), layout };
  } catch { return null; }
}
const toJson = (it: Room3dLayoutItem) => JSON.stringify({ name: it.name, by: it.by, at: it.at, layout: it.layout });

// ── 저장소: Redis 해시, 없으면(로컬 개발) .data 파일 ──
interface Backend {
  all(): Promise<Record<string, string>>;
  put(id: string, json: string): Promise<void>;
  drop(id: string): Promise<void>;
}
function redisBackend(url: string, token: string): Backend {
  const redis = new Redis({ url, token, automaticDeserialization: false });
  const wrap = async <T>(what: string, fn: () => Promise<T>) => { try { return await fn(); } catch (e) { throw sanitize(e, what); } };
  return {
    // automaticDeserialization: false 면 hgetall 이 [필드, 값, 필드, 값 …] 평평한 배열로 온다(lib/core/bench.ts 와 같음)
    all: () => wrap('3D 배치 읽기', async () => {
      const raw = (await redis.hgetall(ROOM3D_LAYOUTS_KEY)) as unknown;
      if (Array.isArray(raw)) {
        const m: Record<string, string> = {};
        for (let i = 0; i + 1 < raw.length; i += 2) m[String(raw[i])] = String(raw[i + 1]);
        return m;
      }
      const m: Record<string, string> = {};
      for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) m[k] = typeof v === 'string' ? v : JSON.stringify(v);
      return m;
    }),
    put: (id, json) => wrap('3D 배치 쓰기', async () => { await redis.hset(ROOM3D_LAYOUTS_KEY, { [id]: json }); }),
    drop: (id) => wrap('3D 배치 지우기', async () => { await redis.hdel(ROOM3D_LAYOUTS_KEY, id); }),
  };
}
const DATA_FILE = path.join(process.cwd(), '.data', 'room3d-layouts.json');
let fileLock: Promise<unknown> = Promise.resolve();
function fileBackend(): Backend {
  const readMap = async (): Promise<Record<string, string>> => {
    try { return JSON.parse(await fs.readFile(DATA_FILE, 'utf8')) as Record<string, string>; } catch { return {}; }
  };
  // 단일 프로세스 개발용: 프로세스 안에서 줄 세움 → 임시 파일 → 교체
  const edit = (fn: (m: Record<string, string>) => void) => {
    const run = async () => {
      const m = await readMap();
      fn(m);
      await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
      const tmp = `${DATA_FILE}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(m), 'utf8');
      await fs.rename(tmp, DATA_FILE);
    };
    const p = fileLock.then(run, run);
    fileLock = p.catch(() => undefined);
    return p;
  };
  return {
    all: readMap,
    put: (id, json) => edit((m) => { m[id] = json; }),
    drop: (id) => edit((m) => { delete m[id]; }),
  };
}
function backend(): Backend {
  const env = redisEnv();
  return env ? redisBackend(env.url, env.token) : fileBackend();
}

/** 저장한 배치 전부, 최근 저장한 것부터 */
export async function listLayouts(): Promise<Room3dLayoutItem[]> {
  const m = await backend().all();
  const out: Room3dLayoutItem[] = [];
  for (const [id, text] of Object.entries(m)) { const it = parseItem(id, text); if (it) out.push(it); }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.name.localeCompare(b.name, 'ko')));
}

const sameName = (a: string, b: string) => a.toLocaleLowerCase('ko') === b.toLocaleLowerCase('ko');

export async function createLayout(name: string, layout: Room3dLayout, by: string): Promise<Room3dLayoutItem> {
  const all = await listLayouts();
  if (all.length >= MAX_LAYOUTS) throw new LayoutError(409, 'too_many');
  if (all.some((it) => sameName(it.name, name))) throw new LayoutError(409, 'duplicate_name');
  const item: Room3dLayoutItem = { id: `l-${randomBytes(4).toString('hex')}`, name, by, at: new Date().toISOString(), layout };
  await backend().put(item.id, toJson(item));
  return item;
}

/** 덮어쓰기(layout) · 이름 바꾸기(name). 덮어쓰면 저장한 사람 · 시각도 바뀐다 */
export async function updateLayout(id: string, patch: { name?: string; layout?: Room3dLayout }, by: string): Promise<Room3dLayoutItem> {
  const all = await listLayouts();
  const cur = all.find((it) => it.id === id);
  if (!cur) throw new LayoutError(404, 'not_found');
  if (patch.name && all.some((it) => it.id !== id && sameName(it.name, patch.name!))) throw new LayoutError(409, 'duplicate_name');
  const next: Room3dLayoutItem = { ...cur, ...(patch.name ? { name: patch.name } : {}) };
  if (patch.layout) Object.assign(next, { layout: patch.layout, by, at: new Date().toISOString() });
  await backend().put(id, toJson(next));
  return next;
}

export async function deleteLayout(id: string): Promise<void> {
  const all = await listLayouts();
  if (!all.some((it) => it.id === id)) throw new LayoutError(404, 'not_found');
  await backend().drop(id);
}
