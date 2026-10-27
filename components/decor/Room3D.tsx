'use client';

import { useEffect, useRef, useState } from 'react';
import { useIsDark } from '@/lib/client/theme';
import { devHeaders } from '@/components/progress/ProgressProvider';
import { textBtn } from '@/components/progress/bits';

// 꾸미기 › 3D 시안: /api/room3d(누구나 봄) 를 iframe 에 띄운다.
// 같은 출처 권한을 주지 않는다(sandbox="allow-scripts", allow-same-origin 없음) — 시안이 불러오는 외부 스크립트가
// 로그인 쿠키로 현황 API 를 부르거나 이 화면을 건드리지 못하게. 그래서 높이는 iframe 이 postMessage 로 알려 주고, 화면 모드는 ?theme= 로 넘긴다.
// 고른 상태(시안 · 켠 항목 · 문)도 iframe 이 저장하지 못하니 이 화면이 맡는다: 로그인했으면 /api/decor/room3d-state 로 불러와
// room3d:restore · room3d:auth(값) 로 넘기고, iframe 이 room3d:state 로 알려 주면 저장한다. 로그인 안 했으면 저장 없이 기본안.
// iframe 쪽 출처가 null 이라 '*' 로만 보낼 수 있다 — 그래서 상태(항목 id · 문 · 시안 · 항목별 모양 · 치수 보기)와 값 표만 싣는다.
// 가구 배치(이름 붙여 저장한 것)도 같은 길: iframe 이 room3d:layout-op 로 부탁 → 이 화면이 /api/decor/room3d-layouts 를 불러 room3d:layout-res 로 돌려준다.
// 배치에는 가구 묶음 id · 옮긴 거리 · 돌린 횟수와 이름 · 저장한 사람 · 시각만 있다.
const MIN_H = 480;
const MAX_H = 5000;   // 폭이 좁은 폰에서 시안 내용이 3000px 남짓 + 가구 고르기 목록(장면 아래, 목록은 창 높이 60% 안에서 밀림)까지 안쪽 스크롤이 안 생기게
const DEFAULT_H = 640;

type State = 'checking' | 'ok' | 'anon' | 'forbidden' | 'missing' | 'error';
// 화면 전체로 크게 보기: native = 브라우저 전체 화면(Fullscreen API), overlay = 그게 안 되는 곳(아이폰 사파리 등)에서 화면을 꽉 채운 고정 겹침
type Fs = 'off' | 'native' | 'overlay';
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void };
type FsEl = HTMLDivElement & { webkitRequestFullscreen?: () => void };
const fsElement = () => document.fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;
// 켜기: 브라우저 전체 화면을 먼저 해 보고(켜지면 fullscreenchange 가 'native' 로 맞춘다), 안 되면 겹침
function enterFs(el: FsEl | null, setFs: (f: Fs) => void) {
  if (!el) return;
  const can = document.fullscreenEnabled || (document as FsDoc).webkitFullscreenEnabled;
  if (can && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => setFs('overlay'));
  else if (can && el.webkitRequestFullscreen) { try { el.webkitRequestFullscreen(); } catch { setFs('overlay'); } }
  else setFs('overlay');
}
function exitFs(setFs: (f: Fs) => void) {
  if (fsElement()) {
    if (document.exitFullscreen) void document.exitFullscreen().catch(() => {});
    else (document as FsDoc).webkitExitFullscreen?.();
  }
  setFs('off');
}
type SavedState = { concept: string; on: string[]; doors: Record<string, boolean>; variants?: Record<string, string>; dims?: boolean };
type Saved = { member: boolean; state: SavedState | null; prices: Record<string, [number, number]>; layouts: unknown[] | null };

// 이름 붙여 저장한 가구 배치(/api/decor/room3d-layouts). iframe 이 room3d:layout-op 로 부탁하면 이 화면이 대신 부르고
// room3d:layout-res 로 결과(목록 전체)를 돌려준다. 모양 검사는 서버가 한다 — 여기서는 크기 · 종류만 거른다.
// 마지막으로 불러온 배치 id 는 이 브라우저에만 기억해 두었다가(localStorage) 다시 열 때 그 배치로 연다.
const LAYOUT_API = '/api/decor/room3d-layouts';
const LAST_LAYOUT = 'room3d:last-layout';
const LAYOUT_ID_RE = /^l-[0-9a-f]{8}$/;
type LayoutOp = { op: 'list' | 'create' | 'update' | 'rename' | 'delete'; req: number; id?: string; name?: string; layout?: unknown };
function asLayoutOp(v: unknown): LayoutOp | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!['list', 'create', 'update', 'rename', 'delete'].includes(o.op as string) || typeof o.req !== 'number' || !Number.isFinite(o.req)) return null;
  if (o.id !== undefined && (typeof o.id !== 'string' || !LAYOUT_ID_RE.test(o.id))) return null;
  if (o.name !== undefined && (typeof o.name !== 'string' || o.name.length > 200)) return null;
  if (o.layout !== undefined && (!o.layout || typeof o.layout !== 'object' || JSON.stringify(o.layout).length > 6000)) return null;
  return { op: o.op as LayoutOp['op'], req: o.req, id: o.id as string | undefined, name: o.name as string | undefined, layout: o.layout };
}
const readLast = () => { try { const v = localStorage.getItem(LAST_LAYOUT); return v && LAYOUT_ID_RE.test(v) ? v : null; } catch { return null; } };
const writeLast = (id: string | null) => { try { if (id) localStorage.setItem(LAST_LAYOUT, id); else localStorage.removeItem(LAST_LAYOUT); } catch { /* 저장 못 해도 괜찮다 */ } };
async function runLayoutOp(op: LayoutOp): Promise<Record<string, unknown>> {
  if (op.op === 'list') {
    try {
      const res = await fetch(LAYOUT_API, { cache: 'no-store', headers: devHeaders() });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return res.ok ? { ok: true, items: Array.isArray(j.items) ? j.items : null } : { ok: false, error: typeof j.error === 'string' ? j.error : 'server_error' };
    } catch { return { ok: false, error: 'network' }; }
  }
  const method = op.op === 'create' ? 'POST' : op.op === 'delete' ? 'DELETE' : 'PUT';
  const body = op.op === 'create' ? { name: op.name, layout: op.layout }
    : op.op === 'update' ? { id: op.id, layout: op.layout }
    : op.op === 'rename' ? { id: op.id, name: op.name } : { id: op.id };
  try {
    const res = await fetch(LAYOUT_API, { method, cache: 'no-store', headers: { 'content-type': 'application/json', ...devHeaders() }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return res.ok ? { ok: true, item: j.item ?? null, items: Array.isArray(j.items) ? j.items : null } : { ok: false, error: typeof j.error === 'string' ? j.error : 'server_error' };
  } catch {
    return { ok: false, error: 'network' };
  }
}

const ID_RE = /^[a-z0-9-]{1,40}$/;
const DOOR_KEYS = ['big', 'small', 'util', 'bath', 'ent'];
const VARIANT_RE = /^[a-z0-9-]{1,20}$/;
// iframe · 서버에서 온 값을 그대로 믿지 않고 모양만 골라 담는다
function asState(v: unknown): SavedState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.concept !== 'string' || !/^[A-F]$/.test(o.concept)) return null;
  if (!Array.isArray(o.on) || o.on.length > 200 || !o.on.every((id) => typeof id === 'string' && ID_RE.test(id))) return null;
  const doors: Record<string, boolean> = {};
  if (o.doors && typeof o.doors === 'object') {
    for (const k of DOOR_KEYS) { const b = (o.doors as Record<string, unknown>)[k]; if (typeof b === 'boolean') doors[k] = b; }
  }
  const s: SavedState = { concept: o.concept, on: o.on as string[], doors };
  // 항목별 고른 모양(창 가리개 등): 짧은 이름만, 40개까지. 모양이 틀린 칸은 뺀다(나머지 상태는 그대로)
  if (o.variants && typeof o.variants === 'object' && !Array.isArray(o.variants)) {
    const variants: Record<string, string> = {};
    for (const [id, k] of Object.entries(o.variants as Record<string, unknown>).slice(0, 40)) {
      if (ID_RE.test(id) && typeof k === 'string' && VARIANT_RE.test(k)) variants[id] = k;
    }
    s.variants = variants;
  }
  if (typeof o.dims === 'boolean') s.dims = o.dims;
  return s;
}
function asPrices(v: unknown): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [id, p] of Object.entries(v as Record<string, unknown>)) {
    if (ID_RE.test(id) && Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n))) out[id] = [p[0], p[1]];
  }
  return out;
}

// 로그인했을 때만: 저장한 상태 · 값 표를 iframe 에 넘긴다
function handOver(win: Window | null | undefined, s: Saved | null) {
  if (!win || !s || !s.member) return;
  if (s.state) win.postMessage({ type: 'room3d:restore', ...s.state }, '*');
  win.postMessage({ type: 'room3d:auth', prices: s.prices }, '*');
  if (s.layouts) win.postMessage({ type: 'room3d:layouts', items: s.layouts, current: readLast() }, '*');
}

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
  const wrapRef = useRef<HTMLDivElement>(null);
  // iframe 이 room3d:ready 를 보내기 전엔 그 자리에 「3D 불러오는 중…」을 덮어 둔다(빈 상자로 멈춘 듯 보이지 않게). 화면 모드가 바뀌어 다시 불러올 때도 같다.
  const [readySrc, setReadySrc] = useState<string | null>(null);

  // 전체 화면: 단추는 3D 장면 안(iframe)에 있고, 누르면 room3d:fs 로 알려 온다. 이 화면이 iframe 감싸개를 전체 화면으로 만든다
  // (iframe 이 스스로 전체 화면을 켜는 게 아니라 allow="fullscreen" 은 필요 없다). 안 되면 화면을 꽉 채운 겹침(100dvh)으로 대신한다.
  const [fs, setFs] = useState<Fs>('off');
  const fsOn = useRef(false);
  useEffect(() => {
    const onChange = () => setFs((prev) => (fsElement() === wrapRef.current && wrapRef.current ? 'native' : prev === 'native' ? 'off' : prev));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFs((prev) => (prev === 'overlay' ? 'off' : prev)); };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  // 상태가 바뀌면 iframe 에 알린다(장면이 화면을 꽉 채우는 모양으로 바뀐다). 겹침일 땐 뒤 페이지가 밀리지 않게 막는다.
  useEffect(() => {
    fsOn.current = fs !== 'off';
    frameRef.current?.contentWindow?.postMessage({ type: 'room3d:fsstate', on: fs !== 'off' }, '*');
    if (fs !== 'overlay') return;
    const root = document.documentElement, prev = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => { root.style.overflow = prev; };
  }, [fs]);

  // 먼저 HEAD 로 확인한다: 파일이 없으면 iframe 안에 오류 화면을 띄우는 대신 이 화면에서 한 줄로 알린다. 「다시 불러오기」 = tries 하나 올림.
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    void probe().then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, [tries]);

  // 고른 상태: 로그인했으면 불러 둔다(member). 안 했으면(401 · 403) 저장 없이 기본안.
  const saved = useRef<Saved | null>(null);
  const frameReady = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/decor/room3d-state', { cache: 'no-store', headers: devHeaders() })
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) { saved.current = { member: false, state: null, prices: {}, layouts: null }; return; }
        const j = (await res.json()) as { state?: unknown; prices?: unknown };
        // 저장한 배치 목록도 같이(못 읽으면 빈 목록 — 저장은 해 볼 수 있게)
        const lj = await fetch(LAYOUT_API, { cache: 'no-store', headers: devHeaders() })
          .then((r) => (r.ok ? (r.json() as Promise<{ items?: unknown }>) : null)).catch(() => null);
        if (!alive) return;
        saved.current = { member: true, state: asState(j.state), prices: asPrices(j.prices), layouts: Array.isArray(lj?.items) ? lj.items : [] };
        if (frameReady.current) handOver(frameRef.current?.contentWindow, saved.current);
      })
      .catch(() => { if (alive) saved.current = { member: false, state: null, prices: {}, layouts: null }; });
    return () => { alive = false; if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  // 이 iframe 에서 온 알림만 받는다(다른 창 · 다른 iframe 의 메시지는 무시).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const win = frameRef.current?.contentWindow;
      if (!win || e.source !== win) return;
      const d = e.data as { type?: unknown; h?: unknown } | null;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'room3d:ready') {
        frameReady.current = true; handOver(win, saved.current);
        setReadySrc(frameRef.current?.getAttribute('src') ?? null);
        win.postMessage({ type: 'room3d:fsstate', on: fsOn.current }, '*');
        return;
      }
      if (d.type === 'room3d:fs') { if ((d as { on?: unknown }).on === true) enterFs(wrapRef.current, setFs); else exitFs(setFs); return; }
      if (d.type === 'room3d:layout-op') {
        const op = asLayoutOp(d), s = saved.current;
        if (!op) return;
        if (!s || !s.member) { win.postMessage({ type: 'room3d:layout-res', req: op.req, ok: false, error: 'unauthorized' }, '*'); return; }
        void runLayoutOp(op).then((r) => {
          if (Array.isArray(r.items)) s.layouts = r.items;
          frameRef.current?.contentWindow?.postMessage({ type: 'room3d:layout-res', req: op.req, ...r }, '*');
        });
        return;
      }
      if (d.type === 'room3d:layout-current') {
        const id = (d as { id?: unknown }).id;
        if (id === null || (typeof id === 'string' && LAYOUT_ID_RE.test(id))) writeLast(id);
        return;
      }
      if (d.type === 'room3d:state') {
        const s = saved.current, st = asState(d);
        if (!s || !s.member || !st) return;
        s.state = st;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          void fetch('/api/decor/room3d-state', {
            method: 'PUT', cache: 'no-store',
            headers: { 'content-type': 'application/json', ...devHeaders() },
            body: JSON.stringify(st),
          }).catch(() => {});
        }, 800);
        return;
      }
      if (d.type !== 'room3d:height' || typeof d.h !== 'number' || !Number.isFinite(d.h)) return;
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

  // 화면 모드가 바뀌면 src 가 바뀌어 다시 불러온다(시안이 <html data-theme> 로 장면 바탕을 고른다). 다시 불러오면 room3d:ready 가 또 와서 상태를 다시 넘긴다.
  const src = `/api/room3d?theme=${dark ? 'dark' : 'light'}${devAs()}`;
  const wrapCls = fs === 'overlay' ? 'fixed inset-0 z-[100] bg-page' : fs === 'native' ? 'bg-page' : '';
  const loading = readySrc !== src;
  return (
    <div>
      <div ref={wrapRef} className={wrapCls} style={fs === 'overlay' ? { height: '100dvh' } : undefined}>
        <div className="relative" style={fs === 'off' ? undefined : { height: '100%' }}>
          <iframe ref={frameRef} key={src} src={src} title="3D 시안" sandbox="allow-scripts" referrerPolicy="no-referrer"
            style={{ height: fs === 'off' ? height : '100%' }} className="block w-full" />
          {loading && (
            <div role="status" aria-busy="true" className="skeleton absolute inset-0 flex items-center justify-center rounded-panel bg-sunken">
              <span className="flex items-center gap-2 text-base font-bold text-ink-soft">
                <span aria-hidden className="inline-block size-[18px] animate-spin rounded-full border-2 border-line-strong border-t-ink motion-reduce:[animation-duration:2.4s]" />
                3D 불러오는 중…
              </span>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 flex justify-end">
        <a href={src} target="_blank" rel="noopener" className={textBtn}>
          새 창으로 크게 보기<i className="fas fa-arrow-up-right-from-square ml-1.5 text-sm" aria-hidden /><span className="sr-only">(새 탭)</span>
        </a>
      </p>
    </div>
  );
}
