import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import sharp, { type Metadata } from 'sharp';
import { redisEnv, sanitize } from './store.ts';
import { STEP_COUNT } from './types.ts';

// 사진 · PDF 저장소(서버 API 와 CLI scripts/photos.mjs 공용).
// 🔴 사진과 설명(주소 · 이름 · 계약서 등)은 공개 저장소에 두지 않는다. 운영은 Upstash, 로컬 연습은 .data/photos/ (git 무시).
//
// Redis 배치
//   oedomin:photos:meta            해시. 필드 = 사진 id, 값 = PhotoMeta JSON (사진 하나씩 따로 써서 동시에 올려도 서로 덮지 않는다)
//   oedomin:photo:<id>:<part>:<i>  base64 조각. part = full(큰 사진) | thumb(목록용) | file(PDF 원본)
// 값 하나는 PART_CHUNK(약 700KB) 아래로 자른다(Upstash 한 요청 크기 제한 1MB 안쪽).

export const META_KEY = 'oedomin:photos:meta';
const partKey = (id: string, part: Part, i: number) => `oedomin:photo:${id}:${part}:${i}`;
const PART_CHUNK = 700_000;

export type Part = 'full' | 'thumb' | 'file';
export const PARTS: Part[] = ['full', 'thumb', 'file'];
export type PhotoKind = 'image' | 'pdf';

export interface PhotoMeta {
  id: string;
  /** 타임라인 단계(1~14). 사진 탭 · 단계 창이 이 단계로 묶어 보여 준다 */
  stepId: number;
  /** 작은 묶음 이름(선택). 예: 「집 사진」 */
  album: string;
  caption: string;
  kind: PhotoKind;
  /** 큰 사진(PDF 는 첫 쪽 미리보기)의 크기. 미리보기 없는 PDF 는 0 */
  width: number; height: number;
  /** 저장한 조각: part → 조각 수. 없는 part 는 빠진다(미리보기 없는 PDF 엔 full · thumb 가 없다) */
  parts: Partial<Record<Part, number>>;
  /** 저장한 바이트 수(표시 · 점검용) */
  bytes: Partial<Record<Part, number>>;
  /** 앨범 안 순서(올린 순서). 클수록 나중 */
  order: number;
  /** 찍은 시각(한국 시각 「YYYY-MM-DDTHH:mm:ss」). EXIF 찍은 시각 → 없으면 파일 수정 시각(CLI) · 올린 시각(사이트) */
  takenAt: string;
  /** 구글 드라이브 원본 주소(CLI 가 올릴 때만). 드라이브 권한이 있어야 열린다. 저장소 코드에는 두지 않는다. */
  originalUrl?: string | null;
  uploadedAt: string; by: string;
  version: number; updatedAt: string; updatedBy: string;
  deletedAt: string | null; deletedBy: string | null;
}

// 화면에 보이는 오류(사람이 읽는 한국어 문장)
export class PhotoError extends Error {
  status: number; code: string;
  // CLI 는 타입만 지우고 돌리므로(Node strip-types) 생성자 매개변수 속성 문법을 쓰지 않는다
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export const LIMITS = {
  albumMax: 40,
  captionMax: 100,
  /** 서버가 받는 원본 크기 상한. Vercel 함수는 본문 4.5MB 까지만 받으므로 화면에서 큰 사진은 미리 줄여 보낸다. */
  inputMax: 15 * 1024 * 1024,
  /** PDF 원본 상한(조각으로 나눠 저장) */
  pdfMax: 4 * 1024 * 1024,
};
// 사진: 1600px · 500KB 안쪽. 글씨 많은 문서(계약서 · 등기부 · PDF 미리보기): 2400px · 900KB 안쪽(작은 글씨가 읽히게)
const PHOTO_MODE = { edge: 1600, target: 500 * 1024, ladder: [[1600, 70], [1280, 70], [1024, 65]] as [number, number][] };
const DOC_MODE = { edge: 2400, target: 900 * 1024, ladder: [[2400, 70], [2000, 70], [1600, 70]] as [number, number][] };
const THUMB_EDGE = 400;
const TRASH_KEEP_MS = 30 * 24 * 3600 * 1000;   // 현황과 같이 30일 보관 뒤 정리

// ── 저장소 ──
interface Backend {
  kind: 'redis' | 'file';
  label: string;
  all(): Promise<Record<string, string>>;
  get(id: string): Promise<string | null>;
  put(id: string, json: string): Promise<void>;
  drop(id: string): Promise<void>;
  putChunks(id: string, part: Part, chunks: string[]): Promise<void>;
  getChunks(id: string, part: Part, n: number): Promise<(string | null)[]>;
  dropChunks(id: string, part: Part, n: number): Promise<void>;
}

function redisBackend(url: string, token: string): Backend {
  const redis = new Redis({ url, token, automaticDeserialization: false });
  // 오류 메시지에 요청 본문(사진 바이트 · 설명)이 실리지 않게 잘라서 다시 던진다
  const wrap = async <T>(what: string, fn: () => Promise<T>) => { try { return await fn(); } catch (e) { throw sanitize(e, what); } };
  return {
    kind: 'redis',
    label: `redis ${new URL(url).host}`,
    all: () => wrap('사진 목록 읽기', async () => ((await redis.hgetall<Record<string, string>>(META_KEY)) ?? {}) as Record<string, string>),
    get: (id) => wrap('사진 읽기', async () => {
      const v = await redis.hget<string>(META_KEY, id);
      return v === null || v === undefined ? null : String(v);
    }),
    put: (id, json) => wrap('사진 정보 쓰기', async () => { await redis.hset(META_KEY, { [id]: json }); }),
    drop: (id) => wrap('사진 정보 지우기', async () => { await redis.hdel(META_KEY, id); }),
    // 조각은 한 요청에 하나씩(요청 크기 제한)
    putChunks: (id, part, chunks) => wrap('사진 쓰기', async () => {
      for (let i = 0; i < chunks.length; i++) await redis.set(partKey(id, part, i), chunks[i]);
    }),
    getChunks: (id, part, n) => wrap('사진 읽기', async () => Promise.all(
      Array.from({ length: n }, async (_, i) => {
        const v = await redis.get<string>(partKey(id, part, i));
        return v === null || v === undefined ? null : String(v);
      }),
    )),
    dropChunks: (id, part, n) => wrap('사진 지우기', async () => {
      if (n > 0) await redis.del(...Array.from({ length: n }, (_, i) => partKey(id, part, i)));
    }),
  };
}

const DIR = path.join(process.cwd(), '.data', 'photos');
const META_FILE = path.join(DIR, 'meta.json');
let fileLock: Promise<unknown> = Promise.resolve();

function fileBackend(): Backend {
  const readMap = async (): Promise<Record<string, string>> => {
    try { return JSON.parse(await fs.readFile(META_FILE, 'utf8')); } catch { return {}; }
  };
  // 단일 프로세스 개발용: 프로세스 안에서 직렬화 → 임시 파일 → 교체
  const edit = (fn: (m: Record<string, string>) => void) => {
    const run = async () => {
      const m = await readMap();
      fn(m);
      await fs.mkdir(DIR, { recursive: true });
      const tmp = `${META_FILE}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(m), 'utf8');
      await fs.rename(tmp, META_FILE);
    };
    const p = fileLock.then(run, run);
    fileLock = p.catch(() => undefined);
    return p;
  };
  const chunkFile = (id: string, part: Part, i: number) => path.join(DIR, `${id}.${part}.${i}`);
  return {
    kind: 'file',
    label: `file ${path.relative(process.cwd(), DIR) || DIR}`,
    all: readMap,
    get: async (id) => (await readMap())[id] ?? null,
    put: (id, json) => edit((m) => { m[id] = json; }),
    drop: (id) => edit((m) => { delete m[id]; }),
    putChunks: async (id, part, chunks) => {
      await fs.mkdir(DIR, { recursive: true });
      for (let i = 0; i < chunks.length; i++) await fs.writeFile(chunkFile(id, part, i), chunks[i], 'utf8');
    },
    getChunks: (id, part, n) => Promise.all(Array.from({ length: n }, async (_, i) => {
      try { return await fs.readFile(chunkFile(id, part, i), 'utf8'); } catch { return null; }
    })),
    dropChunks: async (id, part, n) => {
      for (let i = 0; i < n; i++) await fs.rm(chunkFile(id, part, i), { force: true });
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
export function photoStoreInfo() { const b = backend(); return { kind: b.kind, label: b.label }; }

// ── 이미지 처리 ──
// EXIF 회전을 실제 픽셀에 반영한 뒤 메타데이터(GPS · 기종 · 찍은 시각)는 모두 버린다(sharp 는 따로 지시하지 않으면 메타데이터를 붙이지 않는다).
export interface Processed { full: Buffer; thumb: Buffer; width: number; height: number; takenAt: string | null }

// EXIF 의 찍은 시각(DateTimeOriginal, 없으면 DateTime)만 꺼낸다. 메타데이터를 버리기 전에 읽는다. 위치 같은 나머지는 읽지 않는다.
function exifDate(exif: Buffer | undefined): string | null {
  if (!exif || exif.length < 14) return null;
  try {
    const t = exif.subarray(exif.subarray(0, 4).toString('latin1') === 'Exif' ? 6 : 0);
    const bo = t.toString('latin1', 0, 2);
    if (bo !== 'II' && bo !== 'MM') return null;
    const le = bo === 'II';
    const u16 = (o: number) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
    const u32 = (o: number) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
    const find = (ifd: number, tag: number): number | null => {
      if (ifd + 2 > t.length) return null;
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > t.length) break;
        if (u16(e) === tag) return e;
      }
      return null;
    };
    const ascii = (e: number) => {
      const cnt = u32(e + 4);
      const off = cnt <= 4 ? e + 8 : u32(e + 8);
      return t.toString('latin1', off, off + Math.min(cnt, 20));
    };
    const ifd0 = u32(4);
    let raw = '';
    const ptr = find(ifd0, 0x8769);                 // Exif IFD
    if (ptr !== null) { const e = find(u32(ptr + 8), 0x9003); if (e !== null) raw = ascii(e); }
    if (!raw) { const e = find(ifd0, 0x0132); if (e !== null) raw = ascii(e); }
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(raw);
    if (!m || m[1] === '0000') return null;
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
    return Number.isNaN(new Date(iso).getTime()) ? null : iso;
  } catch { return null; }
}

// 한국 시각 「YYYY-MM-DDTHH:mm:ss」(EXIF 시각과 같은 모양). 서버(Vercel)는 UTC 라서 시간대를 정해 둔다.
export function kstLocal(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

export async function processImage(input: Buffer, opts: { doc?: boolean } = {}): Promise<Processed> {
  const mode = opts.doc ? DOC_MODE : PHOTO_MODE;
  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: 'none' }).metadata();
  } catch {
    throw new PhotoError(415, 'unsupported', '사진 파일을 읽지 못했어요. JPG · PNG · WEBP 사진으로 올려 주세요.');
  }
  const heic = meta.format === 'heif' && meta.compression !== 'av1';
  const make = async (edge: number, quality: number) => {
    const { data, info } = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  };
  try {
    // 큰 사진: 품질 80에서 시작해 목표 크기를 넘으면 품질 → 크기 순으로 조금씩 낮춘다
    let full = await make(mode.edge, 80);
    for (const [edge, q] of mode.ladder) {
      if (full.data.length <= mode.target) break;
      full = await make(edge, q);
    }
    const thumb = await make(THUMB_EDGE, 72);
    return { full: full.data, thumb: thumb.data, width: full.width, height: full.height, takenAt: exifDate(meta.exif) };
  } catch {
    if (heic) throw new PhotoError(415, 'heic', '아이폰 HEIC 사진은 바로 못 올려요. 사진 앱에서 공유 → 「JPEG로 저장」하거나, 설정 > 카메라 > 포맷 > 「높은 호환성」으로 바꿔 주세요.');
    throw new PhotoError(415, 'unsupported', '사진 파일을 읽지 못했어요. JPG · PNG · WEBP 사진으로 올려 주세요.');
  }
}

function cleanUrl(s: unknown): string | null {
  if (typeof s !== 'string' || !s.trim()) return null;
  let u: URL;
  try { u = new URL(s.trim()); } catch { throw new PhotoError(400, 'bad_url', '원본 주소가 올바르지 않아요.'); }
  if (u.protocol !== 'https:') throw new PhotoError(400, 'bad_url', '원본 주소는 https 만 받아요.');
  return u.toString();
}

export const isPdf = (buf: Buffer) => buf.subarray(0, 5).toString('latin1') === '%PDF-';

// ── 읽기 · 쓰기 ──
function newId() { return `ph_${randomUUID().replace(/-/g, '').slice(0, 12)}`; }
let lastOrder = 0;
function nextOrder() { lastOrder = Math.max(Date.now(), lastOrder + 1); return lastOrder; }

function parse(json: string | null): PhotoMeta | null {
  if (!json) return null;
  try { return JSON.parse(json) as PhotoMeta; } catch { return null; }
}

export function cleanStep(v: unknown): number {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > STEP_COUNT) throw new PhotoError(400, 'step_required', `단계를 골라 주세요(1~${STEP_COUNT}).`);
  return n;
}
export function cleanAlbum(s: unknown): string {
  const v = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';
  if (v.length > LIMITS.albumMax) throw new PhotoError(400, 'album_too_long', `묶음 이름은 ${LIMITS.albumMax}자까지예요.`);
  return v;
}
export function cleanCaption(s: unknown): string {
  const v = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';
  if (v.length > LIMITS.captionMax) throw new PhotoError(400, 'caption_too_long', `설명은 ${LIMITS.captionMax}자까지예요.`);
  return v;
}

async function putPart(id: string, part: Part, buf: Buffer): Promise<number> {
  const b64 = buf.toString('base64');
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += PART_CHUNK) chunks.push(b64.slice(i, i + PART_CHUNK));
  await backend().putChunks(id, part, chunks);
  return chunks.length;
}

async function dropAll(m: PhotoMeta) {
  for (const p of PARTS) await backend().dropChunks(m.id, p, m.parts[p] ?? 0);
  await backend().drop(m.id);
}

// 30일 지난 삭제 사진은 바이트까지 지운다(쓰기 요청 때 한 번씩)
async function purgeOld(list: PhotoMeta[], now = Date.now()) {
  for (const m of list) if (m.deletedAt && now - new Date(m.deletedAt).getTime() > TRASH_KEEP_MS) await dropAll(m);
}

/** 모든 사진(삭제한 것 포함). 정렬은 화면에서 한다. */
export async function listPhotos(): Promise<PhotoMeta[]> {
  const all = await backend().all();
  return Object.values(all).map(parse).filter((m): m is PhotoMeta => !!m);
}

export async function getPhoto(id: string): Promise<PhotoMeta | null> {
  if (!/^ph_[0-9a-f]{12}$/.test(id)) return null;
  return parse(await backend().get(id));
}

export async function readPart(m: PhotoMeta, part: Part): Promise<Buffer | null> {
  const n = m.parts[part];
  if (!n) return null;
  const chunks = await backend().getChunks(m.id, part, n);
  if (chunks.some((c) => c === null)) return null;
  return Buffer.from(chunks.join(''), 'base64');
}

export interface AddInput {
  stepId: unknown; album?: string; caption?: string; by: string;
  /** EXIF 시각이 없을 때 쓸 시각(CLI: 파일 수정 시각). 없으면 올린 시각 */
  takenAtFallback?: Date | null;
  data: Buffer;
  /** PDF 첫 쪽을 그린 이미지(CLI 가 맥의 pdftoppm · sips 로 만든다). 없으면 화면에 PDF 칸으로 보인다. */
  pdfPreview?: Buffer | null;
  /** 글씨 많은 문서(계약서 · 등기부 사진): 큰 사진을 2400px 로. PDF 미리보기는 늘 문서로 처리한다. */
  doc?: boolean;
  /** 원본 보기 주소(https 만) */
  originalUrl?: string | null;
}

export async function addPhoto(input: AddInput): Promise<PhotoMeta> {
  const stepId = cleanStep(input.stepId);
  const album = cleanAlbum(input.album);
  const caption = cleanCaption(input.caption);
  if (input.data.length === 0) throw new PhotoError(400, 'empty', '빈 파일이에요.');
  if (input.data.length > LIMITS.inputMax) throw new PhotoError(413, 'too_large', '파일이 너무 커요(15MB까지).');
  const originalUrl = cleanUrl(input.originalUrl);
  const id = newId();
  const iso = new Date().toISOString();
  const parts: PhotoMeta['parts'] = {};
  const bytes: PhotoMeta['bytes'] = {};
  let kind: PhotoKind = 'image';
  let width = 0, height = 0, exifTaken: string | null = null;

  if (isPdf(input.data)) {
    if (input.data.length > LIMITS.pdfMax) throw new PhotoError(413, 'pdf_too_large', 'PDF는 4MB까지 올릴 수 있어요.');
    kind = 'pdf';
    let pv: Processed | null = null;
    if (input.pdfPreview) { try { pv = await processImage(input.pdfPreview, { doc: true }); } catch { pv = null; } }
    // 바이트를 먼저 쓰고 마지막에 정보를 쓴다: 중간에 끊겨도 반쪽짜리 사진이 목록에 뜨지 않게
    parts.file = await putPart(id, 'file', input.data); bytes.file = input.data.length;
    if (pv) {
      parts.full = await putPart(id, 'full', pv.full); bytes.full = pv.full.length;
      parts.thumb = await putPart(id, 'thumb', pv.thumb); bytes.thumb = pv.thumb.length;
      width = pv.width; height = pv.height;
    }
  } else {
    const p = await processImage(input.data, { doc: input.doc });
    parts.full = await putPart(id, 'full', p.full); bytes.full = p.full.length;
    parts.thumb = await putPart(id, 'thumb', p.thumb); bytes.thumb = p.thumb.length;
    width = p.width; height = p.height; exifTaken = p.takenAt;
  }

  const takenAt = exifTaken ?? kstLocal(input.takenAtFallback ?? new Date());
  const m: PhotoMeta = {
    id, stepId, album, caption, kind, width, height, parts, bytes, order: nextOrder(), takenAt, originalUrl,
    uploadedAt: iso, by: input.by, version: 1, updatedAt: iso, updatedBy: input.by, deletedAt: null, deletedBy: null,
  };
  await backend().put(id, JSON.stringify(m));
  return m;
}

export interface PhotoPatch { stepId?: unknown; album?: unknown; caption?: unknown; restore?: unknown }

// 앨범 · 설명 고치기, 삭제한 사진 되살리기. 사진 하나만 다시 쓴다(동시에 다른 사진을 고쳐도 서로 덮지 않는다).
export async function updatePhoto(id: string, patch: PhotoPatch, by: string): Promise<PhotoMeta> {
  const cur = await getPhoto(id);
  if (!cur) throw new PhotoError(404, 'not_found', '사진을 찾지 못했어요.');
  const next: PhotoMeta = { ...cur };
  if (patch.restore === true) {
    next.deletedAt = null; next.deletedBy = null;
  } else if (cur.deletedAt) {
    throw new PhotoError(410, 'deleted', '이미 삭제한 사진이에요.');
  }
  if (patch.stepId !== undefined) next.stepId = cleanStep(patch.stepId);
  if (patch.album !== undefined) next.album = cleanAlbum(patch.album);
  if (patch.caption !== undefined) next.caption = cleanCaption(patch.caption);
  const iso = new Date().toISOString();
  Object.assign(next, { version: cur.version + 1, updatedAt: iso, updatedBy: by });
  await backend().put(id, JSON.stringify(next));
  await purgeOld(await listPhotos());
  return next;
}

// 지우기 = 삭제 표시만(30일 동안 「삭제한 사진」에서 되살릴 수 있다)
export async function deletePhoto(id: string, by: string): Promise<PhotoMeta> {
  const cur = await getPhoto(id);
  if (!cur) throw new PhotoError(404, 'not_found', '사진을 찾지 못했어요.');
  if (cur.deletedAt) return cur;
  const iso = new Date().toISOString();
  const next: PhotoMeta = { ...cur, deletedAt: iso, deletedBy: by, version: cur.version + 1, updatedAt: iso, updatedBy: by };
  await backend().put(id, JSON.stringify(next));
  await purgeOld(await listPhotos());
  return next;
}

/** CLI 전용: 바이트까지 바로 지운다(되살릴 수 없음) */
export async function purgePhoto(id: string): Promise<boolean> {
  const cur = await getPhoto(id);
  if (!cur) return false;
  await dropAll(cur);
  return true;
}

// 화면에 보내는 사진 정보(조각 수 같은 저장소 내부 값은 빼고)
export type PhotoView = Pick<PhotoMeta, 'id' | 'stepId' | 'album' | 'caption' | 'kind' | 'width' | 'height' | 'order' | 'takenAt' | 'uploadedAt' | 'by' | 'version' | 'deletedAt' | 'deletedBy'> & {
  hasImage: boolean; originalUrl: string | null;
};
export const toView = (m: PhotoMeta): PhotoView => ({
  id: m.id, stepId: m.stepId, album: m.album, caption: m.caption, kind: m.kind, width: m.width, height: m.height, order: m.order,
  takenAt: m.takenAt, uploadedAt: m.uploadedAt, by: m.by, version: m.version, deletedAt: m.deletedAt, deletedBy: m.deletedBy,
  hasImage: !!m.parts.thumb, originalUrl: m.originalUrl ?? null,
});
