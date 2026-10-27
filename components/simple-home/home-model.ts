// 새 홈(간단히 보기 — 분야 탭 여섯 개)이 쓰는 순수 계산. 화면 없이 home-model.test.ts 가 node --test 로 확인한다.
//   지우기만 하면 되는 TS 문법만 쓰고, @/ 경로는 type import 에만 쓴다.
// 데이터 구조(ProgressDoc)는 바꾸지 않는다. 블록(예전 이름 「카드」)은 단계 번호 또는 할 일 제목의 낱말로 고른다.
import type { PhotoView } from '@/lib/core/photos';
import type { ProgressDoc, PropertyItem, QuestionItem, TaskItem, TaskKind } from '@/lib/core/types';

// 분야 탭(2026-10-28 다시 짬 — 기획 27): 일터 셋 「행정 · 설비 · 운영」 + 「갤러리 · 연락처 · 달력」. 글자 탭(아이콘 없음 — 데일리 .tab), 390px 폰에서 한 줄에 다 든다.
// 행정 = 옛 「서류」(4 · 5 · 8 · 9 · 12 · 13단계 + 끝난 1~3), 설비 = 옛 「인테리어」(6 · 7), 운영 = 옛 「에어비앤비」(10 · 11 · 14), 갤러리 = 옛 「사진」.
export type TabId = 'admin' | 'facility' | 'ops' | 'gallery' | 'contacts' | 'calendar';
export type WorkTabId = 'admin' | 'facility' | 'ops';
export const TABS: { id: TabId; label: string }[] = [
  { id: 'admin', label: '행정' },
  { id: 'facility', label: '설비' },
  { id: 'ops', label: '운영' },
  { id: 'gallery', label: '갤러리' },
  { id: 'contacts', label: '연락처' },
  { id: 'calendar', label: '달력' },
];
export const isWorkTab = (t: TabId): t is WorkTabId => t === 'admin' || t === 'facility' || t === 'ops';

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
 * - short: 달력 칸에 쓰는 짧은 이름(없으면 title). 칸에서는 띄어쓰기 자리에서만 줄을 바꾸므로(keep-all) 한 토막을 네 글자 안으로 띄어 쓴다.
 */
export interface CardDef {
  id: string; title: string; steps: number[]; addStep: number;
  match?: RegExp; prefix?: string; kind?: TaskKind; fixedWords?: string[]; sub?: string; short?: string;
  /** 이름을 그 단계 이름으로 보인다(행정의 1~3단계 블록) */
  stepTitle?: number;
}

// ── 서류: 단계로 고른다 ──
export const DOC_CARDS: CardDef[] = [
  { id: 'move-in', title: '전입신고', short: '전입 신고', steps: [4], addStep: 4, fixedWords: ['전입'] },
  { id: 'register', title: '외도민 등록 서류', short: '등록 서류', steps: [5, 9], addStep: 9, fixedWords: ['등록 신청', '신청', '접수'], sub: '구청에 내는 서류' },
  { id: 'safety', title: '안전 설비', steps: [8], addStep: 8, sub: '소화기 · 화재감지기 등 꼭 살 것' },
  { id: 'inspect', title: '현장 실사', steps: [12], addStep: 12, sub: '구청에서 집을 보러 오는 날' },
  { id: 'biz', title: '사업자 등록', short: '사업자 등록', steps: [13], addStep: 13, sub: '세무서에 하는 신고' },
];
/** 서류 탭 맨 아래 「끝난 일」로 접어 두는 단계(집 고르기 · 구청 확인 · 계약) */
export const DONE_STEPS = [1, 2, 3];

// 「문」 한 글자는 「주문 · 문의 · 방문」과 헷갈리므로 앞뒤가 띄어쓰기 · 문장부호일 때만(또는 문짝 · 문고리 · 현관문 · 중문)
const DOOR = /(^|[\s:·,(\]])문(?=$|[\s:·,)]|짝|고리|틀)|현관문|중문|방문 ?교체|도어/;

// ── 인테리어: 6 · 7단계 할 일을 낱말로 나눈다(위 카드부터 먼저 고른다) ──
export const INTERIOR_CARDS: CardDef[] = [
  { id: 'bath', title: '욕실', steps: [6, 7], addStep: 7, prefix: '욕실', match: /욕실|화장실|세면|변기|샤워|수전|욕조|줄눈|타일/ },
  { id: 'wall', title: '도배 · 장판 · 문', short: '도배', steps: [6, 7], addStep: 7, prefix: '도배 · 장판', match: new RegExp(`도배|장판|벽지|페인트|몰딩|바닥재|${DOOR.source}`) },
  { id: 'aircon', title: '에어컨', steps: [6, 7], addStep: 6, prefix: '에어컨', match: /에어컨|냉난방|실외기/ },
  { id: 'light', title: '조명', steps: [6, 7], addStep: 7, prefix: '조명', match: /조명|스위치|콘센트|전등|등기구|전구|천장등|벽등|램프/ },
  { id: 'buy', title: '살 것', steps: [6, 7], addStep: 6, prefix: '살 것', kind: '구매', sub: '가구 · 가전 · 커튼 같은 구매 목록',
    match: /구매|주문|구입|사기|살 것|가구|침대|매트리스|소파|식탁|의자|커튼|침구|이불|냉장고|세탁기|선반|거울/ },
  { id: 'other', title: '그 밖에', short: '기타 공사', steps: [6, 7], addStep: 7 },
];

// ── 에어비앤비 준비: 10 · 11 · 14단계 할 일을 낱말로 ──
export const AIRBNB_CARDS: CardDef[] = [
  { id: 'listing', title: '숙소 이름 · 가격 정하기', short: '숙소 이름', steps: [10, 11, 14], addStep: 11, prefix: '숙소', match: /이름|가격|요금|리스팅|숙소 설명|소개글/ },
  { id: 'guide', title: '손님 안내서', short: '손님 안내서', steps: [10, 11, 14], addStep: 11, prefix: '안내서', sub: '와이파이 · 체크인 방법 같은 것', match: /안내|가이드|매뉴얼|하우스 ?룰|체크인|체크아웃|와이파이/ },
  { id: 'supplies', title: '소모품 사기', short: '소모품', steps: [10, 11, 14], addStep: 14, prefix: '소모품', kind: '구매', sub: '휴지 · 수건 같은 생활용품',
    match: /휴지|수건|소모품|생활용품|어메니티|샴푸|린스|바디|세제|비누|칫솔|치약|봉투|슬리퍼|비품/ },
  { id: 'other', title: '그 밖에', short: '기타 준비', steps: [10, 11, 14], addStep: 10 },
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
  /** 안 끝난 할 일 중 가장 이른 마감(「가장 급한 일」 고르기 · 표시). 없으면 null */
  nextDue: string | null;
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
  const dues = open.map((t) => t.due).filter((d): d is string => !!d).sort();
  const lastDue = dues[dues.length - 1] ?? null;
  const nextDue = dues[0] ?? null;
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
  return { total: tasks.length, done: tasks.length - open.length, late, soon, deadline, finished, nextDue };
}

/**
 * 블록 순서: 기한 지난 일이 있는 안 끝난 블록 → 그 밖의 안 끝난 블록 중 마감 이른 순 → 날짜 없는 블록 → 다 끝낸 블록
 * (각 묶음 안에서는 마감 이른 순, 같으면 정의 순서). 2026-10-28 「가장 급한 일」 큰 카드는 없앴다.
 */
export function sortCards(cards: CardDef[], sums: Record<string, Pick<CardSummary, 'deadline' | 'finished'> & { late?: number }>): CardDef[] {
  const rank = (c: CardDef) => {
    const s = sums[c.id];
    if (s.finished) return 3;
    if ((s.late ?? 0) > 0) return 0;
    return s.deadline ? 1 : 2;
  };
  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || (sums[a.c.id].deadline ?? '').localeCompare(sums[b.c.id].deadline ?? '') || a.i - b.i)
    .map((x) => x.c);
}

/**
 * 일터 탭의 블록 나누기: open = 단계 블록들(sortCards 순서), done = 맨 위 「완료한 단계 n」 접는 줄 안에 둘 블록.
 * done = 늘 접어 두는 블록(alwaysDone — 행정의 1~3단계) + 다 끝낸 블록(summary.finished), 정의 순서 그대로.
 */
export function splitBlocks(cards: CardDef[], sums: Record<string, Pick<CardSummary, 'deadline' | 'finished'> & { late?: number }>, alwaysDone: string[] = []): { open: CardDef[]; done: CardDef[] } {
  const isDone = (c: CardDef) => alwaysDone.includes(c.id) || sums[c.id]?.finished;
  return { open: sortCards(cards.filter((c) => !isDone(c)), sums), done: cards.filter(isDone) };
}

/** 블록 머리 진행 표시: 「1/3」(할 일이 없으면 빈 글자 — 「할 일 없음」 같은 말은 쓰지 않는다). 화면 읽기 프로그램에는 progressSr 의 긴 말 */
export function progressText(s: Pick<CardSummary, 'total' | 'done'>): string {
  if (s.total === 0) return '';
  return `${s.done}/${s.total}`;
}
/** 「3개 중 1개 완료」(화면 읽기 프로그램용) */
export function progressSr(s: Pick<CardSummary, 'total' | 'done'>): string {
  if (s.total === 0) return '';
  if (s.done === s.total) return `${s.total}개 모두 완료`;
  return `${s.total}개 중 ${s.done}개 완료`;
}

// ── 문의 필요: 할 일 종류 「문의」(묻는 내용은 메모에) ──
export const ASK_KIND = '문의';
export const isAsk = (t: Pick<TaskItem, 'kind'>) => t.kind === ASK_KIND;
/** 거르기 「문의 필요만 보기」: 문의 할 일과, 그 세부 항목 · 그 부모(줄이 고아가 되지 않게)만 남긴다 */
export function askOnly(tasks: TaskItem[]): TaskItem[] {
  const ask = new Set(tasks.filter(isAsk).map((t) => t.id));
  const parents = new Set(tasks.filter((t) => ask.has(t.id) && t.parentId).map((t) => t.parentId as string));
  return tasks.filter((t) => ask.has(t.id) || (t.parentId && ask.has(t.parentId)) || parents.has(t.id));
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

// ── 이번 주 할 일: 행정 · 설비 · 운영 탭 맨 위 블록(PC 는 오른쪽 곁 칸) ──
/**
 * 그 탭의 안 끝난 할 일 중 기한 지남 + 오늘 ~ 6일 뒤 마감(세부 항목 포함). 마감 이른 순(= 기한 지난 것이 먼저), 같으면 만든 순.
 * 모두 보인다(줄이 짧아 개수를 자르지 않는다). isDone = 방금 체크한 줄이 잠깐 제자리를 지키게(useStickyDone).
 */
export function weekTasks(groups: Record<string, TaskItem[]>, today: string, isDone: (t: TaskItem) => boolean = (t) => t.done): { list: TaskItem[]; total: number } {
  const all = Object.values(groups).flat().filter((t) => !isDone(t) && t.due && daysBetween(today, t.due) <= 6).sort(byDue);
  return { list: all, total: all.length };
}

// ── 일터 탭 셋: 블록 정의 · 늘 접는 블록 ──
/** 행정 탭에서 늘 「완료한 단계」 안에 접어 두는 1~3단계 블록(이름은 화면에서 단계 이름으로 — stepTitle) */
export const DONE_CARDS: CardDef[] = DONE_STEPS.map((id) => ({ id: `step-${id}`, title: `${id}단계`, stepTitle: id, steps: [id], addStep: id }));
export const CARD_TABS: { tab: WorkTabId; label: string; cards: CardDef[]; alwaysDone: string[] }[] = [
  { tab: 'admin', label: '행정', cards: [...DOC_CARDS, ...DONE_CARDS], alwaysDone: DONE_CARDS.map((c) => c.id) },
  { tab: 'facility', label: '설비', cards: INTERIOR_CARDS, alwaysDone: [] },
  { tab: 'ops', label: '운영', cards: AIRBNB_CARDS, alwaysDone: [] },
];
export const workTab = (tab: WorkTabId) => CARD_TABS.find((c) => c.tab === tab)!;
export interface CalendarMark { date: string; tab: TabId; tabLabel: string; cardId: string; title: string; short: string; finished: boolean; late: boolean }
/** 행정 · 설비 · 운영 블록 중 마감 날짜가 있는 것(블록 머리 날짜와 같은 값, 늘 접는 1~3단계 블록은 뺀다). 날짜순 → 탭 순서 → 블록 정의 순서 */
export function calendarMarks(doc: Pick<ProgressDoc, 'tasks' | 'steps' | 'property'>, today: string): CalendarMark[] {
  const out: CalendarMark[] = [];
  for (const { tab, label, cards: all, alwaysDone } of CARD_TABS) {
    const cards = all.filter((c) => !alwaysDone.includes(c.id));
    const groups = tasksByCard(doc, cards);
    for (const c of cards) {
      const s = summarize(c, groups[c.id], doc, today);
      if (!s.deadline) continue;
      out.push({ date: s.deadline, tab, tabLabel: label, cardId: c.id, title: c.title, short: c.short ?? c.title, finished: s.finished, late: !s.finished && s.deadline < today });
    }
  }
  // 정렬은 안정 정렬이라 같은 날이면 넣은 순서(탭 · 카드 순서)가 남는다
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** 달력을 처음 열 달: 이번 달에 마감이 있으면 이번 달, 없으면 오늘에서 가장 가까운 마감이 있는 달(같으면 앞날 쪽), 마감이 하나도 없으면 이번 달 */
export function startMonth(marks: Pick<CalendarMark, 'date'>[], today: string): string {
  const here = monthOf(today);
  if (marks.length === 0 || marks.some((m) => monthOf(m.date) === here)) return here;
  const near = [...marks].sort((a, b) => Math.abs(daysBetween(today, a.date)) - Math.abs(daysBetween(today, b.date)) || b.date.localeCompare(a.date))[0];
  return monthOf(near.date);
}

// ── 달력 탭: 날짜마다 할 일(2026-10-28 — 카드 이름 대신 그날 할 일 개수, 날을 누르면 그날 할 일 줄이 바로) ──
export interface DayCount { open: number; done: number }
/** 마감일별 할 일 개수(지우지 않은 모든 할 일 · 세부 항목 포함). open = 안 끝난 것, done = 끝낸 것 */
export function dayCounts(doc: Pick<ProgressDoc, 'tasks'>): Map<string, DayCount> {
  const out = new Map<string, DayCount>();
  for (const t of Object.values(doc.tasks)) {
    if (t.deletedAt || !t.due) continue;
    const c = out.get(t.due) ?? { open: 0, done: 0 };
    if (t.done) c.done += 1; else c.open += 1;
    out.set(t.due, c);
  }
  return out;
}
/** 달력 칸 글자: 안 끝난 일이 있으면 「할 일 3」(지난 날이면 late), 다 끝냈으면 「다 함」, 없으면 null */
export function dayCellText(c: DayCount | undefined, date: string, today: string): { text: string; tone: 'late' | 'open' | 'done' } | null {
  if (!c) return null;
  if (c.open > 0) return { text: `할 일 ${c.open}`, tone: date < today ? 'late' : 'open' };
  if (c.done > 0) return { text: '다 함', tone: 'done' };
  return null;
}
/**
 * 고른 날의 할 일: due = 그날 마감(끝낸 것도 — 줄에서 체크를 풀 수 있게), starting = 그날 시작(언제부터)인데 마감은 다른 날.
 * 둘 다 마감 이른 순 → 만든 순(체크해도 자리가 바뀌지 않게 끝냄 여부로 나누지 않는다).
 */
export function dayTasks(doc: Pick<ProgressDoc, 'tasks'>, date: string): { due: TaskItem[]; starting: TaskItem[] } {
  const all = Object.values(doc.tasks).filter(live);
  return {
    due: all.filter((t) => t.due === date).sort(byDue),
    starting: all.filter((t) => t.start === date && t.due !== date).sort(byDue),
  };
}

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (iso: string, n: number) => { const d = toDate(iso); d.setDate(d.getDate() + n); return isoOf(d); };
/** 그 달 1일(「2026-10-28」 → 「2026-10-01」) */
export const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`;
/** 달 옮기기: 1일 기준으로 n달 */
export const addMonths = (first: string, n: number) => { const d = toDate(first); d.setMonth(d.getMonth() + n, 1); return isoOf(d); };
/** 한 달 달력의 주(일요일 시작 — 일 · 월 · 화 · 수 · 목 · 금 · 토, 2026-10-28 사이트 주인 지시). 주마다 날짜 일곱 개, 앞뒤 달 날짜도 채운다 */
export function monthWeeks(first: string): string[][] {
  const d = toDate(first);
  const last = isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  let sun = addDays(first, -d.getDay());
  const weeks: string[][] = [];
  for (; sun <= last; sun = addDays(sun, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(sun, i)));
  return weeks;
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

// ── 받아 둔 서류(서류 탭): PDF 전부 + 설명 · 묶음 이름에 서류 낱말이 있는 사진. 참고 · 다른 집 · 시안은 서류가 아니다 ──
const DOC_WORDS = /등기|계약서|건축물|대장|서류|캡처|캡쳐|스크린샷|영수증|도면|평면도|문서|안내문|신청서|동의서|증명|등본/;
const NOT_DOC = /참고|다른 ?집|시안|예시 ?사진/;
/** 서류를 올릴 때 묶음 이름(설명에 서류 낱말이 없어도 서류로 잡히게) */
export const DOC_ALBUM = '서류';
export function docPhotos(photos: PhotoView[]): PhotoView[] {
  return photos.filter((p) => {
    if (p.deletedAt) return false;
    const text = `${p.album}\n${p.caption}`;
    return p.kind === 'pdf' || (DOC_WORDS.test(text) && !NOT_DOC.test(text));
  });
}
/** 단계별 묶음(단계 번호 순, 0 = 단계 없음은 맨 뒤). 묶음 안은 받은 순서 그대로 */
export function docGroups(list: PhotoView[]): { stepId: number; items: PhotoView[] }[] {
  const m = new Map<number, PhotoView[]>();
  for (const p of list) m.set(p.stepId, [...(m.get(p.stepId) ?? []), p]);
  return [...m.entries()].sort(([a], [b]) => (a === 0 ? 99 : a) - (b === 0 ? 99 : b)).map(([stepId, items]) => ({ stepId, items }));
}

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
