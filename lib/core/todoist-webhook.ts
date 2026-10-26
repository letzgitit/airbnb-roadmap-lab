// Todoist → 사이트: 웹훅 요청 하나를 검사하고 현황에 반영한다. 라우트(app/api/todoist/webhook)와 시험이 함께 쓴다.
// 같은 웹훅이 다시 와도(Todoist 재전송 · 저장소 503 뒤 재시도) 안전하다: 값으로 견주고(todoistSent) 이미 반영한 것보다 앞선 것은 버린다(todoistAt).
import { mutate as engineMutate, OpError, readDoc, type Actor, type EngineOp } from './engine.ts';
import { findByTodoistId, findEcho, parseWebhook, TODOIST_ACTOR, verifySignature, type FromTodoistResult, type StepGuess } from './todoist.ts';
import { guessStep } from './todoist-classify.ts';
import type { Step } from './types.ts';

export const MAX_WEBHOOK_BYTES = 64 * 1024;

export interface WebhookDeps {
  secret?: string;
  userId?: string;
  steps: Pick<Step, 'id' | 'title' | 'summary'>[];
  classify?: (text: string) => Promise<StepGuess>;
  // 시험용(저장소 실패 흉내)
  mutate?: (op: EngineOp, actor: Actor) => Promise<{ result?: unknown }>;
}
export interface WebhookOutcome { status: number; body: Record<string, unknown> }

// Todoist 는 200 이 아니면 15분 뒤 다시 보낸다(최대 3번). 그래서 「우리가 받을 일이 아님」도 200 으로 답하고,
// 저장소가 바쁘거나(503) 하는 일시 오류만 던져(라우트에서 500) 다시 받는다.
export async function handleTodoistWebhook(raw: Buffer | string, signature: string | null, deps: WebhookDeps): Promise<WebhookOutcome> {
  // 사용자 id 까지 정해야 받는다(앱을 승인한 다른 사람의 할 일이 들어오지 않게)
  if (!deps.secret || !deps.userId) return { status: 503, body: { error: 'not_configured' } };
  const buf = typeof raw === 'string' ? Buffer.from(raw) : raw;
  if (buf.length > MAX_WEBHOOK_BYTES) return { status: 413, body: { error: 'too_large' } };
  if (!verifySignature(buf, signature, deps.secret)) return { status: 401, body: { error: 'bad_signature' } };
  let json: unknown;
  try { json = JSON.parse(buf.toString('utf8')); } catch { return { status: 400, body: { error: 'invalid_json' } }; }
  const ev = parseWebhook(json);
  if (!ev) return { status: 200, body: { ok: true, action: 'ignored', reason: 'not_item_event' } };
  if (ev.userId !== deps.userId) return { status: 200, body: { ok: true, action: 'ignored', reason: 'other_user' } };

  // 새로 만들 때만 단계를 고른다(Claude API 는 시간이 걸린다). 짝이 있거나 사이트에서 막 만든 것이 되돌아온 것이면 고르지 않는다.
  let guess: StepGuess | undefined;
  if (ev.task.labeled && !ev.task.deleted && ev.task.text) {
    const doc = await readDoc();
    if (!findByTodoistId(doc, ev.task.id) && !findEcho(doc, ev.task, Date.now())) {
      guess = await (deps.classify ?? ((text) => guessStep(text, { steps: deps.steps, doc })))(ev.task.text);
    }
  }
  try {
    const { result } = await (deps.mutate ?? engineMutate)({ op: 'task.fromTodoist', ev, ...(guess ? { guess } : {}) }, TODOIST_ACTOR);
    const r = result as FromTodoistResult;
    return { status: 200, body: { ok: true, action: r.action, ...(r.reason ? { reason: r.reason } : {}), ...(r.task ? { id: r.task.id } : {}) } };
  } catch (e) {
    // 400(한도 등): 다시 보내도 같은 결과라 200. 503(바쁨) · 413 · 그 밖: 던져서 다시 받는다(아무것도 안 썼으므로 다시 해도 안전)
    if (e instanceof OpError && e.status === 400) return { status: 200, body: { ok: false, error: e.body.error } };
    throw e;
  }
}
