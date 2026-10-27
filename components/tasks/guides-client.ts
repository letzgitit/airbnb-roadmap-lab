'use client';

import { useEffect, useSyncExternalStore } from 'react';

// 할 일 설명서(화면 쪽). 설명서는 현황 문서 밖에 따로 있다(lib/core/guides.ts):
// - 목록 GET /api/guides → { ids: { [taskId]: { len, version } } } 를 한 번 받아 두고(물음표를 보일지만), 저장하면 다시 받는다.
// - 본문은 물음표를 누르거나 고치는 폼을 열 때 GET /api/guides/<id> 로 받는다.
export interface GuideMeta { len: number; version: number }
export interface GuideBody { md: string; version: number; updatedAt: string; updatedBy: string }

let ids: Record<string, GuideMeta> | null = null;
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function refreshGuides(): Promise<void> {
  if (inflight) return inflight;
  inflight = fetch('/api/guides', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { ids?: Record<string, GuideMeta> } | null) => { if (j?.ids) { ids = j.ids; emit(); } })
    .catch(() => undefined)
    .finally(() => { inflight = null; });
  return inflight;
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** 설명서가 있는 할 일 목록(처음 부르면 받아 온다). 받기 전에는 빈 값 */
export function useGuideIds(): Record<string, GuideMeta> {
  const v = useSyncExternalStore(subscribe, () => ids, () => null);
  useEffect(() => { if (!ids) void refreshGuides(); }, []);
  return v ?? EMPTY;
}
const EMPTY: Record<string, GuideMeta> = {};

export async function fetchGuide(id: string): Promise<GuideBody | null> {
  const r = await fetch(`/api/guides/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`설명서를 불러오지 못했어요(${r.status}).`);
  return ((await r.json()) as { guide: GuideBody | null }).guide;
}

/** 저장. ok = false 면 message 를 폼에 보인다(409 = 그 사이 다른 사람이 고침 — current 로 다시 채울 수 있다) */
export async function saveGuide(id: string, md: string, baseVersion: number): Promise<{ ok: true; guide: GuideBody | null } | { ok: false; status: number; message: string; current?: GuideBody | null }> {
  try {
    const r = await fetch(`/api/guides/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ md, baseVersion }),
    });
    const j = await r.json().catch(() => ({})) as { guide?: GuideBody | null; message?: string; current?: GuideBody | null };
    if (!r.ok) return { ok: false, status: r.status, message: j.message ?? '설명서를 저장하지 못했어요.', current: j.current };
    // 목록(물음표)을 바로 맞춘다
    const next = { ...(ids ?? {}) };
    if (j.guide) next[id] = { len: j.guide.md.length, version: j.guide.version }; else delete next[id];
    ids = next; emit();
    return { ok: true, guide: j.guide ?? null };
  } catch {
    return { ok: false, status: 0, message: '인터넷 연결을 확인해 주세요. 설명서를 저장하지 못했어요.' };
  }
}
