// 손님 링크 화면(/q/<token>): 로그인 없이 열리고, 그 사람에게 온 질문과 답만 보인다.
// 자바스크립트 없이 돈다(서버가 그린 HTML + 보통 폼 전송). 카톡 안 브라우저 · 오래된 폰에서도 그대로 쓰이고,
// 스타일도 이 파일 안에 있어 사이트의 다른 파일을 받지 못해도(로그인으로 잠긴 사이트) 모양이 깨지지 않는다.
import { ANSWER_MAX } from '@/lib/core/validate';
import type { GuestView } from '@/lib/core/questions';
import type { QuestionStatus } from '@/lib/core/types';

const CSS = `
.qg{--bg:#f4f5f7;--card:#fff;--ink:#16191d;--sub:#5b636e;--line:#dde1e6;--accent:#1d5fd1;--accent-ink:#fff;
 --wait:#8a5a00;--wait-bg:#fff3d6;--done:#0f6b4a;--done-bg:#dff4ea;--closed:#59616b;--closed-bg:#eceef1;
 --mine:#eef4ff;--ok:#0f6b4a;--ok-bg:#dff4ea;--bad:#b3261e;--bad-bg:#fde7e5;
 min-height:100vh;background:var(--bg);color:var(--ink);padding:0 16px 64px;
 font-family:'Pretendard',-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;font-size:16px;line-height:1.6;word-break:keep-all;overflow-wrap:anywhere}
html.dark .qg{--bg:#111316;--card:#1a1d22;--ink:#f1f2f4;--sub:#adb3bc;--line:#343941;--accent:#6aa0ff;--accent-ink:#0b1220;
 --wait:#ffcf70;--wait-bg:#3a2e12;--done:#7fdcb4;--done-bg:#123628;--closed:#b3bac4;--closed-bg:#262a31;
 --mine:#1c2638;--ok:#7fdcb4;--ok-bg:#123628;--bad:#ff9b8f;--bad-bg:#3a1a1a}
.qg *{box-sizing:border-box}
.qg .wrap{max-width:640px;margin:0 auto}
.qg header{padding:28px 2px 12px}
.qg h1{margin:0;font-size:22px;font-weight:800;line-height:1.35}
.qg .lede{margin:6px 0 0;color:var(--sub);font-size:15px}
.qg .count{margin:4px 0 0;color:var(--sub);font-size:14px;font-weight:600;display:flex;flex-wrap:wrap;column-gap:12px}
.qg .notice{margin:12px 0 0;padding:12px 14px;border-radius:12px;font-size:15px;font-weight:700}
.qg .notice.ok{background:var(--ok-bg);color:var(--ok)}
.qg .notice.bad{background:var(--bad-bg);color:var(--bad)}
.qg ol{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:14px}
.qg .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;scroll-margin-top:16px}
.qg .head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.qg .num{font-size:14px;font-weight:800;color:var(--sub)}
.qg .chip{display:inline-block;font-size:13px;font-weight:700;padding:2px 9px;border-radius:999px}
.qg .chip.open{color:var(--wait);background:var(--wait-bg)}
.qg .chip.answered{color:var(--done);background:var(--done-bg)}
.qg .chip.closed{color:var(--closed);background:var(--closed-bg)}
.qg .q{margin:0;font-size:17px;font-weight:700;line-height:1.55;white-space:pre-wrap}
.qg .answers{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px}
.qg .answer{padding:10px 12px;border-radius:12px;background:var(--bg)}
.qg .answer.mine{background:var(--mine)}
.qg .who{display:flex;flex-wrap:wrap;gap:0 10px;font-size:13px;font-weight:700;color:var(--sub)}
.qg .atext{margin:2px 0 0;font-size:16px;white-space:pre-wrap}
.qg form{margin:12px 0 0;display:grid;gap:8px}
.qg label.l{font-size:14px;font-weight:700;color:var(--sub)}
.qg textarea{width:100%;min-height:96px;resize:vertical;font:inherit;font-size:16px;color:var(--ink);background:var(--card);
 border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.qg textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
.qg .row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.qg .hint{font-size:13px;color:var(--sub)}
.qg button{font:inherit;font-size:16px;font-weight:800;min-height:48px;padding:10px 20px;border:0;border-radius:12px;background:var(--accent);color:var(--accent-ink);cursor:pointer}
.qg button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.qg .closedmsg{margin:12px 0 0;font-size:14px;color:var(--sub)}
.qg .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.qg .empty{margin:24px 0 0;color:var(--sub)}
.qg footer{margin:28px 2px 0;font-size:13px;color:var(--sub)}
`;

const STATUS_LABEL: Record<QuestionStatus, string> = { open: '답 기다림', answered: '답함', closed: '닫음' };

function kst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}

export function GuestStyle() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

export function GuestGone({ reason }: { reason: 'gone' | 'error' }) {
  return (
    <div className="qg">
      <GuestStyle />
      <div className="wrap">
        <header>
          <h1>{reason === 'gone' ? '열 수 없는 링크예요' : '잠시 뒤에 다시 열어 주세요'}</h1>
          <p className="lede">{reason === 'gone' ? '링크가 끊겼거나 주소가 잘못됐어요. 링크를 보낸 사람에게 새 링크를 받아 주세요.' : '질문을 불러오지 못했어요.'}</p>
        </header>
      </div>
    </div>
  );
}

const ERR_TEXT: Record<string, string> = {
  too_fast: '방금 보낸 답이 있어요. 몇 초 뒤에 다시 보내 주세요.',
  too_many: '한 시간에 보낼 수 있는 답을 넘었어요. 잠시 뒤에 다시 보내 주세요.',
  closed: '닫힌 질문이라 답을 달 수 없어요.',
  empty: '답을 적어 주세요.',
  too_long: `답은 ${ANSWER_MAX}자까지 쓸 수 있어요.`,
  busy: '잠시 뒤에 다시 보내 주세요.',
};

export function GuestPage({ token, view, sent, err }: { token: string; view: GuestView; sent: string | null; err: { code: string; q: string | null } | null }) {
  const waiting = view.questions.filter((q) => q.status === 'open').length;
  const action = `/q/${token}/answer`;
  return (
    <div className="qg">
      <GuestStyle />
      <div className="wrap">
        <header>
          <h1>{view.name}님께 드리는 질문</h1>
          <p className="lede">아는 만큼만 편하게 적어 주세요. 질문마다 아래 칸에 답을 쓰고 「답 보내기」를 누르면 바로 전해져요.</p>
          <p className="count"><span>질문 {view.questions.length}개</span><span>답 기다림 {waiting}개</span></p>
          {/* 어느 질문에 단 답인지 알면 그 질문 칸 안에 알린다(화면이 그 칸으로 내려가므로) */}
          {sent === '1' && <p className="notice ok" role="status">답을 보냈어요. 고마워요!</p>}
          {err && !err.q && <p className="notice bad" role="alert">{ERR_TEXT[err.code] ?? '보내지 못했어요. 잠시 뒤에 다시 보내 주세요.'}</p>}
        </header>
        {view.questions.length === 0 && <p className="empty">아직 받은 질문이 없어요.</p>}
        <ol>
          {view.questions.map((q, i) => (
            <li key={q.id} id={`q-${q.id}`} className="card">
              <div className="head">
                <span className="num">{i + 1}</span>
                <span className={`chip ${q.status}`}>{STATUS_LABEL[q.status]}</span>
              </div>
              <p className="q">{q.text}</p>
              {q.answers.length > 0 && (
                <ul className="answers" aria-label="답">
                  {q.answers.map((a) => (
                    <li key={a.id} className={`answer${a.mine ? ' mine' : ''}`}>
                      <div className="who"><span>{a.by}</span><span>{kst(a.at)}</span></div>
                      <p className="atext">{a.text}</p>
                    </li>
                  ))}
                </ul>
              )}
              {sent === q.id && <p className="notice ok" role="status">답을 보냈어요. 고마워요!</p>}
              {err && err.q === q.id && <p className="notice bad" role="alert">{ERR_TEXT[err.code] ?? '보내지 못했어요. 잠시 뒤에 다시 보내 주세요.'}</p>}
              {q.status === 'closed' ? (
                <p className="closedmsg">닫힌 질문이에요. 더 답하지 않아도 돼요.</p>
              ) : (
                <form method="post" action={action}>
                  <input type="hidden" name="q" value={q.id} />
                  <div className="hp" aria-hidden="true"><label>비워 두세요<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label></div>
                  <label className="l" htmlFor={`t-${q.id}`}>{q.answers.length > 0 ? '덧붙일 말' : '답'}</label>
                  <textarea id={`t-${q.id}`} name="text" required maxLength={ANSWER_MAX} placeholder="여기에 적어 주세요" />
                  <div className="row">
                    <span className="hint">{ANSWER_MAX}자까지</span>
                    <button type="submit">답 보내기</button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ol>
        <footer>이 링크는 {view.name}님만 쓰도록 만든 주소예요. 다른 사람에게 보내지 말아 주세요.</footer>
      </div>
    </div>
  );
}
