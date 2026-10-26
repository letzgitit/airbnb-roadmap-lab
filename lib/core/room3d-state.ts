import fs from 'node:fs/promises';
import path from 'node:path';
import { Redis } from '@upstash/redis';
import { redisEnv, sanitize } from './store';

// 꾸미기 › 3D 시안에서 두 사람이 고른 상태(어느 시안 · 켠 항목 id · 문 열림)를 하나 저장한다.
// 항목 이름 · 값은 여기 없다(공개 저장소). 3D 시안 HTML(private/)이 id를 정하고, 여기서는 모양만 검사한다.
// 값(가격)은 private/room3d-prices.json 에만 있고, 로그인한 사람에게만 라우트가 실어 준다.
export const ROOM3D_STATE_KEY = 'oedomin:room3d:state';
const CONCEPTS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const DOORS = ['big', 'small', 'util', 'bath', 'ent'] as const;
const ID_RE = /^[a-z0-9-]{1,40}$/;
const MAX_ITEMS = 200;

export interface Room3dState {
  concept: (typeof CONCEPTS)[number];
  on: string[];
  doors: Partial<Record<(typeof DOORS)[number], boolean>>;
}
export interface Room3dSaved extends Room3dState { at: string; by: string }

/** 브라우저에서 온 값을 검사해 깨끗한 상태로. 모양이 틀리면 null */
export function parseRoom3dState(raw: unknown): Room3dState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.concept !== 'string' || !(CONCEPTS as readonly string[]).includes(v.concept)) return null;
  if (!Array.isArray(v.on) || v.on.length > MAX_ITEMS || !v.on.every((id) => typeof id === 'string' && ID_RE.test(id))) return null;
  const doors: Room3dState['doors'] = {};
  if (v.doors !== undefined) {
    if (!v.doors || typeof v.doors !== 'object' || Array.isArray(v.doors)) return null;
    for (const [k, b] of Object.entries(v.doors as Record<string, unknown>)) {
      if (!(DOORS as readonly string[]).includes(k) || typeof b !== 'boolean') return null;
      doors[k as (typeof DOORS)[number]] = b;
    }
  }
  return { concept: v.concept as Room3dState['concept'], on: [...new Set(v.on as string[])].sort(), doors };
}

const DATA_FILE = path.join(process.cwd(), '.data', 'room3d-state.json');

export async function readRoom3dState(): Promise<Room3dSaved | null> {
  const env = redisEnv();
  let text: string | null = null;
  if (env) {
    try {
      const redis = new Redis({ url: env.url, token: env.token, automaticDeserialization: false });
      const v = await redis.get<string>(ROOM3D_STATE_KEY);
      text = v === null || v === undefined ? null : String(v);
    } catch (e) { throw sanitize(e, '3D 시안 상태 읽기'); }
  } else {
    try { text = await fs.readFile(DATA_FILE, 'utf8'); } catch { text = null; }
  }
  if (!text) return null;
  try {
    const v = JSON.parse(text) as Room3dSaved;
    const s = parseRoom3dState(v);
    return s ? { ...s, at: String(v.at ?? ''), by: String(v.by ?? '') } : null;
  } catch { return null; }
}

export async function writeRoom3dState(state: Room3dState, by: string): Promise<Room3dSaved> {
  const saved: Room3dSaved = { ...state, at: new Date().toISOString(), by };
  const json = JSON.stringify(saved);
  const env = redisEnv();
  if (env) {
    try {
      const redis = new Redis({ url: env.url, token: env.token, automaticDeserialization: false });
      await redis.set(ROOM3D_STATE_KEY, json);
    } catch (e) { throw sanitize(e, '3D 시안 상태 쓰기'); }
  } else {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, json, 'utf8');
    await fs.rename(tmp, DATA_FILE);
  }
  return saved;
}

/** 항목별 1개 값 [싼 값, 비싼 값]. 파일이 없으면 빈 표 */
export async function readRoom3dPrices(): Promise<Record<string, [number, number]>> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(process.cwd(), 'private', 'room3d-prices.json'), 'utf8')) as Record<string, { price?: unknown }>;
    const out: Record<string, [number, number]> = {};
    for (const [id, v] of Object.entries(raw)) {
      const p = v?.price;
      if (ID_RE.test(id) && Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n))) out[id] = [p[0], p[1]];
    }
    return out;
  } catch {
    return {};
  }
}
