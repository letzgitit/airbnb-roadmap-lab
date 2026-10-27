import { z } from 'zod';
import { LOG_KINDS, STEP_COUNT, TASK_KINDS, TASK_OWNERS } from './types.ts';

const dateStr = z.string().refine((s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, '날짜 형식은 YYYY-MM-DD 이어야 합니다.');

const nullableDate = z.union([dateStr, z.null()]);
// 할 일 종류: 정해진 값 하나 또는 null(종류 지우기)
const taskKind = z.union([z.enum(TASK_KINDS), z.null()], { error: `종류는 ${TASK_KINDS.join(' · ')} 중 하나 또는 null 이어야 합니다.` });
// 제목: 줄바꿈 · 겹친 공백을 한 칸으로(Todoist 에서 받는 제목과 같은 정규화 — lib/core/todoist.ts normText)
const text = z.string().transform((s) => s.replace(/\s+/g, ' ').trim()).pipe(z.string().min(1, '내용을 입력하세요.').max(200, '200자 이하로 입력하세요.'));
const stepId = z.number().int().min(1).max(STEP_COUNT);
const version = z.number().int().min(0);
// 서버가 만드는 id 모양(t_/l_/p_ + 영숫자)만 받는다. `constructor`·`__proto__` 같은 값이 레코드 조회에 들어가지 않게.
const id = z.string().regex(/^[tlpm]_[A-Za-z0-9]{1,60}$/, 'id 형식이 올바르지 않습니다.');
const editKey = z.string().regex(/^(step:\d{1,2}|(task|log|prop):[tlp]_[A-Za-z0-9]{1,60})$/);

export const stepPatch = z.object({
  status: z.enum(['todo', 'doing', 'done']).optional(),
  targetDate: nullableDate.optional(),
  note: z.string().max(1000, '메모는 1000자 이하로 입력하세요.').optional(),
}).strict().refine((p) => Object.keys(p).length > 0, '바꿀 내용이 없습니다.');

// 할 일 맡은 사람: 정해진 값 하나 또는 null(지우기)
const taskOwner = z.union([z.enum(TASK_OWNERS), z.null()], { error: `맡은 사람은 ${TASK_OWNERS.join(' · ')} 중 하나 또는 null 이어야 합니다.` });
// 할 일 자세한 내용: ≤1000자, 빈 글 · null = 지우기
export const TASK_NOTE_MAX = 1000;
const taskNote = z.union([z.string().trim().max(TASK_NOTE_MAX, `자세한 내용은 ${TASK_NOTE_MAX}자 이하로 입력하세요.`), z.null()]);
// 할 일 참고(설명서): 마크다운 ≤6000자, 빈 글 · null = 지우기. 줄바꿈은 그대로 둔다(앞뒤 공백만 지움).
export const TASK_GUIDE_MAX = 6000;
const taskGuide = z.union([z.string().trim().max(TASK_GUIDE_MAX, `참고(설명서)는 ${TASK_GUIDE_MAX}자 이하로 입력하세요.`), z.null()]);
// Todoist 할 일 id(영숫자) 또는 null(짝 끊기)
export const todoistId = z.union([z.string().regex(/^[A-Za-z0-9]{1,64}$/, 'Todoist id 형식이 올바르지 않습니다.'), z.null()]);
// 세부 항목의 부모 할 일 id(t_…) 또는 null(부모에서 떼기)
const parentId = z.union([z.string().regex(/^t_[A-Za-z0-9]{1,60}$/, '부모 할 일 id 형식이 올바르지 않습니다.'), z.null()]);
export const taskPatch = z.object({
  text: text.optional(),
  due: nullableDate.optional(),
  stepId: stepId.optional(),
  done: z.boolean().optional(),
  kind: taskKind.optional(),
  note: taskNote.optional(),
  guide: taskGuide.optional(),
  owner: taskOwner.optional(),
  todoistId: todoistId.optional(),
  start: nullableDate.optional(),
  parentId: parentId.optional(),
}).strict().refine((p) => Object.keys(p).length > 0, '바꿀 내용이 없습니다.')
  .refine((p) => !(p.start && p.due && p.start > p.due), { message: '시작일은 마감일보다 늦을 수 없습니다.', path: ['start'] });

export const logPatch = z.object({
  kind: z.enum(LOG_KINDS).optional(),
  text: z.string().trim().min(1, '내용을 입력하세요.').max(1000, '1000자 이하로 입력하세요.').optional(),
}).strict().refine((p) => Object.keys(p).length > 0, '바꿀 내용이 없습니다.');

const propLabel = z.string().trim().min(1, '항목 이름을 입력하세요.').max(40, '항목 이름은 40자 이하로 입력하세요.');
const propValue = z.string().trim().min(1, '값을 입력하세요.').max(300, '값은 300자 이하로 입력하세요.');
export const propPatch = z.object({
  label: propLabel.optional(),
  value: propValue.optional(),
}).strict().refine((p) => Object.keys(p).length > 0, '바꿀 내용이 없습니다.');

// 돈 흐름: 단위 만원(정수). +들어옴 / -나감. null = 금액 미정.
const amount = z.union([z.number().int().min(-1_000_000).max(1_000_000), z.null()]);
const via = z.enum(['cash', 'credit']);
const project = z.enum(['oedomin', 'jisan']);
export const moneyPatch = z.object({
  date: nullableDate.optional(),
  text: text.optional(),
  amount: amount.optional(),
  via: via.optional(),
  estimate: z.boolean().optional(),
  project: project.optional(),
}).strict().refine((p) => Object.keys(p).length > 0, '바꿀 내용이 없습니다.');
const balance = z.union([z.number().int().min(-1_000_000).max(1_000_000), z.null()]);
export const planPatch = z.object({
  cash: balance.optional(),
  credit: balance.optional(),
  fork: z.string().max(500, '갈림길은 500자 이하로 입력하세요.').optional(),
}).strict().refine((p) => Object.keys(p).length > 0, '바꿀 내용이 없습니다.');

// 질문 · 손님 링크. id 는 q_(질문) · a_(답) · g_(손님 링크).
const qid = z.string().regex(/^q_[A-Za-z0-9]{1,60}$/, 'id 형식이 올바르지 않습니다.');
const aid = z.string().regex(/^a_[A-Za-z0-9]{1,60}$/, 'id 형식이 올바르지 않습니다.');
const gid = z.string().regex(/^g_[A-Za-z0-9]{1,60}$/, 'id 형식이 올바르지 않습니다.');
export const QUESTION_MAX = 1000;
export const ANSWER_MAX = 2000;
const personName = z.string().trim().min(1, '받는 사람 이름을 입력하세요.').max(20, '이름은 20자 이하로 입력하세요.');
const questionText = z.string().trim().min(1, '질문을 입력하세요.').max(QUESTION_MAX, `질문은 ${QUESTION_MAX}자 이하로 입력하세요.`);
export const answerText = z.string().trim().min(1, '답을 입력하세요.').max(ANSWER_MAX, `답은 ${ANSWER_MAX}자 이하로 입력하세요.`);
const questionStatus = z.enum(['open', 'answered', 'closed']);
export const questionPatch = z.object({
  text: questionText.optional(),
  to: personName.optional(),
  status: questionStatus.optional(),
}).strict().refine((p) => Object.keys(p).length > 0, '바꿀 내용이 없습니다.');

export const opSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('question.add'), to: personName, text: questionText }),
  z.object({ op: z.literal('question.update'), id: qid, baseVersion: version.optional(), patch: questionPatch, force: z.boolean().optional() }),
  z.object({ op: z.literal('question.delete'), id: qid }),
  z.object({ op: z.literal('question.restore'), id: qid }),
  z.object({ op: z.literal('question.answer'), id: qid, text: answerText }),
  z.object({ op: z.literal('question.answer.delete'), id: qid, answerId: aid }),
  z.object({ op: z.literal('question.seen'), id: qid }),
  z.object({ op: z.literal('guest.add'), name: personName }),
  z.object({ op: z.literal('guest.revoke'), id: gid }),
  z.object({ op: z.literal('step.update'), stepId, baseVersion: version, patch: stepPatch, force: z.boolean().optional() }),
  // stepId: 세부 항목(parentId)이면 빼도 된다(부모 단계를 따른다). 줘서 부모와 다르면 엔진이 거절한다.
  z.object({
    op: z.literal('task.add'), stepId: stepId.optional(), text, due: nullableDate.optional(), kind: taskKind.optional(), note: taskNote.optional(), guide: taskGuide.optional(), owner: taskOwner.optional(),
    start: nullableDate.optional(), parentId: parentId.optional(),
  }).refine((o) => o.stepId !== undefined || !!o.parentId, { message: '단계(stepId)가 필요합니다(세부 항목이면 parentId 만으로 됩니다).', path: ['stepId'] })
    .refine((o) => !(o.start && o.due && o.start > o.due), { message: '시작일은 마감일보다 늦을 수 없습니다.', path: ['start'] }),
  z.object({ op: z.literal('task.update'), id, baseVersion: version.optional(), patch: taskPatch, force: z.boolean().optional() }),
  z.object({ op: z.literal('task.delete'), id }),
  z.object({ op: z.literal('task.restore'), id }),
  z.object({ op: z.literal('log.add'), kind: z.enum(LOG_KINDS), text: z.string().trim().min(1, '내용을 입력하세요.').max(1000, '1000자 이하로 입력하세요.') }),
  z.object({ op: z.literal('log.update'), id, baseVersion: version.optional(), patch: logPatch, force: z.boolean().optional() }),
  z.object({ op: z.literal('log.delete'), id }),
  z.object({ op: z.literal('log.restore'), id }),
  z.object({ op: z.literal('property.add'), label: propLabel, value: propValue }),
  z.object({ op: z.literal('property.update'), id, baseVersion: version.optional(), patch: propPatch, force: z.boolean().optional() }),
  z.object({ op: z.literal('property.delete'), id }),
  z.object({ op: z.literal('property.restore'), id }),
  z.object({ op: z.literal('money.add'), date: nullableDate, text, amount, via, estimate: z.boolean().optional(), project }),
  z.object({ op: z.literal('money.update'), id, baseVersion: version.optional(), patch: moneyPatch, force: z.boolean().optional() }),
  z.object({ op: z.literal('money.delete'), id }),
  z.object({ op: z.literal('money.restore'), id }),
  z.object({ op: z.literal('plan.update'), baseVersion: version, patch: planPatch, force: z.boolean().optional() }),
  z.object({ op: z.literal('editing.set'), key: editKey }),
  z.object({ op: z.literal('editing.clear'), key: editKey }),
]);
export type Op = z.infer<typeof opSchema>;
