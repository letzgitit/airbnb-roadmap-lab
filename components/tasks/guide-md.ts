// 할 일 참고(설명서) 마크다운 → 블록 목록. 화면(TaskGuide.tsx)은 이 결과만 React 요소로 그린다 — HTML 문자열을 만들지 않는다(넣은 글이 태그로 실행되지 않게).
// 지우기만 하면 되는 TS 문법만 쓴다(guide-md.test.ts 가 node --test 로 바로 읽는다).
//
// 받는 모양(부부가 폼에서 직접 쓰는 정도만):
//   # · ## 소제목 → 큰 소제목, ### 이하 → 작은 소제목
//   - · * · • 점 목록, 1. · 1) 번호 목록(목록 안 줄을 두 칸 이상 들여 쓰면 앞 항목에 이어 붙음)
//   > 인용 → 「알아 두기」 상자(안에 목록 · 굵은 글씨도 됨)
//   | 표 | (둘째 줄이 |---|---| 이면 첫 줄이 머리)
//   --- 가로줄, **굵게**, [글](https://…) 링크, 맨 주소(https://…), 문단 안 줄바꿈은 그대로 줄바꿈
// 링크는 http · https · tel · mailto 만 링크로 만들고 나머지는 글자로 둔다.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'br' }
  | { t: 'b'; c: Inline[] }
  | { t: 'a'; href: string; host: string; c: Inline[] };

export type Block =
  | { t: 'h'; level: 1 | 2; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; start: number; items: Inline[][] }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'table'; head: Inline[][] | null; rows: Inline[][][] }
  | { t: 'hr' };

const SAFE_HREF = /^(https?:\/\/|tel:|mailto:)/i;

/** 링크 옆에 작게 보일 곳 이름: 「www.」를 뺀 도메인, 전화 · 메일은 빈 글 */
export function hostOf(href: string): string {
  if (!/^https?:/i.test(href)) return '';
  try { return new URL(href).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// **굵게** · [글](주소) · 맨 주소(끝의 문장부호 · 닫는 괄호는 주소에서 뺀다)
const INLINE = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()\[\]]*[^\s<>()\[\].,!?'"」』:;])/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const pushText = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last && last.t === 'text') last.v += v; else out.push({ t: 'text', v });
  };
  let at = 0;
  for (const m of src.matchAll(INLINE)) {
    const i = m.index ?? 0;
    pushText(src.slice(at, i));
    at = i + m[0].length;
    if (m[1] !== undefined) out.push({ t: 'b', c: parseInline(m[1]) });
    else if (m[2] !== undefined) {
      const href = m[3];
      if (SAFE_HREF.test(href)) out.push({ t: 'a', href, host: hostOf(href), c: parseInline(m[2]) });
      else pushText(m[2]);
    } else if (m[4] !== undefined) out.push({ t: 'a', href: m[4], host: '', c: [{ t: 'text', v: m[4] }] });
  }
  pushText(src.slice(at));
  return out;
}

/** 문단 줄들: 줄마다 inline, 사이에 줄바꿈 */
function lines(ls: string[]): Inline[] {
  const out: Inline[] = [];
  ls.forEach((l, i) => { if (i) out.push({ t: 'br' }); out.push(...parseInline(l.trim())); });
  return out;
}

const RE_H = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_UL = /^\s{0,3}[-*+•]\s+(.*)$/;
const RE_OL = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;
const RE_QUOTE = /^\s{0,3}>\s?(.*)$/;
const RE_HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const RE_TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const RE_INDENT = /^(\s{2,}|\t)\S/;
const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => parseInline(c.trim()));

export function parseGuide(src: string): Block[] {
  const ls = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ t: 'p', c: lines(para) }); para = []; } };

  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    if (!l.trim()) { flush(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = RE_H.exec(l))) { flush(); out.push({ t: 'h', level: m[1].length <= 2 ? 1 : 2, c: parseInline(m[2]) }); continue; }
    if (RE_HR.test(l)) { flush(); out.push({ t: 'hr' }); continue; }
    if (RE_QUOTE.test(l)) {
      flush();
      const inner: string[] = [];
      for (; i < ls.length; i++) {
        const q = RE_QUOTE.exec(ls[i]);
        if (!q) break;
        inner.push(q[1]);
      }
      i--;
      out.push({ t: 'quote', blocks: parseGuide(inner.join('\n')) });
      continue;
    }
    if (isRow(l) && i + 1 < ls.length && (RE_TABLE_SEP.test(ls[i + 1]) || isRow(ls[i + 1]))) {
      flush();
      const head = RE_TABLE_SEP.test(ls[i + 1]) ? cells(l) : null;
      let j = head ? i + 2 : i;
      const rows: Inline[][][] = [];
      while (j < ls.length && isRow(ls[j])) { if (!RE_TABLE_SEP.test(ls[j])) rows.push(cells(ls[j])); j++; }
      out.push({ t: 'table', head, rows });
      i = j - 1;
      continue;
    }
    const ul = RE_UL.exec(l);
    const ol = ul ? null : RE_OL.exec(l);
    if (ul || ol) {
      flush();
      const kind = ul ? 'ul' : 'ol';
      const items: string[][] = [];
      const start = ol ? Number(ol[1]) : 1;
      let j = i;
      for (; j < ls.length; j++) {
        const x = ls[j];
        const mu = RE_UL.exec(x);
        const mo = mu ? null : RE_OL.exec(x);
        if (kind === 'ul' && mu) { items.push([mu[1]]); continue; }
        if (kind === 'ol' && mo) { items.push([mo[2]]); continue; }
        // 들여 쓴 줄은 앞 항목에 이어 붙인다
        if (RE_INDENT.test(x) && !mu && !mo && items.length) { items[items.length - 1].push(x.trim()); continue; }
        break;
      }
      out.push(kind === 'ul' ? { t: 'ul', items: items.map(lines) } : { t: 'ol', start, items: items.map(lines) });
      i = j - 1;
      continue;
    }
    para.push(l);
  }
  flush();
  return out;
}

/** 소제목 글자만(시트 안 목차 · 시험용) */
export function plainText(c: Inline[]): string {
  return c.map((x) => (x.t === 'text' ? x.v : x.t === 'br' ? '\n' : plainText(x.c))).join('');
}
