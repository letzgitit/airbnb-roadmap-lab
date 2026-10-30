// 검색 계산(순수 함수 — 화면 없음): 현황 문서 + 도움말 본문 → 찾을 항목 목록 → 찾기 · 순위 · 묶음 → 줄마다 밑줄 · 조각 · 갈 곳.
//   지우기만 하면 되는 TS 문법만 쓰고 import 에 .ts 를 붙여 Node 에서 바로 돈다(@/ 경로는 type import 에만 — search-model.test.ts).
// 묶음 순서는 고정(설계 3.3): 할 일 → 기록 → 연락처 → 집 정보 → 자금 → 질문. 묶음 안은 제목에 다 있음 > 일부 > 제목 밖 > 도움말에서만,
// 끝난 할 일은 묶음 맨 아래. 찾을 항목은 검색 창을 열 때 한 번 만들고(buildIndex) 문서 · 도움말이 바뀌면 다시 만든다.
import type { LogEntry, MoneyItem, ProgressDoc, PropertyItem, QuestionItem, TaskItem } from '@/lib/core/types';
import {
  choseongOf, composable, composingAt, hotWords, isChoseongTerm, markRanges, prepText, searchTerms, snippet, stripMarkdown,
  type Cho, type Prepared, type Range,
} from '../../lib/shared/search-text.ts';
import { contacts, fieldLabel, taskTabs, type Contact, type WorkTabId } from '../simple-home/home-model.ts';
import { manwon } from '../../lib/plan.ts';
import { plainMemo } from '../tasks/checklist.ts';
import { QUESTION_STATUS_LABEL, STEP_COUNT } from '../../lib/core/types.ts';

export type SearchKind = 'task' | 'log' | 'contact' | 'property' | 'money' | 'question';
export const GROUPS: { kind: SearchKind; label: string }[] = [
  { kind: 'task', label: '할 일' },
  { kind: 'log', label: '기록' },
  { kind: 'contact', label: '연락처' },
  { kind: 'property', label: '집 정보' },
  { kind: 'money', label: '자금' },
  { kind: 'question', label: '질문' },
];
/** 묶음마다 처음 보이는 줄(「이번 주 할 일」과 같은 5), 「n개 더 보기」로 펼치는 끝(넘으면 「더 좁혀 찾아 보세요」) */
export const GROUP_SHOWN = 5;
export const GROUP_MAX = 50;

/**
 * 필드 하나. show = 줄에서 어디에 보이나:
 *  meta = 둘째 줄 메타에 늘 보임(종류 · 받는 사람 · 무슨 일 · 전화), snippet = 제목 밖에서 걸렸을 때 셋째 줄 조각(메모 · 도움말 · 값 · 답), none = 찾기에만(전화 숫자만 남긴 판)
 */
export interface Field { name: string; text: Prepared; show: 'meta' | 'snippet' | 'none'; guide?: boolean }
interface Base { id: string; title: Prepared; cho: Cho; fields: Field[] }
export type Entry =
  | (Base & { kind: 'task'; item: TaskItem; tab: WorkTabId | null })
  | (Base & { kind: 'log'; item: LogEntry })
  | (Base & { kind: 'contact'; item: PropertyItem; contact: Contact; order: number })
  | (Base & { kind: 'property'; item: PropertyItem })
  | (Base & { kind: 'money'; item: MoneyItem })
  | (Base & { kind: 'question'; item: QuestionItem });

/** 도움말 본문 캐시: text = 서버가 마크다운 기호를 뺀 글, md = 방금 저장한 원문(여기서 기호를 뺀다) */
// heads = 소제목만(조각에는 안 보이고 찾기에만 — 서버가 따로 보낸다, md 면 여기서 뽑는다)
export type GuideBodies = Record<string, { text?: string; heads?: string; md?: string; version: number }>;

const field = (name: string, text: string | null | undefined, show: Field['show'], guide = false): Field | null => {
  const p = prepText(text);
  return p.raw ? { name, text: p, show, ...(guide ? { guide: true } : {}) } : null;
};
const fields = (...list: (Field | null)[]) => list.filter((f): f is Field => !!f);
const head = (title: string) => { const t = prepText(title); return { title: t, cho: choseongOf(t.raw) }; };

/** 「2026-10-29」 → 「10월 29일」 */
export const mdDate = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(m)}월 ${Number(d)}일`; };
/** 자금 금액 글: 「−300만」 「+50만」 「금액 미정」 */
export const moneyText = (n: number | null) => (n === null ? '금액 미정' : `${n < 0 ? '−' : '+'}${manwon(n)}`);
/** 기록 · 답 시각(ISO) → 이 기기 날짜 「10월 29일」 */
export function dayOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * 찾을 항목 목록(검색 창을 열 때 한 번). 지운 할 일 · 기록 · 집 정보 · 자금 · 질문과 지운 답, 지운 할 일의 도움말은 넣지 않는다. 손님 링크는 찾지 않는다.
 * 연락처 = 집 정보 중 「연락처 · 」 줄(연락처 탭 순서), 집 정보 = 그 밖의 줄(「정한 것 · 」 「고정 · 」 포함).
 */
export function buildIndex(doc: Pick<ProgressDoc, 'tasks' | 'log' | 'property' | 'money' | 'questions'>, bodies: GuideBodies = {}): Entry[] {
  const out: Entry[] = [];
  const tabs = taskTabs(doc);
  for (const t of Object.values(doc.tasks)) {
    if (t.deletedAt) continue;
    const g = Object.hasOwn(bodies, t.id) ? bodies[t.id] : undefined;
    const guide = g ? (g.text ?? stripMarkdown(g.md ?? '', { headings: 'drop' })) : '';
    const heads = g ? (g.heads ?? (g.md ? stripMarkdown(g.md, { headings: 'only' }) : '')) : '';
    out.push({ kind: 'task', id: t.id, item: t, tab: tabs.get(t.id) ?? null, ...head(t.text),
      fields: fields(field('종류', t.kind, 'meta'), field('메모', plainMemo(t.note), 'snippet'), field('도움말', guide, 'snippet', true), field('도움말', heads, 'none', true)) });
  }
  for (const l of doc.log ?? []) {
    if (l.deletedAt) continue;
    out.push({ kind: 'log', id: l.id, item: l, ...head(l.text), fields: fields(field('종류', l.kind, 'meta')) });
  }
  contacts(doc.property ?? {}).forEach((c, order) => {
    out.push({ kind: 'contact', id: c.item.id, item: c.item, contact: c, order, ...head(c.name),
      fields: fields(field('무슨 일', c.work, 'meta'), field('전화', c.phone, 'meta'), field('전화', c.phone?.replace(/\D/g, ''), 'none')) });
  });
  for (const p of Object.values(doc.property ?? {})) {
    if (p.deletedAt || p.label.startsWith('연락처 · ')) continue;
    // 조각 이름은 「본문」(집 정보 줄에는 칸 이름이 보이지 않아 — 2026-10-29 말 검수)
    out.push({ kind: 'property', id: p.id, item: p, ...head(p.label), fields: fields(field('본문', p.value, 'snippet')) });
  }
  for (const m of Object.values(doc.money ?? {})) {
    if (m.deletedAt) continue;
    out.push({ kind: 'money', id: m.id, item: m, ...head(m.text),
      fields: fields(field('날짜', m.date ? mdDate(m.date) : '', 'meta'), field('금액', m.amount === null ? '' : moneyText(m.amount), 'meta')) });
  }
  for (const q of Object.values(doc.questions ?? {})) {
    if (q.deletedAt) continue;
    out.push({ kind: 'question', id: q.id, item: q, ...head(q.text),
      fields: fields(field('받는 사람', q.to, 'meta'), ...q.answers.filter((a) => !a.deletedAt).map((a) => field('답', a.text, 'snippet'))) });
  }
  return out;
}

/** 한 낱말이 처음 걸린 자리: 0 = 제목, i + 1 = fields[i], -1 = 없음. 그대로 · 공백 뺀 판을 먼저 다 보고, 그다음 제목 초성, 마지막 낱말이면 입력 중 보정 */
function locate(e: Entry, t: string, last: boolean): number {
  if (e.title.norm.includes(t) || e.title.compact.includes(t)) return 0;
  for (let i = 0; i < e.fields.length; i++) { const f = e.fields[i].text; if (f.norm.includes(t) || f.compact.includes(t)) return i + 1; }
  if (isChoseongTerm(t) && e.cho.s.includes(t)) return 0;
  if (last && composable(t)) {
    if (composingAt(e.title.compact, t, true).length) return 0;
    for (let i = 0; i < e.fields.length; i++) if (composingAt(e.fields[i].text.compact, t, true).length) return i + 1;
  }
  return -1;
}

/** tier: 0 = 모든 낱말이 제목에, 1 = 일부가 제목에, 2 = 제목 밖에서만, 3 = 도움말이 있어야 걸림. at = 낱말마다 걸린 자리(locate) */
export interface Hit { entry: Entry; tier: 0 | 1 | 2 | 3; at: number[]; needGuide: boolean }
export interface Group { kind: SearchKind; label: string; hits: Hit[] }
export interface SearchResult { q: string; terms: string[]; groups: Group[]; total: number }

const byKind = (a: Hit, b: Hit): number => {
  const x = a.entry, y = b.entry;
  if (x.kind === 'task' && y.kind === 'task') {
    return Number(x.item.done) - Number(y.item.done) || a.tier - b.tier
      || (x.item.due ?? '9999').localeCompare(y.item.due ?? '9999') || x.item.createdAt.localeCompare(y.item.createdAt);
  }
  const tier = a.tier - b.tier;
  if (tier) return tier;
  if (x.kind === 'log' && y.kind === 'log') return y.item.at.localeCompare(x.item.at);
  if (x.kind === 'contact' && y.kind === 'contact') return x.order - y.order;
  if (x.kind === 'property' && y.kind === 'property') return x.item.createdAt.localeCompare(y.item.createdAt);
  if (x.kind === 'money' && y.kind === 'money') return (x.item.date ?? '9999').localeCompare(y.item.date ?? '9999') || x.item.createdAt.localeCompare(y.item.createdAt);
  if (x.kind === 'question' && y.kind === 'question') return Number(y.item.status === 'open') - Number(x.item.status === 'open') || y.item.createdAt.localeCompare(x.item.createdAt);
  return 0;
};

/** 찾기: 모든 낱말이 들어 있는 항목만(AND — 낱말마다 어느 필드에 있든), 묶음 순서 고정 · 빈 묶음은 뺀다 */
export function search(index: Entry[], q: string): SearchResult {
  const terms = searchTerms(q);
  if (!terms.length) return { q: '', terms, groups: [], total: 0 };
  const by = new Map<SearchKind, Hit[]>();
  const lastAt = terms.length - 1;
  for (const e of index) {
    const at: number[] = [];
    let ok = true;
    for (let k = 0; k < terms.length; k++) {
      const where = locate(e, terms[k], k === lastAt);
      if (where < 0) { ok = false; break; }
      at.push(where);
    }
    if (!ok) continue;
    const inTitle = at.filter((w) => w === 0).length;
    const needGuide = at.some((w) => w > 0 && !!e.fields[w - 1].guide);
    const tier = inTitle === terms.length ? 0 : inTitle > 0 ? 1 : needGuide ? 3 : 2;
    const list = by.get(e.kind) ?? [];
    list.push({ entry: e, tier, at, needGuide });
    by.set(e.kind, list);
  }
  const groups = GROUPS.filter((g) => by.has(g.kind)).map((g) => ({ ...g, hits: by.get(g.kind)!.sort(byKind) }));
  return { q: terms.join(' '), terms, groups, total: groups.reduce((n, g) => n + g.hits.length, 0) };
}

/** 화면 읽기 프로그램에 한 번 읽어 줄 개수: 「할 일 3개, 기록 1개」(묶음 머리 · 「n개 더 보기」와 같은 단위) */
export function countText(r: SearchResult): string {
  return r.groups.map((g) => `${g.label} ${g.hits.length}개`).join(', ');
}

// ── 줄 하나의 보이는 모양 ──
export interface Marked { text: string; ranges: Range[] }
/** 메타 한 칸: date = 날짜(본문색), badge = 상태 꼬리표(질문 화면과 같은 Badge) */
export interface MetaPart { text: string; ranges?: Range[]; date?: boolean; badge?: boolean }
export interface RowView { title: Marked; meta: MetaPart[]; snip: (Marked & { name: string }) | null; done: boolean }

const marked = (p: Prepared, terms: string[], cho?: Cho): Marked => ({ text: p.raw, ranges: markRanges(p, terms, { cho, composeLast: true }) });

/**
 * 결과 줄(보이는 줄만 부른다 — 처음엔 묶음마다 5줄): 제목 밑줄, 둘째 줄 메타(늘 보이는 필드는 밑줄까지), 제목 밖에서 걸렸으면 셋째 줄 조각.
 * 조각 필드 = 제목에 없는 낱말이 걸린 필드 중 앞의 것(메모 → 도움말 순, 숨은 필드면 건너뜀).
 */
export function rowView(hit: Hit, terms: string[]): RowView {
  const e = hit.entry;
  const metaField = (name: string): MetaPart[] => e.fields.filter((f) => f.show === 'meta' && f.name === name).map((f) => marked(f.text, terms));
  const meta: MetaPart[] = [];
  let done = false;
  switch (e.kind) {
    case 'task':
      done = e.item.done;
      if (e.tab) meta.push({ text: fieldLabel(e.tab) });
      if (e.item.due) meta.push({ text: `${mdDate(e.item.due)}까지`, date: true });
      meta.push(...metaField('종류'));
      if (done) meta.push({ text: '완료' });
      break;
    case 'log':
      // 쓴 사람은 싣지 않는다(기록 목록도 보여 주지 않는다)
      meta.push(...metaField('종류'), { text: dayOf(e.item.at), date: true });
      break;
    case 'contact':
      meta.push(...metaField('무슨 일'), ...metaField('전화').map((p) => ({ ...p, date: true })));
      break;
    case 'property':
      break;
    case 'money':
      meta.push(...metaField('날짜').map((p) => ({ ...p, date: true })), ...(e.item.amount === null ? [{ text: '금액 미정' }] : metaField('금액')));
      if (e.item.estimate) meta.push({ text: '추정' });
      break;
    case 'question': {
      // 상태는 질문 화면처럼 꼬리표 하나. 답 개수는 둘 이상이고 상태와 부딪히지 않을 때만(「답함」 옆 「답 1개」는 같은 말, 「답 기다림」인데 답이 달려 있으면 상태 하나만)
      meta.push(...metaField('받는 사람'), { text: QUESTION_STATUS_LABEL[e.item.status], badge: true });
      const n = e.item.answers.filter((a) => !a.deletedAt).length;
      if (n >= 2 && e.item.status !== 'open') meta.push({ text: `답 ${n}개` });
      break;
    }
  }
  let snip: RowView['snip'] = null;
  if (hit.tier > 0) {
    const idx = hit.at.filter((w) => w > 0 && e.fields[w - 1].show === 'snippet').sort((a, b) => a - b)[0];
    if (idx) {
      const f = e.fields[idx - 1];
      const s = snippet(f.text, markRanges(f.text, terms, { composeLast: true }));
      snip = { name: f.name, ...s };
    }
  }
  return { title: marked(e.title, terms, e.cho), meta: meta.filter((m) => m.text), snip, done };
}

/**
 * 갈 곳: 할 일 · 연락처 · 자금은 창을 닫고 그 줄로, 기록 · 집 정보 · 질문은 null(검색 창 안에서 펼친다).
 * detail = 「자세히 보기」(예전 화면)를 골라 둔 기기: 연락처는 갈 화면이 없어(새 홈 연락처 탭) 그 자리에서 펼친다. 할 일은 그 단계 시트로(부르는 쪽).
 * 분야 탭을 못 찾은 할 일(부모를 지운 세부 항목 등)도 단계가 있으면 그 단계 시트로, 단계도 없으면 그 자리에서 펼친다.
 */
export type Jump =
  | { kind: 'task'; id: string; tab: WorkTabId | null; stepId: number; guide: boolean }
  | { kind: 'contact'; id: string }
  | { kind: 'money'; id: string };
export const hasStep = (stepId: number) => Number.isInteger(stepId) && stepId >= 1 && stepId <= STEP_COUNT;
export function jumpOf(hit: Hit, o: { detail?: boolean } = {}): Jump | null {
  const e = hit.entry;
  if (e.kind === 'task') return e.tab || hasStep(e.item.stepId) ? { kind: 'task', id: e.id, tab: e.tab, stepId: e.item.stepId, guide: hit.needGuide } : null;
  if (e.kind === 'contact') return o.detail ? null : { kind: 'contact', id: e.id };
  if (e.kind === 'money') return { kind: 'money', id: e.id };
  return null;
}

/** 빈 검색어 화면의 「많이 나온 말」: 안 끝난 할 일 제목(세부 항목 포함)에서 */
export function hotOfDoc(doc: Pick<ProgressDoc, 'tasks'>): { word: string; n: number }[] {
  return hotWords(Object.values(doc.tasks).filter((t) => !t.deletedAt && !t.done).map((t) => t.text));
}
