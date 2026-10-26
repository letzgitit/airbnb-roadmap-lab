import { NextResponse } from 'next/server';
import { handleTodoistWebhook } from '@/lib/core/todoist-webhook';
import { readContent } from '@/lib/core/content-read';
import { NO_STORE } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Todoist 웹훅(로그인 없음). 서명(X-Todoist-Hmac-SHA256 = base64 HMAC-SHA256(client secret, 본문))이 맞는 요청만 받는다.
// 서명은 받은 바이트 그대로로 견준다(글자로 바꾸면서 달라지지 않게).
export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  let steps: { id: number; title: string; summary: string }[] = [];
  try { steps = readContent().steps; } catch { /* 단계 이름이 없으면 낱말 규칙 · 기본 단계로 */ }
  try {
    const out = await handleTodoistWebhook(raw, req.headers.get('x-todoist-hmac-sha256'), {
      secret: process.env.TODOIST_CLIENT_SECRET,
      userId: process.env.TODOIST_USER_ID,
      steps,
    });
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE });
  } catch (e) {
    // 본문 · 현황은 찍지 않는다. 500 이면 Todoist 가 15분 뒤 다시 보낸다.
    console.error('todoist webhook failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE });
  }
}
