import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { RefItem, RefKind, Step } from './core/types.ts';
import { STEP_COUNT } from './core/types.ts';

// 자동 참고 자료: 데일리가 모은 기사·영상·공지를 단계별로 받아 온다. 빈 문자열이면 끈다.
const FEED = process.env.REFS_FEED_URL ?? 'https://jumoney-daily.vercel.app/api/oedomin-refs';

const KINDS: readonly RefKind[] = ['기사', '영상', '공지'];
const PER_STEP_READ = 40;
const PER_STEP_MAX = 30;
const LIMIT = { title: 160, summary: 300, source: 40 };

export type AutoRefs = Record<number, RefItem[]>;
export interface RefsBlock { urls: string[] }

const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

// 주소 비교용: 앞뒤 공백 · #… · 끝 / · 호스트 소문자 · www. · utm_* 쿼리를 없앤다
export function normUrl(raw: string): string {
  const t = raw.trim().replace(/#.*$/, '');
  try {
    const u = new URL(t);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const keep = [...u.searchParams.entries()].filter(([k]) => !k.toLowerCase().startsWith('utm_'));
    const qs = keep.length ? '?' + new URLSearchParams(keep).toString() : '';
    return `${u.protocol}//${host}${u.port ? ':' + u.port : ''}${u.pathname.replace(/\/+$/, '')}${qs}`;
  } catch {
    return t.replace(/\/+$/, '');
  }
}

// 응답 한 항목 검사. 틀리면 null(그 항목만 버린다)
function pickItem(v: unknown): RefItem | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.title, LIMIT.title) || !isStr(o.summary, LIMIT.summary) || !isStr(o.source, LIMIT.source)) return null;
  if (!isDate(o.date)) return null;
  if (typeof o.url !== 'string' || !/^https:\/\//i.test(o.url.trim()) || o.url.length > 1000) return null;
  if (!KINDS.includes(o.kind as RefKind)) return null;
  return { title: o.title.trim(), summary: o.summary.trim(), source: o.source.trim(), date: o.date, url: o.url.trim(), kind: o.kind as RefKind, auto: true };
}

// 응답 전체 검사: 모양이 틀리면 null
export function parseFeed(json: unknown): AutoRefs | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  if (j.version !== 1 || !j.steps || typeof j.steps !== 'object' || Array.isArray(j.steps)) return null;
  const out: AutoRefs = {};
  for (const [key, list] of Object.entries(j.steps as Record<string, unknown>)) {
    if (!/^\d{1,2}$/.test(key)) continue;
    const id = Number(key);
    if (id < 1 || id > STEP_COUNT || !Array.isArray(list)) continue;
    const items = list.slice(0, PER_STEP_READ).map(pickItem).filter((x): x is RefItem => !!x);
    if (items.length) out[id] = items;
  }
  return out;
}

export async function loadAutoRefs(): Promise<AutoRefs> {
  if (!FEED) return {};
  try {
    const res = await fetch(FEED, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseFeed(await res.json());
    if (!parsed) throw new Error('응답 모양이 다름');
    return parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 운영 중 6시간마다 다시 만들 때 못 받으면 던져서 앞서 만든 화면(그때 받은 자동 자료 포함)을 그대로 두게 한다
    // (Next ISR: 다시 만들기가 실패하면 마지막으로 성공한 화면을 계속 준다) — 데일리가 잠깐 죽었다고 자동 자료가 사라지지 않게.
    // 배포 빌드 때 · 개발 서버에서는 던지지 않고 고정 항목만으로 만든다.
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
      console.warn(`[refs] 자동 참고 자료를 못 읽어 다시 만들기를 미뤄요(앞 화면 유지): ${msg}`);
      throw e;
    }
    console.warn(`[refs] 자동 참고 자료를 못 읽어 고정 항목만 보여요: ${msg}`);
    return {};
  }
}

export function loadBlock(): RefsBlock {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content', 'refs-block.json'), 'utf8')) as { urls?: unknown };
    return { urls: Array.isArray(j.urls) ? j.urls.filter((u): u is string => typeof u === 'string') : [] };
  } catch {
    return { urls: [] };
  }
}

// 고정(steps.json) + 자동을 합친다: 주소 중복은 고정이 이기고, 빼기 목록은 고정에도 적용, 날짜 내림차순(같으면 고정 먼저), 단계당 30개
export function withRefs(steps: Step[], auto: AutoRefs, block: RefsBlock): Step[] {
  const blocked = new Set(block.urls.map(normUrl));
  return steps.map((s) => {
    const seen = new Set<string>();
    const merged: { r: RefItem; order: number }[] = [];
    [...s.refs, ...(auto[s.id] ?? [])].forEach((r, order) => {
      const n = normUrl(r.url);
      if (blocked.has(n) || seen.has(n)) return;
      seen.add(n);
      merged.push({ r, order });
    });
    merged.sort((a, b) => (a.r.date === b.r.date ? a.order - b.order : a.r.date < b.r.date ? 1 : -1));
    return { ...s, refs: merged.slice(0, PER_STEP_MAX).map((m) => m.r) };
  });
}
