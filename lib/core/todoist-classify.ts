// Todoist 에서 새로 들어온 할 일의 단계(1~14) · 종류를 고른다.
// 1) ANTHROPIC_API_KEY 가 있으면 Claude API(짧은 프롬프트, 시간 제한) → 2) 실패 · 키 없음이면 낱말 규칙 → 3) 그래도 없으면 기본 단계.
// 단계 이름 · 설명은 공개 콘텐츠(content/steps.json)에서 받는다. 엔진과 같이 지우기만 하면 되는 TS 문법만 쓴다.
import { STEP_COUNT, TASK_KINDS, type ProgressDoc, type Step, type TaskKind } from './types.ts';
import type { StepGuess } from './todoist.ts';

/** 자동 분류가 고를 수 있는 종류: 「문의」는 사람이 붙이는 표시라 뺀다(예전 분류 결과가 바뀌지 않게) */
export const CLASSIFY_KINDS: readonly TaskKind[] = TASK_KINDS.filter((k) => k !== '문의');

export const CLASSIFY_MODEL = 'claude-haiku-5-5';
export const CLASSIFY_TIMEOUT_MS = 4000;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

type StepLite = Pick<Step, 'id' | 'title' | 'summary'>;
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

// ── 낱말 규칙 ──
// 위에서부터 먼저 맞는 것이 이긴다(「구청 + 서류/접수」는 9단계, 「구청」만이면 2단계처럼 좁은 규칙을 먼저).
const STEP_RULES: { step: number; all?: RegExp[]; any: RegExp }[] = [
  { step: 12, any: /실사|현장\s*심사|현장\s*점검/ },
  { step: 2, all: [/구청|담당자|위생과|관광과/], any: /전화|문의|통화|물어|가능\s*여부|유선/ },
  { step: 9, all: [/구청/], any: /접수|서류|신청|등록|사업계획서|사전\s*검토/ },
  { step: 9, any: /등록\s*신청|등록증|사업계획서|사전\s*검토|최종\s*접수/ },
  { step: 8, any: /소방|소화기|감지기|완강기|피난|유도등|경보기/ },
  { step: 13, any: /사업자|세무서|신보|신용보증|특례|부가세|종소세/ },
  { step: 11, any: /에어비앤비|airbnb|리스팅|숙소\s*소개|숙소\s*설명|1박\s*요금|요금\s*설정/i },
  { step: 10, any: /사진|촬영|보정/ },
  { step: 5, any: /주민|동의서|이웃\s*동의|관리단|입주민/ },
  { step: 3, any: /계약|특약|임대인|집주인|계약금|가계약/ },
  { step: 4, any: /전입|잔금|도면|평면도|확정일자/ },
  { step: 7, any: /인테리어|도배|장판|욕실|화장실|공사|페인트|타일|조명|커튼|블라인드|시공|철거/ },
  { step: 6, any: /가구|가전|냉장고|세탁기|건조기|침대|매트리스|에어컨|소파|식탁|tv|티비|전자레인지|인덕션|설비|보일러/i },
  { step: 2, any: /구청|담당자|위생과|관광과|관광\s*담당|문의/ },
  { step: 1, any: /임장|매물|입지|동네|부동산/ },
  { step: 14, any: /런칭|오픈|리뷰|운영|청소\s*업체|민원|체크인|체크아웃/ },
];

const KIND_RULES: { kind: TaskKind; any: RegExp }[] = [
  { kind: '예약', any: /예약/ },
  { kind: '연락', any: /전화|연락|문의|문자|카톡|메일|통화|물어보/ },
  { kind: '일정 확정', any: /일정|날짜\s*(잡|정)|시간\s*(잡|정)|방문\s*날/ },
  { kind: '구매', any: /사기$|구매|주문|구입|사 오기|사오기|결제/ },
  { kind: '서류', any: /서류|신청서|발급|등본|등기|계약서|도면|사업계획서|동의서|증명/ },
  { kind: '공사', any: /공사|시공|도배|장판|철거|페인트|타일/ },
  { kind: '결정', any: /결정|정하기|고르기|선택|비교/ },
  { kind: '확인', any: /확인|점검|체크|알아보/ },
];

export function keywordStep(text: string): number | null {
  for (const r of STEP_RULES) {
    if (r.all && !r.all.every((re) => re.test(text))) continue;
    if (r.any.test(text)) return r.step;
  }
  return null;
}
export function keywordKind(text: string): TaskKind | null {
  for (const r of KIND_RULES) if (r.any.test(text)) return r.kind;
  return null;
}

// 기본 단계: 지금 하고 있는 단계(진행 중 중 가장 앞) → 없으면 아직 안 끝난 첫 단계 → 다 끝났으면 1
export function defaultStep(doc: ProgressDoc | null): number {
  const st = (n: number) => doc?.steps?.[String(n)]?.status ?? 'todo';
  for (let n = 1; n <= STEP_COUNT; n++) if (st(n) === 'doing') return n;
  for (let n = 1; n <= STEP_COUNT; n++) if (st(n) !== 'done') return n;
  return 1;
}

// ── Claude API ──

function prompt(text: string, steps: StepLite[]): string {
  const list = steps.map((s) => `${s.id}. ${s.title} — ${s.summary}`).join('\n');
  return `외국인관광 도시민박업(에어비앤비) 준비 과정의 14단계가 있다.\n${list}\n\n할 일 종류: ${CLASSIFY_KINDS.join(', ')}\n\n`
    + `할 일: "${text.replace(/"/g, "'")}"\n\n`
    + '이 할 일이 속할 단계 번호 하나와 종류 하나를 고른다. 종류가 애매하면 null. '
    + '다른 말 없이 JSON 한 줄만 답한다. 예: {"step":7,"kind":"공사"}';
}

// 답에서 {"step":n,"kind":...} 를 꺼낸다. 단계가 1~14가 아니면 null.
export function parseClaudeAnswer(raw: string): { stepId: number; kind: TaskKind | null } | null {
  const m = /\{[^{}]*\}/.exec(raw);
  if (!m) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
  const n = Number(j.step);
  if (!Number.isInteger(n) || n < 1 || n > STEP_COUNT) return null;
  const kind = typeof j.kind === 'string' && (CLASSIFY_KINDS as readonly string[]).includes(j.kind) ? (j.kind as TaskKind) : null;
  return { stepId: n, kind };
}

export async function claudeGuess(text: string, steps: StepLite[], opts: { apiKey: string; fetch?: FetchLike; timeoutMs?: number; model?: string }): Promise<{ stepId: number; kind: TaskKind | null } | null> {
  const f = opts.fetch ?? fetch;
  try {
    const res = await f(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: opts.model ?? CLASSIFY_MODEL, max_tokens: 40, messages: [{ role: 'user', content: prompt(text, steps) }] }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? CLASSIFY_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { content?: { type?: string; text?: string }[] };
    const out = (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    return parseClaudeAnswer(out);
  } catch {
    return null; // 시간 초과 · 네트워크 · 모양 틀림 → 낱말 규칙으로
  }
}

// 순서대로: Claude → 낱말 규칙 → 기본 단계. 종류는 Claude 가 못 골랐으면 낱말 규칙으로 채운다.
export async function guessStep(text: string, ctx: { steps: StepLite[]; doc: ProgressDoc | null; apiKey?: string; fetch?: FetchLike; timeoutMs?: number }): Promise<StepGuess> {
  const apiKey = ctx.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (apiKey && ctx.steps.length) {
    const g = await claudeGuess(text, ctx.steps, { apiKey, fetch: ctx.fetch, timeoutMs: ctx.timeoutMs });
    if (g) return { stepId: g.stepId, kind: g.kind ?? keywordKind(text), by: 'claude' };
  }
  const k = keywordStep(text);
  if (k) return { stepId: k, kind: keywordKind(text), by: 'keyword' };
  return { stepId: defaultStep(ctx.doc), kind: keywordKind(text), by: 'default' };
}
