// 검색 글자 다루기(순수 함수 — 화면 없음). 외도민 · 지산이 글자 하나 다르지 않게 같은 파일을 쓴다(설계 볼트 29의 9절).
//   지우기만 하면 되는 TS 문법만 쓴다(search-text.test.ts 가 node --test 로 바로 읽는다).
// 찾는 법(설계 3.2): 정규화(NFC · 소문자 · 공백 하나) → 낱말(공백으로 나눔, 8개까지)이 모두 들어 있어야 걸린다.
//   낱말 하나는 ① 글에 그대로 ② 공백을 뺀 판에(「사업자등록」 ↔ 「사업자 등록」) ③ 초성만 두 글자 이상이면 제목 초성에(「ㄱㅇㅅ」 → 「계약서」)
//   ④ 마지막 낱말만: 치는 중인 마지막 글자를 자모로 풀어 다음 글자들의 앞부분과 맞춘다(「계앿」 → 「계약서」 — 입력 중 깜빡임 막기).
// 한글 자모는 es-hangul 의 getChoseong · disassemble 두 함수만 쓴다.
import { disassemble, getChoseong } from 'es-hangul';

export const MAX_QUERY = 100;
export const MAX_TERMS = 8;

/** 검색어 정규화: NFC → 소문자 → 공백 하나로 → 앞뒤 공백 지움, 100자까지 */
export function normalizeQuery(q: string): string {
  return String(q ?? '').normalize('NFC').slice(0, MAX_QUERY).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** 찾을 낱말들(같은 낱말은 한 번, 8개까지) */
export function searchTerms(q: string): string[] {
  const out: string[] = [];
  for (const w of normalizeQuery(q).split(' ')) if (w && !out.includes(w)) out.push(w);
  return out.slice(0, MAX_TERMS);
}

const isJamo = (k: number) => k >= 0x3131 && k <= 0x3163;
const isSyllable = (k: number) => k >= 0xac00 && k <= 0xd7a3;
/** 검색어가 자모 한 글자뿐인가(「ㄱ」 — 첫 타). 이때는 찾지 않고 직전 결과를 그대로 둔다 */
export function isLoneJamo(q: string): boolean {
  const s = normalizeQuery(q);
  return s.length === 1 && isJamo(s.charCodeAt(0));
}
/** 초성만 두 글자 이상(「ㄱㅇㅅ」) — 제목 초성으로 찾는 낱말 */
export const isChoseongTerm = (t: string) => /^[ㄱ-ㅎ]{2,}$/.test(t);

// ── 미리 만들어 두는 글 ──
/** 한 필드의 글: raw = 화면에 보일 글(NFC · 공백 하나), norm = 소문자, compact = 공백을 뺀 판. 밑줄 자리 계산용 지도는 처음 쓸 때 만든다 */
export interface Prepared { raw: string; norm: string; compact: string; m?: Mapped }
interface Mapped { compact: string; at: number[] }
export function prepText(s: string | null | undefined): Prepared {
  const raw = String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const norm = raw.toLowerCase();
  return { raw, norm, compact: norm.replace(/ /g, '') };
}
/** 제목 초성 판: s = 초성 글자들(한글이 아닌 글자는 건너뜀), at[i] = s[i] 가 온 raw 자리 */
export interface Cho { s: string; at: number[] }
export function choseongOf(raw: string): Cho {
  let s = '';
  const at: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const k = raw.charCodeAt(i);
    const c = isSyllable(k) ? getChoseong(raw[i]) : k >= 0x3131 && k <= 0x314e ? raw[i] : '';
    if (c) { s += c; at.push(i); }
  }
  return { s, at };
}
// 공백을 뺀 소문자 판과, 그 글자마다 raw 의 어느 자리에서 왔는지(밑줄을 원래 글자 위에 긋기 위해)
function mapped(p: Prepared): Mapped {
  if (p.m) return p.m;
  let compact = '';
  const at: number[] = [];
  for (let i = 0; i < p.raw.length;) {
    const cp = p.raw.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    if (ch !== ' ') {
      const lc = ch.toLowerCase();
      for (let k = 0; k < lc.length; k++) at.push(i);
      compact += lc;
    }
    i += ch.length;
  }
  p.m = { compact, at };
  return p.m;
}
/** raw[i] 글자의 끝 자리(써로게이트 짝을 가르지 않게) */
const charEnd = (raw: string, i: number) => i + ((raw.codePointAt(i) ?? 0) > 0xffff ? 2 : 1);

// ── 입력 중 보정(마지막 낱말만) ──
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
/** 마지막 글자가 한글(완성 글자 · 자음)이라 입력 중 보정을 해 볼 만한가 */
export function composable(term: string): boolean {
  const k = term.charCodeAt(term.length - 1);
  return isSyllable(k) || (k >= 0x3131 && k <= 0x314e);
}
// 앞부분이 없는 낱말(「곙」)일 때 첫 글자가 될 수 있는 글자 범위: 같은 초성 · 중성 묶음(받침만 다름),
// 받침 없는 글자면 겹모음으로 이어질 중성까지(ㅗ → ㅘ ㅙ ㅚ, ㅜ → ㅝ ㅞ ㅟ, ㅡ → ㅢ), 자음 하나면 그 초성의 모든 글자
function firstRange(c: string): [number, number] | null {
  const k = c.charCodeAt(0);
  if (isSyllable(k)) {
    const idx = k - 0xac00;
    const cho = Math.floor(idx / 588);
    const jung = Math.floor((idx % 588) / 28);
    const base = 0xac00 + (cho * 21 + jung) * 28;
    if (idx % 28) return [base, base + 28];
    const span = jung === 8 || jung === 13 ? 4 : jung === 18 ? 2 : 1;
    return [base, base + span * 28];
  }
  const ci = CHO.indexOf(c);
  return ci >= 0 ? [0xac00 + ci * 588, 0xac00 + (ci + 1) * 588] : null;
}
const startsWithJamo = (text: string, i: number, d: string) => i < text.length && disassemble(text.slice(i, i + 2)).startsWith(d);
/**
 * 입력 중 보정으로 맞는 자리들(앞에서부터, 겹치지 않게): 마지막 글자 앞부분은 그대로 맞고, 그 뒤 두 글자를 자모로 푼 것이 마지막 글자의 자모로 시작한다.
 * 「계앿」 = 「계」 그대로 + 「약서」의 자모 ㅇㅑㄱㅅㅓ 가 ㅇㅑㄱㅅ 으로 시작. first = 하나만 찾으면 멈춘다.
 */
export function composingAt(text: string, term: string, first = false): number[] {
  const out: number[] = [];
  if (!term || !composable(term)) return out;
  const head = term.slice(0, -1);
  const d = disassemble(term.slice(-1));
  if (head) {
    for (let i = text.indexOf(head); i >= 0; i = text.indexOf(head, i + 1)) {
      if (startsWithJamo(text, i + head.length, d)) { out.push(i); if (first) break; i += head.length; }
    }
    return out;
  }
  const r = firstRange(term);
  if (!r) return out;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    if (k >= r[0] && k < r[1] && startsWithJamo(text, i, d)) { out.push(i); if (first) break; }
  }
  return out;
}

// ── 한 낱말 맞추기 ──
export interface MatchOpts { /** 마지막 낱말이면 입력 중 보정도 */ last?: boolean; /** 제목이면 그 초성 판(초성 낱말용) */ cho?: Cho }
/** 이 필드에 낱말이 있나: 그대로 · 공백 뺀 판 · (제목) 초성 · (마지막 낱말) 입력 중 보정 */
export function fieldHas(p: Prepared, term: string, o: MatchOpts = {}): boolean {
  if (p.norm.includes(term) || p.compact.includes(term)) return true;
  if (o.cho && isChoseongTerm(term) && o.cho.s.includes(term)) return true;
  return !!o.last && composingAt(p.compact, term, true).length > 0;
}

// ── 밑줄 자리 ──
export type Range = [number, number];
/** 겹치거나 맞닿은 자리를 합친다 */
export function mergeRanges(list: Range[]): Range[] {
  const s = [...list].filter((r) => r[1] > r[0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Range[] = [];
  for (const r of s) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}
/**
 * raw 위 밑줄 자리(합친 것). 공백 뺀 판으로 걸린 자리는 원래 글의 그 글자들(사이 공백 포함)에, 초성으로 걸렸으면 그 글자들에,
 * 입력 중 보정으로 걸렸으면 맞은 앞부분 + 다음 글자까지.
 */
export function markRanges(p: Prepared, terms: string[], o: { cho?: Cho; composeLast?: boolean } = {}): Range[] {
  const { compact, at } = mapped(p);
  const out: Range[] = [];
  const span = (a: number, b: number) => out.push([at[a], charEnd(p.raw, at[b])]);
  terms.forEach((t, n) => {
    let hit = false;
    for (let i = compact.indexOf(t); i >= 0 && t; i = compact.indexOf(t, i + t.length)) { span(i, i + t.length - 1); hit = true; }
    if (!hit && o.cho && isChoseongTerm(t)) {
      for (let i = o.cho.s.indexOf(t); i >= 0; i = o.cho.s.indexOf(t, i + t.length)) {
        out.push([o.cho.at[i], charEnd(p.raw, o.cho.at[i + t.length - 1])]);
        hit = true;
      }
    }
    if (!hit && o.composeLast && n === terms.length - 1) {
      for (const i of composingAt(compact, t)) span(i, Math.min(i + t.length - 1, compact.length - 1));
    }
  });
  return mergeRanges(out);
}

/** 조각: 첫 걸린 자리 앞 18자쯤부터(잘렸으면 앞에 「…」). 밑줄 자리도 조각 기준으로 옮긴다. 걸린 데가 없으면 글 앞부분 */
export function snippet(p: Prepared, ranges: Range[], o: { before?: number; max?: number } = {}): { text: string; ranges: Range[] } {
  const before = o.before ?? 18;
  const max = o.max ?? 140;
  const hit = ranges[0]?.[0] ?? 0;
  let start = Math.max(0, hit - before);
  // 낱말 가운데서 시작하지 않게: 8자 안에 띄어쓰기가 있으면 그 뒤부터
  const sp = start > 0 ? p.raw.indexOf(' ', start) : -1;
  if (sp >= 0 && sp < hit && sp - start <= 8) start = sp + 1;
  const k = p.raw.charCodeAt(start);
  if (k >= 0xdc00 && k <= 0xdfff) start -= 1; // 써로게이트 짝 가운데서 자르지 않게
  const lead = start > 0 ? '…' : '';
  let end = Math.min(p.raw.length, start + max);
  const e = p.raw.charCodeAt(end - 1);
  if (end < p.raw.length && e >= 0xd800 && e <= 0xdbff) end -= 1;
  const text = lead + p.raw.slice(start, end);
  const shift = lead.length - start;
  const rs = ranges
    .map((r): Range => [Math.max(r[0] + shift, lead.length), Math.min(r[1] + shift, text.length)])
    .filter((r) => r[1] > r[0]);
  return { text, ranges: rs };
}

// ── 마크다운 기호 빼기(도움말 본문) ──
/** 소제목 · 목록 · 인용 기호, 표의 칸 줄, 가로줄, **굵게**, [글](주소)의 주소, 맨 주소를 뺀 글(줄은 그대로) */
export function stripMarkdown(md: string): string {
  return String(md ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => {
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) return ''; // 가로줄
      if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)) return ''; // 표 머리 밑 줄
      return l
        .replace(/^\s{0,3}(>\s?)+/, '')
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/\s+#+\s*$/, '')
        .replace(/^\s*(?:[-*+•]|\d{1,3}[.)])\s+/, '')
        .replace(/\|/g, ' ');
    })
    .join('\n')
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1')
    .replace(/https?:\/\/[^\s<>()[\]]+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
