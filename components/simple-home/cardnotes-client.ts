'use client';

import { useEffect, useSyncExternalStore } from 'react';

// 블록 메모(화면 쪽). 메모는 현황 문서 밖에 따로 있다(lib/core/cardnotes.ts):
// - 전부 GET /api/cardnotes → { notes: { [블록 id]: 메모[] } } 를 처음 한 번 받아 두고, 더하기 · 지우기 · 되돌리기는 받은 응답으로 바로 맞춘다.
// - 블록 id = 「분야.블록」(home-model blockId).
export interface CardNote { id: string; text: string; at: string; by: string }

let notes: Record<string, CardNote[]> | null = null;
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const byAt = (a: CardNote, b: CardNote) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id);

export function refreshCardNotes(): Promise<void> {
  if (inflight) return inflight;
  inflight = fetch('/api/cardnotes', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { notes?: Record<string, CardNote[]> } | null) => { if (j?.notes) { notes = j.notes; emit(); } })
    .catch(() => undefined)
    .finally(() => { inflight = null; });
  return inflight;
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const EMPTY: CardNote[] = [];
/** 그 블록의 메모(적은 순). 받기 전에는 빈 목록 */
export function useCardNotes(cardId: string): CardNote[] {
  const v = useSyncExternalStore(subscribe, () => notes, () => null);
  useEffect(() => { if (!notes) void refreshCardNotes(); }, []);
  return v?.[cardId] ?? EMPTY;
}

function put(cardId: string, fn: (list: CardNote[]) => CardNote[]) {
  const next = { ...(notes ?? {}) };
  const list = fn(next[cardId] ?? []);
  if (list.length) next[cardId] = list; else delete next[cardId];
  notes = next;
  emit();
}

type Result = { ok: true; note: CardNote } | { ok: false; message: string };
async function call(url: string, method: 'POST' | 'DELETE', body: unknown, fail: string): Promise<Result> {
  try {
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})) as { note?: CardNote; message?: string };
    if (!r.ok || !j.note) return { ok: false, message: j.message ?? fail };
    return { ok: true, note: j.note };
  } catch {
    return { ok: false, message: `인터넷 연결을 확인해 주세요. ${fail}` };
  }
}
const at = (cardId: string) => `/api/cardnotes/${encodeURIComponent(cardId)}`;

export async function addCardNote(cardId: string, text: string): Promise<Result> {
  const r = await call(at(cardId), 'POST', { text }, '메모를 저장하지 못했어요.');
  if (r.ok) put(cardId, (l) => [...l.filter((n) => n.id !== r.note.id), r.note].sort(byAt));
  return r;
}
/** 지우기 — 성공하면 지운 메모를 돌려준다(되돌리기에 쓴다) */
export async function removeCardNote(cardId: string, noteId: string): Promise<Result> {
  const r = await call(`${at(cardId)}/${encodeURIComponent(noteId)}`, 'DELETE', {}, '메모를 지우지 못했어요.');
  if (r.ok) put(cardId, (l) => l.filter((n) => n.id !== noteId));
  else void refreshCardNotes(); // 그 사이 다른 사람이 지웠을 수 있다
  return r;
}
export async function restoreCardNote(cardId: string, note: CardNote): Promise<Result> {
  const r = await call(at(cardId), 'POST', { restore: note }, '메모를 되돌리지 못했어요.');
  if (r.ok) put(cardId, (l) => [...l.filter((n) => n.id !== r.note.id), r.note].sort(byAt));
  return r;
}
