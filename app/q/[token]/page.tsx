import type { Metadata } from 'next';
import { readDoc } from '@/lib/core/engine';
import { guestView, TOKEN_RE } from '@/lib/core/questions';
import { GuestGone, GuestPage } from '@/components/questions/GuestPage';

// 손님 링크(로그인 없음). 주소의 토큰이 살아 있는 링크와 같을 때만, 그 사람에게 온 질문과 답만 그린다.
// 다른 현황(집 정보 · 할 일 · 돈 · 기록)은 이 화면으로 나가지 않는다(lib/core/questions.ts guestView).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: '질문',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'same-origin',
};

type Search = { sent?: string; err?: string; q?: string };

export default async function GuestQuestionsPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Search> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!TOKEN_RE.test(token)) return <GuestGone reason="gone" />;
  let view;
  try {
    view = guestView(await readDoc(), token);
  } catch (e) {
    console.error('guest read failed:', e instanceof Error ? e.message : 'unknown');
    return <GuestGone reason="error" />;
  }
  if (!view) return <GuestGone reason="gone" />;
  const pick = (v: unknown) => (typeof v === 'string' && /^[a-z_]{1,20}$/.test(v) ? v : null);
  const qid = typeof sp.q === 'string' && /^q_[A-Za-z0-9]{1,60}$/.test(sp.q) ? sp.q : null;
  const err = pick(sp.err);
  return <GuestPage token={token} view={view} sent={sp.sent === '1' ? qid ?? '1' : null} err={err ? { code: err, q: qid } : null} />;
}
