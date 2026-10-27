// 새 홈(탭 여섯 개짜리 「한눈에 보기」)이 쓰는 순수 계산. 화면 없이 home-model.test.ts 가 node --test 로 확인한다.
//   지우기만 하면 되는 TS 문법만 쓰고, @/ 경로는 type import 에만 쓴다.
// 데이터 구조(ProgressDoc)는 바꾸지 않는다. 카드는 단계 번호 또는 할 일 제목의 낱말로 고른다.
import type { PhotoView } from '@/lib/core/photos';
import type { ProgressDoc, PropertyItem, QuestionItem, RefItem, TaskItem, TaskKind, UpdateItem } from '@/lib/core/types';

export type TabId = 'docs' | 'interior' | 'photos' | 'airbnb' | 'contacts' | 'news';
export const TABS: { id: TabId; label: string }[] = [
  { id: 'docs', label: '서류' },
  { id: 'interior', label: '인테리어' },
  { id: 'photos', label: '사진' },
  { id: 'airbnb', label: '에어비앤비' },
  { id: 'contacts', label: '연락처' },
  { id: 'news', label: '뉴스' },
];

// ── 뉴스: 사이트에 이미 있는 두 자료(민박업 규정 소식 content/updates.json · 단계별 참고 자료 refs — 고정 + 6시간마다 자동 수집)를 한 목록으로 ──
export interface NewsItem { key: string; title: string; date: string; dateText: string; source: string; url: string; kind: string }
// 구청 공지 · 정책으로 보는 낱말(출처 · 제목). 규정 소식은 모두, 참고 자료는 종류가 「공지」이거나 이 낱말이 있으면
const POLICY = /구청|구 ?보건소|시청|서울시|법무부|국토|문화체육|문체부|관광공사|법령|법안|국회|정부|정책|규정|시행|개정|조례|등록 ?안내|민원/;
function newsDate(d: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(d);
  if (!m) return d;
  return m[3] ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : `${m[1]}년 ${Number(m[2])}월`;
}
/** 구청 · 정책 묶음(먼저)과 그 밖의 기사 · 영상. 각 묶음은 날짜 최근 순, 같은 주소는 한 번만 */
export function newsGroups(updates: UpdateItem[], refs: RefItem[]): { policy: NewsItem[]; other: NewsItem[] } {
  const seen = new Set<string>();
  const policy: NewsItem[] = [];
  const other: NewsItem[] = [];
  const push = (to: NewsItem[], it: NewsItem) => {
    const k = it.url.replace(/[?#].*$/, '').replace(/\/$/, '') || it.key;
    if (seen.has(k)) return;
    seen.add(k);
    to.push(it);
  };
  updates.forEach((u, i) => push(policy, {
    key: `u${i}`, title: u.title, date: u.date, dateText: `${newsDate(u.date)}${u.dateWord ? ` ${u.dateWord}` : ''}`, source: u.source, url: u.url, kind: '규정',
  }));
  refs.forEach((r, i) => {
    const it = { key: `r${i}`, title: r.title, date: r.date, dateText: newsDate(r.date), source: r.source, url: r.url, kind: r.kind };
    push(r.kind === '공지' || POLICY.test(`${r.source} ${r.title}`) ? policy : other, it);
  });
  const recent = (a: NewsItem, b: NewsItem) => b.date.localeCompare(a.date);
  return { policy: policy.sort(recent), other: other.sort(recent) };
}

/**
 * 카드 하나.
 * - steps: 이 카드가 맡는 단계(단계로 고르는 카드) 또는 낱말로 나눌 단계 묶음(낱말 카드).
 * - match: 낱말 카드면 제목에서 찾을 낱말. 없으면 단계로 고르는 카드.
 * - addStep: 이 카드에서 「＋ 할 일 추가」로 더한 할 일이 들어갈 단계.
 * - prefix: 낱말 카드에서 더한 할 일 제목에 카드 낱말이 없으면 앞에 붙이는 말(「욕실: …」) — 저장한 뒤에도 같은 카드에 남게.
 *   제목이 「prefix:」로 시작하면 다른 낱말보다 먼저 그 카드로 간다.
 * - kind: 이 할 일 종류면 (앞 카드 낱말에 안 걸렸을 때) 이 카드로.
 * - fixedWords: 고정 일정(집 정보 「고정 · 」 줄) 설명에 이 낱말이 있으면 그 날을 카드 마감으로.
 * - sub: 카드 제목 밑 한 줄 설명.
 */
export interface CardDef {
  id: string; title: string; steps: number[]; addStep: number;
  match?: RegExp; prefix?: string; kind?: TaskKind; fixedWords?: string[]; sub?: string;
}

// ── 서류: 단계로 고른다 ──
export const DOC_CARDS: CardDef[] = [
  { id: 'move-in', title: '전입신고', steps: [4], addStep: 4, fixedWords: ['전입'] },
  { id: 'register', title: '외도민 등록 서류', steps: [5, 9], addStep: 9, fixedWords: ['등록 신청', '신청', '접수'], sub: '구청에 내는 서류' },
  { id: 'safety', title: '안전 설비', steps: [8], addStep: 8, sub: '소화기 · 화재감지기처럼 꼭 사야 할 것' },
  { id: 'inspect', title: '현장 실사', steps: [12], addStep: 12, sub: '구청에서 집을 보러 오는 날' },
  { id: 'biz', title: '사업자 등록', steps: [13], addStep: 13 },
];
/** 서류 탭 맨 아래 「끝난 일」로 접어 두는 단계(집 고르기 · 구청 확인 · 계약) */
export const DONE_STEPS = [1, 2, 3];

// 「문」 한 글자는 「주문 · 문의 · 방문」과 헷갈리므로 앞뒤가 띄어쓰기 · 문장부호일 때만(또는 문짝 · 문고리 · 현관문 · 중문)
const DOOR = /(^|[\s:·,(\]])문(?=$|[\s:·,)]|짝|고리|틀)|현관문|중문|방문 ?교체|도어/;

// ── 인테리어: 6 · 7단계 할 일을 낱말로 나눈다(위 카드부터 먼저 고른다) ──
export const INTERIOR_CARDS: CardDef[] = [
  { id: 'bath', title: '욕실', steps: [6, 7], addStep: 7, prefix: '욕실', match: /욕실|화장실|세면|변기|샤워|수전|욕조|줄눈|타일/ },
  { id: 'wall', title: '도배 · 장판 · 문', steps: [6, 7], addStep: 7, prefix: '도배 · 장판', match: new RegExp(`도배|장판|벽지|페인트|몰딩|바닥재|${DOOR.source}`) },
  { id: 'aircon', title: '에어컨', steps: [6, 7], addStep: 6, prefix: '에어컨', match: /에어컨|냉난방|실외기/ },
  { id: 'light', title: '조명', steps: [6, 7], addStep: 7, prefix: '조명', match: /조명|스위치|콘센트|전등|등기구|전구|천장등|벽등|램프/ },
  { id: 'buy', title: '살 것', steps: [6, 7], addStep: 6, prefix: '살 것', kind: '구매', sub: '가구 · 가전 · 커튼 같은 구매 목록',
    match: /구매|주문|구입|사기|살 것|가구|침대|매트리스|소파|식탁|의자|커튼|침구|이불|냉장고|세탁기|선반|거울/ },
  { id: 'other', title: '그 밖에', steps: [6, 7], addStep: 7 },
];

// ── 에어비앤비 준비: 10 · 11 · 14단계 할 일을 낱말로 ──
export const AIRBNB_CARDS: CardDef[] = [
  { id: 'listing', title: '숙소 이름 · 가격 정하기', steps: [10, 11, 14], addStep: 11, prefix: '숙소', match: /이름|가격|요금|리스팅|숙소 설명|소개글/ },
  { id: 'guide', title: '손님 안내서', steps: [10, 11, 14], addStep: 11, prefix: '안내서', sub: '와이파이 · 체크인 방법 같은 것', match: /안내|가이드|매뉴얼|하우스 ?룰|체크인|체크아웃|와이파이/ },
  { id: 'supplies', title: '소모품 사기', steps: [10, 11, 14], addStep: 14, prefix: '소모품', kind: '구매', sub: '휴지 · 수건 같은 생활용품',
    match: /휴지|수건|소모품|생활용품|어메니티|샴푸|린스|바디|세제|비누|칫솔|치약|봉투|슬리퍼|비품/ },
  { id: 'other', title: '그 밖에', steps: [10, 11, 14], addStep: 10 },
];

const live = (t: TaskItem) => !t.deletedAt;
const startsWithPrefix = (text: string, prefix: string) => new RegExp(`^\\s*${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：]`).test(text);

/** 낱말 카드 묶음에서 이 할 일이 들어갈 카드 id. 묶음 안 단계가 아니면 null */
export function pickCard(cards: CardDef[], t: Pick<TaskItem, 'text' | 'stepId' | 'kind'>): string | null {
  if (!cards[0]?.steps.includes(t.stepId)) return null;
  const byPrefix = cards.find((c) => c.prefix && startsWithPrefix(t.text, c.prefix));
  if (byPrefix) return byPrefix.id;
  const byWord = cards.find((c) => c.match?.test(t.text));
  if (byWord) return byWord.id;
  const byKind = cards.find((c) => c.kind && t.kind === c.kind);
  if (byKind) return byKind.id;
  return cards.find((c) => !c.match)?.id ?? null;
}

/** 낱말 카드에서 새 할 일을 더할 때: 제목이 이 카드로 안 가면 앞에 「prefix: 」를 붙이고, 카드 종류가 있으면 그 종류로 */
export function prepareAdd(cards: CardDef[], card: CardDef, text: string, kind: TaskKind | ''): { text: string; kind: TaskKind | '' } {
  const k = kind || card.kind || '';
  if (!card.match) return { text, kind: k };
  const goes = pickCard(cards, { text, stepId: card.addStep, kind: k || null });
  if (goes === card.id || !card.prefix) return { text, kind: k };
  return { text: `${card.prefix}: ${text}`, kind: k };
}

/**
 * 카드마다 할 일(맨 위 할 일만 카드를 고르고, 세부 항목은 부모를 따라간다).
 * 단계로 고르는 카드는 stepId 로, 낱말 카드는 pickCard 로.
 */
export function tasksByCard(doc: Pick<ProgressDoc, 'tasks'>, cards: CardDef[]): Record<string, TaskItem[]> {
  const out: Record<string, TaskItem[]> = Object.fromEntries(cards.map((c) => [c.id, []]));
  const all = Object.values(doc.tasks).filter(live);
  const keyword = cards.some((c) => c.match);
  const cardOf = new Map<string, string>();
  for (const t of all) {
    if (t.parentId) continue;
    const id = keyword ? pickCard(cards, t) : cards.find((c) => c.steps.includes(t.stepId))?.id ?? null;
    if (id) cardOf.set(t.id, id);
  }
  for (const t of all) {
    const id = t.parentId ? cardOf.get(t.parentId) : cardOf.get(t.id);
    if (id) out[id].push(t);
  }
  return out;
}

/** 할 일 줄 세우기: 마감 이른 순(마감 없는 것은 뒤), 같으면 만든 순 */
export const byDue = (a: TaskItem, b: TaskItem) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt.localeCompare(b.createdAt);

// ── 날짜 ──
const toDate = (iso: string) => new Date(`${iso}T00:00:00`);
export const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86400000);
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
/** 「2026-11-09」 → { md: '11/9', wd: '월' } */
export function dateParts(iso: string): { md: string; wd: string } {
  const [, m, d] = iso.split('-');
  return { md: `${Number(m)}/${Number(d)}`, wd: WEEK[toDate(iso).getDay()] };
}
/** 남은 날 말: 지났으면 「n일 지남」, 오늘이면 「오늘」, 아니면 「D-n」. tone = late(빨강) · soon(다음 7일 안 — 강조색) · later */
export function relDay(iso: string, today: string): { text: string; tone: 'late' | 'soon' | 'later' } {
  const n = daysBetween(today, iso);
  if (n < 0) return { text: `${-n}일 지남`, tone: 'late' };
  if (n === 0) return { text: '오늘', tone: 'soon' };
  return { text: `D-${n}`, tone: n <= 6 ? 'soon' : 'later' };
}

/** 고정 일정: 집 정보 중 이름이 「고정 · 」으로 시작하고 값이 「YYYY-MM-DD 설명」인 줄 */
export function fixedDates(property: Record<string, PropertyItem>): { date: string; text: string }[] {
  return Object.values(property)
    .filter((p) => !p.deletedAt && p.label.startsWith('고정 · '))
    .map((p) => { const m = /^(\d{4}-\d{2}-\d{2})\s*(.*)$/.exec(p.value.trim()); return m ? { date: m[1], text: `${p.label.slice(5)} ${m[2]}` } : null; })
    .filter((x): x is { date: string; text: string } => !!x)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface CardSummary {
  total: number; done: number; late: number; soon: number;
  /** 카드 마감(이날까지 꼭). null = 날짜 없음 */
  deadline: string | null;
  /** 할 일이 있고 다 끝냈거나, 맡은 단계가 다 「완료」 */
  finished: boolean;
}

/**
 * 카드 요약. 마감은
 *  1) 단계로 고르는 카드: 고정 일정 설명에 fixedWords 가 있으면 그 날 → 맡은 단계 목표일 중 가장 늦은 날 → 안 끝난 할 일 마감 중 가장 늦은 날
 *  2) 낱말 카드: 안 끝난 할 일 마감 중 가장 늦은 날(없으면 날짜 없음)
 */
export function summarize(card: CardDef, tasks: TaskItem[], doc: Pick<ProgressDoc, 'steps' | 'property'>, today: string): CardSummary {
  const open = tasks.filter((t) => !t.done);
  const late = open.filter((t) => t.due && daysBetween(today, t.due) < 0).length;
  const soon = open.filter((t) => t.due && daysBetween(today, t.due) >= 0 && daysBetween(today, t.due) <= 6).length;
  const lastDue = open.map((t) => t.due).filter((d): d is string => !!d).sort().pop() ?? null;
  let deadline: string | null = null;
  if (!card.match) {
    const fixed = card.fixedWords ? fixedDates(doc.property).find((f) => card.fixedWords!.some((w) => f.text.includes(w))) : undefined;
    const targets = card.steps.map((s) => doc.steps[String(s)]?.targetDate).filter((d): d is string => !!d).sort();
    deadline = fixed?.date ?? targets.pop() ?? lastDue;
  } else {
    deadline = lastDue;
  }
  const stepsDone = !card.match && card.steps.every((s) => doc.steps[String(s)]?.status === 'done');
  const finished = stepsDone || (tasks.length > 0 && open.length === 0);
  return { total: tasks.length, done: tasks.length - open.length, late, soon, deadline, finished };
}

/** 카드 순서: 안 끝난 카드 중 마감 이른 순 → 날짜 없는 카드 → 다 끝낸 카드(각 묶음 안에서는 정의 순서) */
export function sortCards(cards: CardDef[], sums: Record<string, Pick<CardSummary, 'deadline' | 'finished'>>): CardDef[] {
  const rank = (c: CardDef) => (sums[c.id].finished ? 2 : sums[c.id].deadline ? 0 : 1);
  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || (sums[a.c.id].deadline ?? '').localeCompare(sums[b.c.id].deadline ?? '') || a.i - b.i)
    .map((x) => x.c);
}

/** 「3개 중 1개 끝」 */
export function progressText(s: Pick<CardSummary, 'total' | 'done'>): string {
  if (s.total === 0) return '할 일 없음';
  if (s.done === s.total) return `${s.total}개 다 끝`;
  return `${s.total}개 중 ${s.done}개 끝`;
}

/** 탭 하나의 「기한 지남 · 다음 7일」 개수(탭 이름 옆 빨강 점, 탭 맨 위 한 줄) */
export function tabCounts(groups: Record<string, TaskItem[]>, today: string): { late: number; soon: number } {
  let late = 0, soon = 0;
  for (const list of Object.values(groups)) {
    for (const t of list) {
      if (t.done || !t.due) continue;
      const n = daysBetween(today, t.due);
      if (n < 0) late += 1; else if (n <= 6) soon += 1;
    }
  }
  return { late, soon };
}

// ── 구청에 물어볼 것: 받는 사람에 「구청」이 든 질문 중 답 기다림 ──
export const isGuQuestion = (q: QuestionItem) => !q.deletedAt && q.to.includes('구청');
export function guQuestions(doc: Pick<ProgressDoc, 'questions'>): QuestionItem[] {
  return Object.values(doc.questions ?? {}).filter((q) => isGuQuestion(q) && q.status === 'open').sort((a, b) => a.seq - b.seq);
}

// ── 사진: 우리 집 사진만 ──
/** 공사 후 칸: 묶음 이름이 「공사 후」 */
export const AFTER_ALBUM = '공사 후';
// 설명 · 묶음 이름에 이 낱말이 있으면 우리 집 사진이 아니라고 본다(참고 · 다른 집 · 시안 · 서류 캡처)
const NOT_HOUSE = /참고|아님|다른 ?집|시안|예시 ?사진|등기|계약서|건축물|대장|서류|캡처|캡쳐|스크린샷|영수증|도면|평면도|문서|안내문/;

/** 집 정보 「주소」 값에 든 호수(예: 「…101호」 → ['101']). 사진 설명에 다른 호수가 나오면 다른 집으로 본다 */
export function ourUnits(property: Record<string, PropertyItem>): string[] {
  const units = new Set<string>();
  for (const p of Object.values(property)) {
    if (p.deletedAt || !p.label.includes('주소')) continue;
    for (const m of p.value.matchAll(/(\d+)\s*호/g)) units.add(m[1]);
  }
  return [...units];
}

/**
 * 우리 집 사진만 공사 전 · 후로 나눈다.
 * 빼는 것: PDF, 참고 사진(stepId 0), 설명 · 묶음 이름에 NOT_HOUSE 낱말, 우리 호수가 아닌 「n호」.
 */
export function housePhotos(photos: PhotoView[], units: string[]): { before: PhotoView[]; after: PhotoView[]; hidden: number } {
  const before: PhotoView[] = [];
  const after: PhotoView[] = [];
  let hidden = 0;
  for (const p of photos) {
    if (p.deletedAt) continue;
    const text = `${p.album}\n${p.caption}`;
    const otherUnit = [...text.matchAll(/(\d+)\s*호/g)].some((m) => !units.includes(m[1]));
    if (p.kind !== 'image' || p.stepId === 0 || NOT_HOUSE.test(text) || otherUnit) { hidden += 1; continue; }
    (p.album.trim() === AFTER_ALBUM ? after : before).push(p);
  }
  return { before, after, hidden };
}

// ── 연락처: 집 정보 중 이름이 「연락처 · 」으로 시작하는 줄 ──
export const CONTACT_PREFIX = '연락처 · ';
const PHONE = /(?<![\d-])(0\d{1,2}-\d{3,4}-\d{4}|1[5-9]\d{2}-\d{4}|01\d{8,9})(?![\d-])/;
export interface Contact { item: PropertyItem; name: string; phone: string | null; work: string }
export function parseContact(p: PropertyItem): Contact {
  const name = p.label.slice(CONTACT_PREFIX.length).trim();
  const phone = PHONE.exec(p.value)?.[1] ?? null;
  const rest = (phone ? p.value.replace(phone, '') : p.value).split('·').map((s) => s.trim()).filter(Boolean).join(' · ');
  return { item: p, name, phone, work: rest };
}
export function contacts(property: Record<string, PropertyItem>): Contact[] {
  return Object.values(property)
    .filter((p) => !p.deletedAt && p.label.startsWith(CONTACT_PREFIX))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(parseContact);
}
/** 고치기 폼 → 집 정보 한 줄 */
export function contactToProperty(name: string, phone: string, work: string): { label: string; value: string } {
  return { label: `${CONTACT_PREFIX}${name.trim()}`, value: [phone.trim(), work.trim()].filter(Boolean).join(' · ') };
}
export const telOf = (phone: string) => `tel:${phone.replace(/-/g, '')}`;
