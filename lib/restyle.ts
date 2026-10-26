import 'server-only';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

// 꾸미기 › 사진 시안: 실제 방 사진과 AI로 다시 그린 시안 사진. 집 안이 보이는 사진이라 public/ 이 아니라 private/restyle/ 에 둔다
// (git 에 안 올리고 배포에만 싣는다 — DESIGN.md 11장). 방 · 시안 목록도 방 이름 · 설명이 집 구조를 말하므로 같은 폴더의 list.json 한 곳에 둔다.
// 방이나 시안(C · D …)을 늘릴 때는 list.json 의 배열과 사진만 더한다. 사진 이름: <방 id>-original.jpg(지금 모습) · <방 id>-<시안 id>.jpg.
export const RESTYLE_DIR = path.join(process.cwd(), 'private', 'restyle');

/** 사진 이름 검사(경로 넘어가기 막기): 영문 · 숫자 id 둘을 붙임표로 이은 .jpg 만 */
export const RESTYLE_FILE_RE = /^[A-Za-z0-9]{1,32}-[A-Za-z0-9]{1,32}\.jpg$/;

const id = z.string().regex(/^[A-Za-z0-9]{1,32}$/);
const listSchema = z.object({
  concepts: z.array(z.object({
    id: id.refine((v) => v !== 'original', '시안 id 로 original 은 못 쓴다'),
    name: z.string().trim().min(1).max(40),
    about: z.string().trim().max(400).optional(),
  })).min(1).max(12),
  rooms: z.array(z.object({
    id,
    name: z.string().trim().min(1).max(40),
    note: z.string().trim().max(600).optional(),
  })).max(30),
});

export interface RestyleConcept { id: string; name: string; about?: string }
export interface RestyleRoom {
  id: string;
  name: string;
  note?: string;
  /** 지금 모습 사진 이름 */
  original: string;
  /** 사진이 있는 시안만, list.json 의 시안 순서대로 */
  shots: { concept: string; file: string }[];
}
export interface RestyleList { concepts: RestyleConcept[]; rooms: RestyleRoom[] }

/** list.json 이 없으면 null. 형식이 틀리면 던진다(라우트가 500 으로 바꾼다). 지금 모습 사진이나 시안 사진이 하나도 없는 방은 뺀다. */
export async function readRestyleList(): Promise<RestyleList | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(RESTYLE_DIR, 'list.json'), 'utf8');
  } catch {
    return null;
  }
  const parsed = listSchema.parse(JSON.parse(raw));
  const files = new Set(await readdir(RESTYLE_DIR));
  const rooms = parsed.rooms.flatMap((r): RestyleRoom[] => {
    const original = `${r.id}-original.jpg`;
    if (!files.has(original)) return [];
    const shots = parsed.concepts
      .map((c) => ({ concept: c.id, file: `${r.id}-${c.id}.jpg` }))
      .filter((s) => files.has(s.file));
    return shots.length ? [{ id: r.id, name: r.name, note: r.note || undefined, original, shots }] : [];
  });
  const used = new Set(rooms.flatMap((r) => r.shots.map((s) => s.concept)));
  return { concepts: parsed.concepts.filter((c) => used.has(c.id)), rooms };
}
