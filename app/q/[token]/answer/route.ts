import { NextResponse } from 'next/server';
import { mutateMany, readDoc } from '@/lib/core/engine';
import { findGuest, TOKEN_RE } from '@/lib/core/questions';
import { answerText } from '@/lib/core/validate';
import { checkFormRequest } from '@/lib/http';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 24 * 1024;
const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow' };

// 손님 링크 화면의 「답 보내기」(보통 HTML 폼 전송). 끝나면 같은 화면으로 돌려보낸다(303 → GET, 새로고침해도 두 번 안 감).
// 토큰이 곧 열쇠다: 끊긴 링크 · 다른 사람 질문 · 닫힌 질문은 엔진(applyQuestionOp)이 다시 막는다.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: HEADERS });
  const back = (qs: string, qid?: string | null) =>
    NextResponse.redirect(new URL(`/q/${token}?${qs}${qid ? `&q=${qid}` : ''}${qid ? `#q-${qid}` : ''}`, req.url), { status: 303, headers: HEADERS });

  if (checkFormRequest(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403, headers: HEADERS });
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) return back('err=too_long');

  let form: FormData;
  try { form = await req.formData(); } catch { return back('err=busy'); }
  const qid = String(form.get('q') ?? '');
  if (!/^q_[A-Za-z0-9]{1,60}$/.test(qid)) return back('err=busy');
  // 사람 눈엔 안 보이는 칸: 채워져 있으면 자동 프로그램으로 보고 조용히 넘긴다
  if (String(form.get('website') ?? '').trim()) return back('sent=1', qid);
  const parsed = answerText.safeParse(String(form.get('text') ?? '').replace(/\r\n/g, '\n'));
  if (!parsed.success) return back(String(form.get('text') ?? '').trim() ? 'err=too_long' : 'err=empty', qid);

  try {
    const g = findGuest(await readDoc(), token);
    if (!g) return back('err=gone');
    const { outcomes } = await mutateMany(
      [{ op: 'question.guestAnswer', token, id: qid, text: parsed.data }],
      { email: `guest:${g.id}`, name: g.name },
    );
    const o = outcomes[0];
    if (o.ok) return back('sent=1', qid);
    const code = String(o.error?.error ?? '');
    if (o.status === 404) return back('err=gone');
    return back(`err=${['too_fast', 'too_many', 'closed'].includes(code) ? code : 'busy'}`, qid);
  } catch (e) {
    console.error('guest answer failed:', e instanceof Error ? e.message : 'unknown');
    return back('err=busy', qid);
  }
}
