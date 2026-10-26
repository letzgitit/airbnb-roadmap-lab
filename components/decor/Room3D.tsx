'use client';

import { useEffect, useRef, useState } from 'react';
import { useIsDark } from '@/lib/client/theme';
import { devHeaders } from '@/components/progress/ProgressProvider';
import { textBtn } from '@/components/progress/bits';

// 꾸미기 › 3D 시안: /api/room3d(로그인 확인) 를 iframe 에 띄운다.
// 같은 출처 권한을 주지 않는다(sandbox="allow-scripts", allow-same-origin 없음) — 시안이 불러오는 외부 스크립트가
// 로그인 쿠키로 현황 API 를 부르거나 이 화면을 건드리지 못하게. 그래서 높이는 iframe 이 postMessage 로 알려 주고, 화면 모드는 ?theme= 로 넘긴다.
const MIN_H = 480;
const MAX_H = 3600;   // 폭이 좁은 폰에서 시안 내용이 3000px 남짓이라 안쪽 스크롤이 안 생기게(2026-10-26 실측: 폰 약 3040 · PC 약 2480)
const DEFAULT_H = 640;

type State = 'checking' | 'ok' | 'anon' | 'forbidden' | 'missing' | 'error';

// 개발 서버의 두 사람 흉내(?as=)를 iframe 주소에도 넘긴다(iframe 요청에는 머리글을 못 붙인다). 운영 빌드에선 빈 글자.
function devAs(): string {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return '';
  const as = new URLSearchParams(window.location.search).get('as');
  return as ? `&as=${encodeURIComponent(as)}` : '';
}

async function probe(): Promise<State> {
  try {
    const res = await fetch('/api/room3d', { method: 'HEAD', cache: 'no-store', headers: devHeaders() });
    return res.ok ? 'ok' : res.status === 401 ? 'anon' : res.status === 403 ? 'forbidden' : res.status === 404 ? 'missing' : 'error';
  } catch {
    return 'error';
  }
}

export function Room3D() {
  const dark = useIsDark();
  const [state, setState] = useState<State>('checking');
  const [height, setHeight] = useState(DEFAULT_H);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // 먼저 HEAD 로 확인한다: 로그인 · 파일이 없으면 iframe 안에 오류 화면을 띄우는 대신 이 화면에서 한 줄로 알린다. 「다시 불러오기」 = tries 하나 올림.
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    void probe().then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, [tries]);

  // 이 iframe 에서 온 높이 알림만 받는다(다른 창 · 다른 iframe 의 메시지는 무시).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const win = frameRef.current?.contentWindow;
      if (!win || e.source !== win) return;
      const d = e.data as { type?: unknown; h?: unknown } | null;
      if (!d || d.type !== 'room3d:height' || typeof d.h !== 'number' || !Number.isFinite(d.h)) return;
      setHeight(Math.min(MAX_H, Math.max(MIN_H, Math.ceil(d.h))));
      sendVh();
    };
    // iframe 안의 vh 는 iframe 높이(= 문서 전체)라 장면 높이가 늘 최대로 커진다 → 이 창 높이를 알려 준다(시안 쪽은 값이 같으면 무시).
    // 시안은 출처가 null 이라 대상 출처를 '*' 로만 보낼 수 있다(창 높이 숫자뿐이라 새어도 괜찮다).
    const sendVh = () => { frameRef.current?.contentWindow?.postMessage({ type: 'room3d:vh', h: window.innerHeight }, '*'); };
    window.addEventListener('message', onMessage);
    window.addEventListener('resize', sendVh);
    return () => { window.removeEventListener('message', onMessage); window.removeEventListener('resize', sendVh); };
  }, []);

  if (state === 'checking') {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">불러오는 중…</span>
        <span aria-hidden className="skeleton block w-full rounded-panel bg-sunken" style={{ height: DEFAULT_H }} />
      </div>
    );
  }
  if (state === 'anon') return <p className="py-6 text-base text-muted">로그인한 사람만 볼 수 있어요.</p>;
  if (state === 'forbidden') return <p className="py-6 text-base text-muted">허용되지 않은 계정이에요.</p>;
  if (state === 'missing') return <p className="py-6 text-base text-muted">3D 시안 파일이 아직 없어요.</p>;
  if (state === 'error') {
    return (
      <p className="py-6 text-base text-ink-soft">
        불러오지 못했어요.{' '}
        <button type="button" className={textBtn} onClick={() => { setState('checking'); setTries((n) => n + 1); }}>다시 불러오기</button>
      </p>
    );
  }

  // 화면 모드가 바뀌면 src 가 바뀌어 다시 불러온다(시안이 <html data-theme> 로 장면 바탕을 고른다)
  const src = `/api/room3d?theme=${dark ? 'dark' : 'light'}${devAs()}`;
  return (
    <div>
      <iframe ref={frameRef} key={src} src={src} title="3D 시안" sandbox="allow-scripts" referrerPolicy="no-referrer"
        style={{ height }} className="block w-full rounded-panel border border-line bg-surface" />
      <p className="mt-2 flex justify-end">
        <a href={src} target="_blank" rel="noopener" className={textBtn}>
          새 창으로 크게 보기<i className="fas fa-arrow-up-right-from-square ml-1.5 text-xs" aria-hidden /><span className="sr-only">(새 탭)</span>
        </a>
      </p>
    </div>
  );
}
