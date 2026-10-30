// 할 일 메모 안 체크리스트(순수 함수 — 화면 없음). 데이터 모양은 그대로: 메모(note) 글 한 칸 안의 줄 중
//   `- [ ] 글` · `- [x] 글`(x 는 대소문자 둘 다, `-` 대신 `*` · `+` 도)을 항목으로 본다. 그 밖의 줄(전화 · 멘트 · 「- 」 질문 줄)은 지금처럼 글.
// 메모 글이 곧 정본이라 Todoist 설명 동기화 · 검색 · progress.mjs export-md(☐ · ☑) 가 따로 손댈 것 없이 따라간다.
// 날짜 · 담당이 없는 가벼운 장보기 목록용 — 날짜 · 간트 줄이 있는 「세부 항목」(parentId)과는 다르다.
// 지우기만 하면 되는 TS 문법만 쓴다(checklist.test.ts 가 node --test 로 바로 읽는다).

export interface CheckItem { line: number; text: string; done: boolean }
/** 메모를 그리는 조각: 글 줄 묶음 · 이어진 체크 줄 묶음(메모 순서 그대로) */
export type MemoPart = { t: 'text'; lines: string[] } | { t: 'check'; items: CheckItem[] };
/** 항목을 다시 찾는 표: 같은 글 항목 중 몇 번째인가(그 사이 다른 사람이 메모를 고쳐 줄 번호가 바뀌어도 찾게) */
export interface ItemRef { text: string; nth: number }

const CHECK = /^(\s*[-*+]\s+\[)([ xX])\](?:\s+(.*?))?\s*$/;

/** 한 줄이 체크 줄이면 { 글, 체크 } — 글이 비면 항목이 아니다 */
export function checkLine(line: string): { text: string; done: boolean } | null {
  const m = CHECK.exec(line);
  const text = m?.[3]?.trim();
  return m && text ? { text, done: m[2] !== ' ' } : null;
}

const linesOf = (note: string | null | undefined) => String(note ?? '').split('\n');

export function checkItems(note: string | null | undefined): CheckItem[] {
  const out: CheckItem[] = [];
  linesOf(note).forEach((l, line) => { const c = checkLine(l); if (c) out.push({ line, ...c }); });
  return out;
}

/** 메모 → 그릴 조각(빈 줄은 건너뛴다 — 지금 메모 그리기와 같이 줄마다 한 문단) */
export function memoParts(note: string | null | undefined): MemoPart[] {
  const out: MemoPart[] = [];
  linesOf(note).forEach((l, line) => {
    const c = checkLine(l);
    const last = out[out.length - 1];
    if (c) {
      if (last?.t === 'check') last.items.push({ line, ...c }); else out.push({ t: 'check', items: [{ line, ...c }] });
    } else if (l.trim()) {
      if (last?.t === 'text') last.lines.push(l.trim()); else out.push({ t: 'text', lines: [l.trim()] });
    }
  });
  return out;
}

export function refOf(items: CheckItem[], i: number): ItemRef {
  const text = items[i].text;
  return { text, nth: items.slice(0, i).filter((x) => x.text === text).length };
}

function find(items: CheckItem[], ref: ItemRef): CheckItem | null {
  const same = items.filter((x) => x.text === ref.text);
  return same[ref.nth] ?? same[0] ?? null;
}

/** 그 항목만 체크 / 해제한 새 메모(다른 줄은 글자 하나 안 바꾼다). 항목이 없어졌으면 null */
export function setItem(note: string | null | undefined, ref: ItemRef, done: boolean): string | null {
  const ls = linesOf(note);
  const hit = find(checkItems(note), ref);
  if (!hit) return null;
  ls[hit.line] = ls[hit.line].replace(/^(\s*[-*+]\s+\[)[ xX]\]/, `$1${done ? 'x' : ' '}]`);
  return ls.join('\n');
}

/** 항목 하나 더한 새 메모: 마지막 체크 줄 바로 밑(체크 줄이 없으면 메모 맨 끝). 글이 비면 null */
export function addItem(note: string | null | undefined, text: string): string | null {
  const v = text.replace(/\s+/g, ' ').trim();
  if (!v) return null;
  const row = `- [ ] ${v}`;
  const items = checkItems(note);
  if (!items.length) {
    const body = String(note ?? '').trimEnd();
    return body ? `${body}\n${row}` : row;
  }
  const ls = linesOf(note);
  ls.splice(items[items.length - 1].line + 1, 0, row);
  return ls.join('\n');
}

// ── 편집 폼 메모 칸(고치는 폼 · 새 할 일 폼 · 간트 편집 폼): 기호 `- [ ] ` · `- [x] ` 대신 「☐ 」 · 「☑ 」로 보인다 ──
// 폼에 띄울 때만 바꾸고(toFormNote) 저장할 때 되돌린다(cleanNote). 저장되는 메모 모양(Todoist 설명 · 내보내기 · CLI)은 그대로 `- [ ] ` · `- [x] `.
// 폼에서 「☐」 · 「☑」를 직접 쳐도(줄 맨 앞) 체크 항목으로 저장한다. 폼에 `- [ ] ` 을 그대로 쳐도 그대로 체크 항목.
const STORED_BOX = /^(\s*)[-*+]\s+\[([ xX])\](?=\s|$)[ \t]*/;
const FORM_BOX = /^(\s*)([☐☑])[ \t]*/;

/** 저장된 메모 → 폼 메모 칸 글: 체크 줄 머리 `- [ ] ` → 「☐ 」, `- [x] ` · `- [X] ` → 「☑ 」(다른 줄은 글자 하나 안 바꾼다) */
export function toFormNote(note: string | null | undefined): string {
  return linesOf(note).map((l) => l.replace(STORED_BOX, (_m, sp: string, x: string) => `${sp}${x === ' ' ? '☐' : '☑'} `)).join('\n');
}

/** 폼 메모 칸 글 → 저장 모양: 줄 맨 앞 「☐」 → `- [ ] `, 「☑」 → `- [x] `(다른 줄은 그대로) */
export function fromFormNote(text: string): string {
  return text.split('\n').map((l) => l.replace(FORM_BOX, (_m, sp: string, b: string) => `${sp}- [${b === '☑' ? 'x' : ' '}] `)).join('\n');
}

/** 폼 메모 칸 글자 수 한도: 저장 모양(☐ → `- [ ] `)이 서버 한도(max)를 넘지 않게, 체크 줄이 늘린 만큼 줄인다 */
export function formNoteMax(text: string, max: number): number {
  return max - (fromFormNote(text).length - text.length);
}

/** 폼에서 저장할 메모: 저장 모양으로 되돌리고(fromFormNote), 글 없이 남은 체크 줄(「＋ 체크 항목」만 누르고 안 쓴 「☐ 」 줄)을 빼고 앞뒤 공백을 지운다 */
export function cleanNote(note: string): string {
  return fromFormNote(note).split('\n').filter((l) => !/^\s*[-*+]\s+\[[ xX]\]\s*$/.test(l)).join('\n').trim();
}

/** 폼 메모 칸 글의 체크 줄인가(「☐ 글」 · 「☑ 글」, 또는 직접 친 `- [ ] 글`) */
const formCheck = (l: string) => /^\s*[☐☑][ \t]*\S/.test(l) || !!checkLine(l);

/**
 * 편집 폼 「＋ 체크 항목」: 폼 메모 칸 글(toFormNote 모양)에 빈 체크 줄 「☐ 」 하나를 넣은 새 글과 커서 자리(그 줄 끝).
 * 체크 줄이 있으면 마지막 체크 줄 바로 밑, 없으면 메모 끝(메모가 비었으면 첫 줄). 메모 끝의 빈 줄 · 공백은 걷어 낸다.
 */
export function insertCheckLine(note: string): { note: string; caret: number } {
  const row = '☐ ';
  const ls = note.split('\n');
  let last = -1;
  ls.forEach((l, i) => { if (formCheck(l)) last = i; });
  if (last < 0) {
    const body = note.trimEnd();
    const next = body ? `${body}\n${row}` : row;
    return { note: next, caret: next.length };
  }
  ls.splice(last + 1, 0, row);
  const caret = ls.slice(0, last + 2).join('\n').length;
  return { note: ls.join('\n'), caret };
}

/**
 * 접힌 할 일 줄의 메모 줄: 체크리스트가 있으면 { 글, 끝낸 수, 전체 수 }, 없으면 null(지금 그대로 메모 첫 줄).
 * 메모 첫 줄이 글이면 그 글, 첫 줄이 체크 줄이면 아직 안 끝낸 항목들을 「, 」로 이은 것(「화장지, 수건, …」 — 항목 안 「·」와 헷갈리지 않게.
 * 다 끝냈으면 빈 글 — 부른 쪽이 「모두 체크했어요」를 띄운다).
 */
export function memoSummary(note: string | null | undefined): { text: string; done: number; total: number } | null {
  const items = checkItems(note);
  if (!items.length) return null;
  const first = linesOf(note).find((l) => l.trim()) ?? '';
  const text = checkLine(first) ? items.filter((x) => !x.done).map((x) => x.text).join(', ') : first.trim();
  return { text, done: items.filter((x) => x.done).length, total: items.length };
}

// ── 저장: 화면에서 한 일(체크 하나 · 항목 하나 더하기)을 「바꿀 것」으로 들고 있다가 그 순간의 메모에 다시 적용한다 ──
// 메모 전체를 보내므로 그 사이 다른 사람이 메모를 고쳤으면 서버가 409(version 다름)로 막는다. 그때 최신 메모에 같은 바꿀 것만 다시 적용해
// 보낸다(retryOnConflict) — 상대가 체크한 줄을 내 옛 메모로 덮어 지우지 않는다. 체크는 「뒤집기」가 아니라 「이 값으로」라 두 사람이 같은 줄을 동시에 체크해도 그대로 체크.
export type CheckChange = { t: 'set'; ref: ItemRef; done: boolean } | { t: 'add'; text: string };
export interface NoteOp { op: 'task.update'; id: string; baseVersion: number; patch: { note: string } }

export function applyChange(note: string | null | undefined, ch: CheckChange): string | null {
  return ch.t === 'set' ? setItem(note, ch.ref, ch.done) : addItem(note, ch.text);
}

/** 할 일(지금 메모 · version)에 바꿀 것을 적용한 저장 연산. 적용할 곳이 없으면(항목이 지워짐 · 빈 글) null */
export function noteOp(id: string, cur: { note?: unknown; version?: unknown }, ch: CheckChange): NoteOp | null {
  const note = applyChange(typeof cur.note === 'string' ? cur.note : '', ch);
  return note == null ? null : { op: 'task.update', id, baseVersion: Number(cur.version) || 0, patch: { note } };
}

/** 409 를 받으면 서버 최신 할 일(current)로 다시 만든 연산 — max 번까지, 그 뒤 · 적용할 곳이 없으면 null(부른 쪽이 되돌리고 알린다) */
export function retryOnConflict(id: string, ch: CheckChange, max = 3): (current: Record<string, unknown>) => NoteOp | null {
  let tries = 0;
  return (current) => (++tries > max ? null : noteOp(id, current, ch));
}

/** 검색 조각용: 체크 줄의 `- [ ] ` 표시만 뺀 메모 */
export function plainMemo(note: string | null | undefined): string {
  return linesOf(note).map((l) => checkLine(l)?.text ?? l).join('\n');
}
