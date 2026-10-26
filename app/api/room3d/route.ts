import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getActor } from '@/lib/session';

// 꾸미기 › 3D 시안 HTML. 로그인한 두 사람만 받는다(파일은 private/ — git 에 안 올리고 배포에만 싣는다. DESIGN.md 11장).
// 이 사이트 안 iframe(sandbox="allow-scripts")에 뜨고, 응답 헤더(next.config.ts)에도 CSP sandbox 가 붙어 새 창으로 열어도 출처가 null 이다
// → 시안이 불러오는 외부 스크립트가 로그인 쿠키로 현황 API 를 부르지 못한다.
// 시안 내용은 고치지 않고 붙이기만 한다: ?theme=light|dark 면 <html data-theme>, </head> 앞에 사이트 색 · 서체로 덮는 <style>,
// </body> 앞에 높이 알림 스크립트(부모가 iframe 높이를 맞춘다). 문서 제목은 하위 탭과 같은 「3D 시안」으로 바꾼다(DESIGN.md 9장: 호수를 쓰지 않는다).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILE = path.join(process.cwd(), 'private', 'room3d.html');
const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'private, no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow',
  vary: 'Cookie',
};

// 같은 출처가 아니라 부모가 iframe 안을 못 읽으니, 문서 높이를 부모에게 알린다(부모는 이 iframe 에서 온 것만 받는다).
// <html> 의 scrollHeight 는 iframe 높이보다 작아지지 않아(한 번 늘면 줄지 않는다) 내용 높이인 <body> 를 잰다.
// 소수점 높이를 내림하면 1px 미만이 넘쳐 iframe 안에 스크롤 막대가 생기고 폭이 줄어 높이가 또 바뀐다 → 올림 + 2px.
const HEIGHT_SCRIPT = `<script>(function(){var b=document.body;function p(){try{parent.postMessage({type:'room3d:height',h:Math.ceil(Math.max(b.scrollHeight,b.getBoundingClientRect().height))+2},'*')}catch(e){}}addEventListener('load',p);if(window.ResizeObserver)new ResizeObserver(p).observe(b);p();})();</script>`;

// 시안의 크림 · 오커 · 테라코타 · 둘째 서체를 사이트 값(DESIGN.md 토큰)으로 덮는다. 시안의 :root 와 같은 선택자를 뒤에 두어 이긴다.
// 장면 위 이름표(.lbl)는 늘 흰 바탕이라 밝은 값으로 고정한다. 제목(h1)은 하위 탭 「3D 시안」과 겹쳐 숨긴다.
const LIGHT_VARS =
  '--bg:#f5f6f8;--surface:#fff;--surface-2:#eef0f3;--chip:#eef0f3;--scene-bg:#eef0f3;--line:#e2e5e9;--text:#1a1d21;--muted:#646c76;--accent:#0b7285;--accent-ink:#fff;--warn:#c92a2a;--pad-bg:rgba(255,255,255,.82);--pad-ink:#1a1d21';
const DARK_VARS =
  '--bg:#111316;--surface:#1a1d22;--surface-2:#22262c;--chip:#22262c;--scene-bg:#22262c;--line:#343941;--text:#e6e8eb;--muted:#9aa1ab;--accent:#0b7285;--accent-ink:#fff;--warn:#ff8787;--pad-bg:rgba(26,29,34,.82);--pad-ink:#e6e8eb';
const SITE_STYLE =
  `<style>:root{${LIGHT_VARS}}` +
  `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${DARK_VARS}}}` +
  `:root[data-theme="dark"]{${DARK_VARS}}` +
  `body{font-family:'Pretendard',-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif}` +
  `input[type=checkbox]{accent-color:#0b7285}` +
  `h1{display:none}` +
  `.lbl{color:#1a1d21}.lbl small{color:#646c76}.lbl.issue{background:#fff5f5;color:#c92a2a;border-color:#c92a2a}</style>`;

const note = (title: string) =>
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title></head>` +
  `<body style="margin:0;font:15px/1.6 system-ui,sans-serif;padding:24px 16px;color:#1a1d21;background:#f5f6f8"><p>${title}</p></body></html>`;

async function handle(req: Request, head: boolean): Promise<Response> {
  const a = await getActor(req);
  if (!a.ok) {
    const msg = a.status === 401 ? '로그인한 사람만 볼 수 있어요' : '허용되지 않은 계정이에요';
    return new Response(head ? null : note(msg), { status: a.status, headers: HEADERS });
  }

  let html: string;
  try {
    html = await readFile(FILE, 'utf8');
  } catch {
    return new Response(head ? null : note('3D 시안 파일이 아직 없어요'), { status: 404, headers: HEADERS });
  }
  if (head) return new Response(null, { status: 200, headers: HEADERS });

  const theme = new URL(req.url).searchParams.get('theme');
  if (theme === 'light' || theme === 'dark') html = html.replace(/<html\b/i, `<html data-theme="${theme}"`);
  html = html.replace(/<title>[^<]*<\/title>/i, '<title>3D 시안</title>');
  const headEnd = html.toLowerCase().indexOf('</head>');
  html = headEnd >= 0 ? `${html.slice(0, headEnd)}${SITE_STYLE}${html.slice(headEnd)}` : `${SITE_STYLE}${html}`;
  const end = html.toLowerCase().lastIndexOf('</body>');
  html = end >= 0 ? `${html.slice(0, end)}${HEIGHT_SCRIPT}${html.slice(end)}` : `${html}${HEIGHT_SCRIPT}`;
  return new Response(html, { status: 200, headers: HEADERS });
}

export function GET(req: Request) {
  return handle(req, false);
}

export function HEAD(req: Request) {
  return handle(req, true);
}
