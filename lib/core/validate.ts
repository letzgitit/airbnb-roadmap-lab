import { z } from 'zod';
import { LOG_KINDS, STEP_COUNT } from './types.ts';

const dateStr = z.string().refine((s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, '날짜 형식은 YYYY-MM-DD 이어야 합니다.');

const nullableDate = z.union([dateStr, z.null()]);
const text = z.string().trim().min(1, '내용을 입력하세요.').max(200, '200자 이하로 입력하세요.');
const stepId = z.number().int().min(1).max(STEP_COUNT);
const version = z.number().int().min(0);
// 서버가 만드는 id 모양(t_/l_/p_ + 영숫자)만 받는다. `constructor`·`__proto__` 같은 값이 레코드 조회에 들어가지 않게.
const id = z.string().regex(/^[tlp]_[A-Za-z0-9]{1,60}$/, 'id 형식이 올바르지 않습니다.');
const editKey = z.string().regex(/^(step:\d{1,2}|(task|log|prop):[tlp]_[A-Za-z0-9]{1,60})$/);

export const stepPatch = z.object({
  status: z.enum(['todo', 'doing', 'done']).optional(),
  targetDate: nullableDate.optional(),
  note: z.string().max(1000, '메모는 1000자 이하로 입력하세요.').optional(),
}).strict().refine((p) => Object.keys(p).length > 0, '바꿀 내용이 없습니다.');

export const taskPatch = z.object({
  text: text.optional(),
  due: nullableDate.optional(),
  stepId: stepId.optional(),
  done: z.boolean().optional(),
}).strict().refine((p) => Object.keys(p).length > 0, '바꿀 내용이 없습니다.');

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

export const opSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('step.update'), stepId, baseVersion: version, patch: stepPatch, force: z.boolean().optional() }),
  z.object({ op: z.literal('task.add'), stepId, text, due: nullableDate.optional() }),
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
  z.object({ op: z.literal('editing.set'), key: editKey }),
  z.object({ op: z.literal('editing.clear'), key: editKey }),
]);
export type Op = z.infer<typeof opSchema>;
