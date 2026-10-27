// 블록 메모 저장소(2026-10-28 — 기획 27의 3 · 7절). 새 홈 일터 탭(행정 · 설비 · 운영)의 단계 블록마다 짧은 메모를 한 줄씩 단다.
//   현황 문서(progress)에 넣지 않는다(할 일 문서 구조는 바꾸지 않는다 — 설명서 · 사진과 같은 까닭).
//   운영 = Upstash 해시 `oedomin:cardnotes`(필드 = 블록 id, 값 = 메모 배열 JSON [{ id, text, at, by }]), 로컬 연습 = .data/cardnotes.json.
//   저장소 갈래는 현황 · 사진 · 설명서와 같은 규칙(redisEnv 가 있으면 운영).
// 블록 id = 「<분야>.<블록>」(예: admin.move-in · facility.bath · ops.other) — 코드(components/simple-home/home-model.ts blockId)에 고정된 문자열.
//   블록 이름 「그 밖에」(other)가 설비 · 운영 두 곳에 있어 분야를 앞에 붙인다.
// 메모는 더하기 · 지우기만(고치기 없음). 지운 메모는 화면의 「되돌리기」(8초)가 같은 메모를 다시 넣는다(restore).
// API(app/api/cardnotes) · CLI(scripts/cardnotes.mjs)가 함께 쓴다. Node 에서 바로 읽히도록 지우기만 하면 되는 TS 문법만 쓴다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { redisEnv, sanitize } from './store.ts';

export const CARDNOTES_KEY = 'oedomin:cardnotes';
export const NOTE_MAX = 500;
/** 블록 하나에 둘 수 있는 메모 수(넘으면 오래된 것을 지우라고 알린다) */
export const NOTES_PER_CARD = 200;
/** 블록 id 꼴: 분야(admin · facility · ops) + 「.」 + 블록 이름(영문 소문자 · 숫자 · -) */
export const CARD_ID_RE = /^(admin|facility|ops)\.[a-z0-9-]{1,40}$/;
const NOTE_ID_RE = /^n_[0-9a-f]{10}$/;

export interface CardNote { id: string; text: string; at: string; by: string }
export interface NoteActor { name: string }

export class CardNoteError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
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

// 해시 필드 하나의 compare-and-set(설명서 저장소와 같은 꼴). ARGV[1]=필드, ARGV[2]=읽었던 값('' = 없음), ARGV[3]=새 값('' = 지움)
const HCAS_LUA = `
local cur = redis.call('HGET', KEYS[1], ARGV[1])
if (cur == false and ARGV[2] == '') or (cur ~= false and cur == ARGV[2]) then
  if ARGV[3] == '' then redis.call('HDEL', KEYS[1], ARGV[1]) else redis.call('HSET', KEYS[1], ARGV[1], ARGV[3]) end
  return 1
end
return 0`;

function redisBackend(url: string, token: string): Backend {
  const redis = new Redis({ url, token, automaticDeserialization: false });
  // 오류 메시지에 요청 본문(메모 글)이 실리지 않게 잘라서 다시 던진다
  const wrap = async <T>(what: string, fn: () => Promise<T>) => { try { return await fn(); } catch (e) { throw sanitize(e, what); } };
  return {
    kind: 'redis',
    label: `redis ${new URL(url).host}`,
    all: () => wrap('블록 메모 읽기', async () => {
      const raw = (await redis.hgetall(CARDNOTES_KEY)) as unknown;
      if (Array.isArray(raw)) {
        const m: Record<string, string> = {};
        for (let i = 0; i + 1 < raw.length; i += 2) m[String(raw[i])] = String(raw[i + 1]);
        return m;
      }
      return (raw ?? {}) as Record<string, string>;
    }),
    get: (id) => wrap('블록 메모 읽기', async () => {
      const v = await redis.hget<string>(CARDNOTES_KEY, id);
      return v === null || v === undefined ? null : String(v);
    }),
    cas: (id, expected, next) => wrap('블록 메모 쓰기', async () => Number(await redis.eval(HCAS_LUA, [CARDNOTES_KEY], [id, expected ?? '', next ?? ''])) === 1),
  };
}

let fileLock: Promise<unknown> = Promise.resolve();
function fileBackend(): Backend {
  // 불러올 때의 작업 폴더 기준(시험은 임시 폴더로 옮겨 놓고 쓴다)
  const file = () => path.join(process.cwd(), '.data', 'cardnotes.json');
  const readMap = async (): Promise<Record<string, string>> => {
    try { return JSON.parse(await fs.readFile(file(), 'utf8')) as Record<string, string>; } catch { return {}; }
  };
  return {
    kind: 'file',
    label: 'file .data/cardnotes.json',
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
export function cardNoteStoreInfo() { const b = backend(); return { kind: b.kind, label: b.label }; }

function validNote(v: unknown): v is CardNote {
  const n = v as Partial<CardNote> | null;
  return !!n && typeof n.id === 'string' && typeof n.text === 'string' && typeof n.at === 'string' && typeof n.by === 'string';
}
function parse(raw: string | null): CardNote[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter(validNote) : [];
  } catch { return []; }
}
// 적은 순(오래된 것 먼저), 같으면 id 순 — 되돌리기로 다시 넣어도 원래 자리로 돌아간다
const byAt = (a: CardNote, b: CardNote) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id);

export function checkCardId(id: unknown): string {
  if (typeof id !== 'string' || !CARD_ID_RE.test(id)) throw new CardNoteError(400, 'invalid', '블록을 찾지 못했어요.');
  return id;
}
function checkNoteId(id: unknown): string {
  if (typeof id !== 'string' || !NOTE_ID_RE.test(id)) throw new CardNoteError(400, 'invalid', '메모를 찾지 못했어요.');
  return id;
}
/** 메모 글: 줄바꿈 · 겹친 띄어쓰기를 띄어쓰기 하나로(메모는 한 줄씩), 앞뒤 공백 지움. 비었거나 500자를 넘으면 400 */
export function cleanText(text: unknown): string {
  if (typeof text !== 'string') throw new CardNoteError(400, 'invalid', '메모는 글이어야 해요.');
  const s = text.replace(/\s+/g, ' ').trim();
  if (!s) throw new CardNoteError(400, 'empty', '메모를 적어 주세요.');
  if (s.length > NOTE_MAX) throw new CardNoteError(400, 'too_long', `메모는 ${NOTE_MAX}자까지 적을 수 있어요.`);
  return s;
}
const newId = () => `n_${randomUUID().replace(/-/g, '').slice(0, 10)}`;

// ── 읽기 ──
/** 메모가 있는 블록 전부: { [블록 id]: 메모[](적은 순) }. 빈 블록 · 꼴이 틀린 필드는 뺀다 */
export async function listCardNotes(): Promise<Record<string, CardNote[]>> {
  const out: Record<string, CardNote[]> = {};
  for (const [id, raw] of Object.entries(await backend().all())) {
    if (!CARD_ID_RE.test(id)) continue;
    const list = parse(raw).sort(byAt);
    if (list.length) out[id] = list;
  }
  return out;
}
export async function getCardNotes(cardId: string): Promise<CardNote[]> {
  return parse(await backend().get(checkCardId(cardId))).sort(byAt);
}

// ── 쓰기(블록 하나를 읽고 → 바꾸고 → 그대로일 때만 씀. 두 사람이 동시에 써도 서로 덮지 않는다) ──
async function edit<T>(cardId: string, fn: (list: CardNote[]) => { next: CardNote[]; out: T }): Promise<T> {
  const b = backend();
  for (let attempt = 0; attempt < 12; attempt++) {
    const raw = await b.get(cardId);
    const { next, out } = fn(parse(raw).sort(byAt));
    const json = next.length ? JSON.stringify(next) : null;
    if (json === raw || (json === null && raw === null)) return out;
    if (await b.cas(cardId, raw, json)) return out;
  }
  throw new CardNoteError(503, 'busy', '잠시 후 다시 해 주세요.');
}

/** 메모 더하기. 돌려주는 값 = 새 메모 */
export async function addCardNote(cardId: unknown, text: unknown, actor: NoteActor): Promise<CardNote> {
  const id = checkCardId(cardId);
  const body = cleanText(text);
  const note: CardNote = { id: newId(), text: body, at: new Date().toISOString(), by: String(actor.name ?? '').slice(0, 40) };
  return edit(id, (list) => {
    if (list.length >= NOTES_PER_CARD) throw new CardNoteError(400, 'too_many', `한 블록에 메모는 ${NOTES_PER_CARD}개까지예요. 지난 메모를 지워 주세요.`);
    return { next: [...list, note], out: note };
  });
}

/** 메모 지우기. 돌려주는 값 = 지운 메모(되돌리기에 쓴다). 이미 없으면 404 */
export async function removeCardNote(cardId: unknown, noteId: unknown): Promise<CardNote> {
  const id = checkCardId(cardId);
  const nid = checkNoteId(noteId);
  return edit(id, (list) => {
    const hit = list.find((n) => n.id === nid);
    if (!hit) throw new CardNoteError(404, 'not_found', '이미 지운 메모예요.');
    return { next: list.filter((n) => n.id !== nid), out: hit };
  });
}

/**
 * 지운 메모 되돌리기: 지울 때 받은 메모 그대로 다시 넣는다(id · 적은 시각 · 쓴 사람 유지 — 원래 자리로).
 * 같은 id 가 이미 있으면 아무 일 없이 그 메모를 돌려준다(되돌리기를 두 번 눌러도 하나).
 */
export async function restoreCardNote(cardId: unknown, note: unknown): Promise<CardNote> {
  const id = checkCardId(cardId);
  const n = note as Partial<CardNote> | null;
  const nid = checkNoteId(n?.id);
  const at = typeof n?.at === 'string' && !Number.isNaN(Date.parse(n.at)) ? new Date(n.at).toISOString() : null;
  if (!at) throw new CardNoteError(400, 'invalid', '되돌릴 메모가 올바르지 않아요.');
  const back: CardNote = { id: nid, text: cleanText(n?.text), at, by: typeof n?.by === 'string' ? n.by.slice(0, 40) : '' };
  return edit(id, (list) => {
    const have = list.find((x) => x.id === nid);
    if (have) return { next: list, out: have };
    if (list.length >= NOTES_PER_CARD) throw new CardNoteError(400, 'too_many', `한 블록에 메모는 ${NOTES_PER_CARD}개까지예요.`);
    return { next: [...list, back].sort(byAt), out: back };
  });
}
