// 질문 · 손님 링크: 병합 엔진(engine.ts)이 부르는 연산과, 손님 화면(/q/<token>)에 내보낼 값.
// 엔진과 같이 Node 에서 바로 읽히도록 지우기만 하면 되는 TS 문법만 쓴다.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Op } from './validate.ts';
import type { GuestLink, ProgressDoc, QuestionAnswer, QuestionItem, QuestionStatus } from './types.ts';

export interface QActor { email: string; name: string }

// 엔진 안쪽 도구(엔진을 import 하면 서로 물리므로 넘겨받는다)
export interface QHelpers {
  newId: (prefix: string) => string;
  touch: (text: string) => void;
  bump: (cur: { version: number }) => { version: number; updatedAt: string; updatedBy: string };
  clip: (s: string) => string;
  fail: (status: number, body: Record<string, unknown>) => never;
}

const MAX_QUESTIONS = 300;
const MAX_ANSWERS = 100;
const MAX_GUESTS = 20;
// 손님 답 남용 방지: 같은 링크로 연달아 다는 간격 · 한 시간에 다는 개수
export const GUEST_MIN_GAP_MS = 5_000;
export const GUEST_MAX_PER_HOUR = 30;

// 손님 링크로 들어온 답(서버 안에서만 만든다. API 로 받는 연산 목록(opSchema)에는 없다)
export interface GuestAnswerOp { op: 'question.guestAnswer'; token: string; id: string; text: string }

export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
export function newToken(): string {
  return randomBytes(24).toString('base64url'); // 32자
}

function own<T>(rec: Record<string, T>, id: string): T | undefined {
  return Object.hasOwn(rec, id) ? rec[id] : undefined;
}

// 끊지 않은 링크 중 토큰이 같은 것(시간 차로 토큰을 알아내지 못하게 고정 시간 비교)
export function findGuest(doc: ProgressDoc, token: string): GuestLink | null {
  if (!TOKEN_RE.test(token)) return null;
  const want = Buffer.from(token);
  let hit: GuestLink | null = null;
  for (const g of Object.values(doc.guests ?? {})) {
    const have = Buffer.from(g.token);
    if (have.length === want.length && timingSafeEqual(have, want) && !g.revokedAt) hit = g;
  }
  return hit;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function nextSeq(doc: ProgressDoc): number {
  return Object.values(doc.questions).reduce((m, q) => Math.max(m, q.seq || 0), 0) + 1;
}

function getQuestion(doc: ProgressDoc, id: string, h: QHelpers): QuestionItem {
  const cur = own(doc.questions, id);
  if (!cur) return h.fail(404, { error: 'not_found' });
  if (cur.deletedAt) return h.fail(410, { error: 'deleted', kind: 'question', current: cur, by: cur.deletedBy, at: cur.deletedAt });
  return cur;
}

// 손님 답 연달아 달기 막기: 이 링크로 단 답들의 시각
function guestAnswerTimes(doc: ProgressDoc, guestId: string): number[] {
  const out: number[] = [];
  for (const q of Object.values(doc.questions)) for (const a of q.answers) if (a.guestId === guestId) out.push(new Date(a.at).getTime());
  return out;
}

export function applyQuestionOp(doc: ProgressDoc, op: Op | GuestAnswerOp, actor: QActor, iso: string, now: number, h: QHelpers): { result?: unknown } | null {
  switch (op.op) {
    case 'question.add': {
      if (Object.values(doc.questions).filter((q) => !q.deletedAt).length >= MAX_QUESTIONS) h.fail(400, { error: 'limit', message: '질문이 너무 많습니다.' });
      const q: QuestionItem = {
        id: h.newId('q'), seq: nextSeq(doc), to: op.to.trim(), text: op.text, status: 'open', answers: [], unread: false,
        version: 1, createdAt: iso, createdBy: actor.name, updatedAt: iso, updatedBy: actor.name, deletedAt: null, deletedBy: null,
      };
      doc.questions[q.id] = q;
      h.touch(`질문 추가: ${h.clip(q.text)}`);
      return { result: q };
    }
    case 'question.update': {
      const cur = getQuestion(doc, op.id, h);
      const keys = Object.keys(op.patch);
      // 상태만 바꿀 땐 version 을 보지 않는다(할 일 체크와 같은 규칙)
      const statusOnly = keys.length === 1 && keys[0] === 'status';
      if (!statusOnly && !op.force) {
        if (op.baseVersion === undefined) h.fail(400, { error: 'baseVersion_required', kind: 'question', id: cur.id });
        if (cur.version !== op.baseVersion) h.fail(409, { error: 'conflict', kind: 'question', id: cur.id, current: cur, by: cur.updatedBy, at: cur.updatedAt });
      }
      const next: QuestionItem = { ...cur, ...op.patch, ...h.bump(cur) };
      if (op.patch.to) next.to = op.patch.to.trim();
      doc.questions[cur.id] = next;
      const label: Record<QuestionStatus, string> = { open: '다시 엶', answered: '답함으로 바꿈', closed: '닫음' };
      h.touch(`질문 '${h.clip(next.text)}' ${statusOnly && op.patch.status ? label[op.patch.status] : '수정함'}`);
      return { result: next };
    }
    case 'question.delete': {
      const cur = own(doc.questions, op.id);
      if (!cur) return h.fail(404, { error: 'not_found' });
      if (cur.deletedAt) return { result: cur };
      const next: QuestionItem = { ...cur, deletedAt: iso, deletedBy: actor.name, ...h.bump(cur) };
      doc.questions[cur.id] = next;
      h.touch(`질문 '${h.clip(cur.text)}' 삭제`);
      return { result: next };
    }
    case 'question.restore': {
      const cur = own(doc.questions, op.id);
      if (!cur) return h.fail(404, { error: 'not_found' });
      if (!cur.deletedAt) return { result: cur };
      const next: QuestionItem = { ...cur, deletedAt: null, deletedBy: null, ...h.bump(cur) };
      doc.questions[cur.id] = next;
      h.touch(`질문 '${h.clip(cur.text)}' 복원`);
      return { result: next };
    }
    case 'question.answer': {
      // 우리 쪽(로그인한 사람 · CLI)이 다는 답이나 덧붙이는 말. 상태는 그대로 둔다.
      const cur = getQuestion(doc, op.id, h);
      if (cur.answers.filter((a) => !a.deletedAt).length >= MAX_ANSWERS) h.fail(400, { error: 'limit', message: '이 질문에 답이 너무 많습니다.' });
      const a: QuestionAnswer = { id: h.newId('a'), by: actor.name, text: op.text, at: iso, guestId: null, deletedAt: null, deletedBy: null };
      const next: QuestionItem = { ...cur, answers: [...cur.answers, a], ...h.bump(cur) };
      doc.questions[cur.id] = next;
      h.touch(`질문 '${h.clip(cur.text)}'에 답 달기`);
      return { result: a };
    }
    case 'question.guestAnswer': {
      const g = findGuest(doc, op.token);
      if (!g) return h.fail(404, { error: 'link_gone' });
      const cur = own(doc.questions, op.id);
      // 다른 사람에게 온 질문은 없는 것과 같게(있다는 것도 알려 주지 않는다)
      if (!cur || cur.deletedAt || !sameName(cur.to, g.name)) return h.fail(404, { error: 'not_found' });
      if (cur.status === 'closed') return h.fail(409, { error: 'closed', message: '닫힌 질문이에요.' });
      if (cur.answers.filter((a) => !a.deletedAt).length >= MAX_ANSWERS) h.fail(400, { error: 'limit', message: '이 질문에 답이 너무 많습니다.' });
      const times = guestAnswerTimes(doc, g.id);
      if (times.some((t) => now - t < GUEST_MIN_GAP_MS)) h.fail(429, { error: 'too_fast', message: '조금 뒤에 다시 보내 주세요.' });
      if (times.filter((t) => now - t < 3600_000).length >= GUEST_MAX_PER_HOUR) h.fail(429, { error: 'too_many', message: '한 시간에 보낼 수 있는 답을 넘었어요. 잠시 뒤에 다시 보내 주세요.' });
      const by = { ...actor, name: g.name };
      const a: QuestionAnswer = { id: h.newId('a'), by: g.name, text: op.text, at: iso, guestId: g.id, deletedAt: null, deletedBy: null };
      const next: QuestionItem = {
        ...cur, answers: [...cur.answers, a], unread: true, status: cur.status === 'open' ? 'answered' : cur.status,
        version: cur.version + 1, updatedAt: iso, updatedBy: by.name,
      };
      doc.questions[cur.id] = next;
      h.touch(`${g.name} 답: ${h.clip(cur.text)}`);
      return { result: { id: a.id, at: a.at } };
    }
    case 'question.answer.delete': {
      const cur = getQuestion(doc, op.id, h);
      const idx = cur.answers.findIndex((a) => a.id === op.answerId);
      if (idx < 0) return h.fail(404, { error: 'not_found' });
      if (cur.answers[idx].deletedAt) return { result: cur };
      const answers = cur.answers.map((a, i) => (i === idx ? { ...a, deletedAt: iso, deletedBy: actor.name } : a));
      // 손님 답이 하나도 안 남으면 「답함」을 「답 기다림」으로 되돌린다
      const liveGuest = answers.some((a) => !a.deletedAt && a.guestId);
      const status: QuestionStatus = cur.status === 'answered' && !liveGuest ? 'open' : cur.status;
      const next: QuestionItem = { ...cur, answers, status, unread: liveGuest ? cur.unread : false, ...h.bump(cur) };
      doc.questions[cur.id] = next;
      h.touch(`질문 '${h.clip(cur.text)}'의 답 삭제`);
      return { result: next };
    }
    case 'question.seen': {
      // 새 답 표시만 끈다(내용은 그대로라 version · 마지막 수정 기록은 건드리지 않는다)
      const cur = getQuestion(doc, op.id, h);
      if (!cur.unread) return { result: cur };
      doc.questions[cur.id] = { ...cur, unread: false };
      doc.version += 1;
      return { result: doc.questions[cur.id] };
    }
    case 'guest.add': {
      if (Object.values(doc.guests).filter((g) => !g.revokedAt).length >= MAX_GUESTS) h.fail(400, { error: 'limit', message: '답 받는 링크가 너무 많아요. 안 쓰는 링크를 먼저 끊어 주세요.' });
      const g: GuestLink = { id: h.newId('g'), name: op.name.trim(), token: newToken(), createdAt: iso, createdBy: actor.name, revokedAt: null, revokedBy: null };
      doc.guests[g.id] = g;
      h.touch(`답 받는 링크 만듦: ${g.name}`);
      return { result: g };
    }
    case 'guest.revoke': {
      const cur = own(doc.guests, op.id);
      if (!cur) return h.fail(404, { error: 'not_found' });
      if (cur.revokedAt) return { result: cur };
      const next: GuestLink = { ...cur, revokedAt: iso, revokedBy: actor.name };
      doc.guests[cur.id] = next;
      h.touch(`답 받는 링크 끊음: ${cur.name}`);
      return { result: next };
    }
    default:
      return null;
  }
}

// 30일 지난 삭제 질문 · 삭제한 답 정리
export function purgeQuestions(doc: ProgressDoc, old: (iso: string | null) => boolean) {
  for (const [id, q] of Object.entries(doc.questions)) {
    if (old(q.deletedAt)) { delete doc.questions[id]; continue; }
    if (q.answers.some((a) => old(a.deletedAt))) doc.questions[id] = { ...q, answers: q.answers.filter((a) => !old(a.deletedAt)) };
  }
}

// ── 손님 화면에 내보낼 값: 그 사람에게 온 질문과 답만(다른 현황 · 다른 사람 질문 · 누가 언제 고쳤는지는 넣지 않는다) ──
export interface GuestAnswerView { id: string; by: string; text: string; at: string; mine: boolean }
export interface GuestQuestionView { id: string; text: string; status: QuestionStatus; at: string; answers: GuestAnswerView[] }
export interface GuestView { name: string; questions: GuestQuestionView[] }

export function guestView(doc: ProgressDoc, token: string): GuestView | null {
  const g = findGuest(doc, token);
  if (!g) return null;
  const questions = Object.values(doc.questions)
    .filter((q) => !q.deletedAt && sameName(q.to, g.name))
    // 번호가 바뀌지 않게 올린 순서 그대로(「3번 질문」처럼 말할 수 있게)
    .sort((a, b) => (a.seq || 0) - (b.seq || 0))
    .map((q) => ({
      id: q.id, text: q.text, status: q.status, at: q.createdAt,
      answers: q.answers.filter((a) => !a.deletedAt).map((a) => ({ id: a.id, by: a.by, text: a.text, at: a.at, mine: !!a.guestId })),
    }));
  return { name: g.name, questions };
}

// export-md(볼트용 마크다운)의 「질문」 절. 질문이 없으면 빈 배열. 손님 링크 주소(토큰)는 쓰지 않는다.
export function questionsMarkdown(doc: ProgressDoc, kst: (iso: string | null | undefined) => string): string[] {
  const label: Record<QuestionStatus, string> = { open: '답 기다림', answered: '답함', closed: '닫음' };
  const qs = Object.values(doc.questions ?? {}).filter((q) => !q.deletedAt).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  if (!qs.length) return [];
  const out: string[] = ['## 질문', ''];
  for (const q of qs) {
    out.push(`- ${q.seq}. [${label[q.status]}] → ${q.to}: ${q.text.replace(/\n/g, ' / ')}`);
    for (const a of q.answers) if (!a.deletedAt) out.push(`  - ${a.by} ${kst(a.at)}: ${a.text.replace(/\n/g, ' / ')}`);
  }
  out.push('');
  return out;
}
