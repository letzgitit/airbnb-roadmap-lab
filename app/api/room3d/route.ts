import { readFile } from 'node:fs/promises';
import path from 'node:path';

// 꾸미기 › 3D 시안 HTML. 로그인 안 한 방문자에게도 보인다(2026-10-26 사이트 주인 결정 — 꾸미기는 골라서 공개).
// 파일은 그대로 private/ 에 둔다(공개 저장소엔 안 올리고 배포에만 싣는다. DESIGN.md 11장).
// 이 사이트 안 iframe(sandbox="allow-scripts")에 뜨고, 응답 헤더(next.config.ts)에도 CSP sandbox 가 붙어 새 창으로 열어도 출처가 null 이다
// → 시안이 불러오는 외부 스크립트가 로그인 쿠키로 현황 API 를 부르지 못한다.
// 시안 내용은 고치지 않고 붙이기만 한다: ?theme=light|dark 면 <html data-theme>, </head> 앞에 사이트 색 · 서체로 덮는 <style>,
// </body> 앞에 높이 알림 스크립트(부모가 iframe 높이를 맞춘다). 문서 제목 · 맨 위 제목(h1)은 하위 탭과 같은 「3D 시안」으로 바꾸고,
// 설명 메타(description)는 뺀다 — 시안 파일의 제목 · 설명에는 호수가 들어 있다(DESIGN.md 9장: 호수를 쓰지 않는다).
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
// 반대로 iframe 안의 vh 는 「iframe 높이 = 문서 전체 높이」라 장면(#view, 64vh)이 늘 최대 740px 로 커져 그림 위 · 아래에 빈칸이 생긴다.
// 그래서 부모가 자기 창 높이를 알려 주면(room3d:vh, 부모 창에서 온 것만) --pvh(창 높이의 1%)로 바꿔 쓴다. 새 창으로 열면 알림이 없어 원래 1vh 그대로.
const HEIGHT_SCRIPT = `<script>(function(){var b=document.body,r=document.documentElement,last=0;function p(){try{parent.postMessage({type:'room3d:height',h:Math.ceil(Math.max(b.scrollHeight,b.getBoundingClientRect().height))+2},'*')}catch(e){}}addEventListener('message',function(e){var d=e.data;if(e.source!==parent||parent===window||!d||d.type!=='room3d:vh'||typeof d.h!=='number'||!isFinite(d.h)||d.h<200)return;var h=Math.round(d.h);if(h===last)return;last=h;r.style.setProperty('--pvh',h/100+'px')});addEventListener('load',p);if(window.ResizeObserver)new ResizeObserver(p).observe(b);p();})();</script>`;

// 시안의 크림 · 오커 · 테라코타 · 둘째 서체를 사이트 값(DESIGN.md 토큰 — app/globals.css 의 데일리 형광펜 · 노랑 띠 값의 사본, 그쪽을 바꾸면 같이 바꾼다)으로 덮는다.
// 시안의 :root 와 같은 선택자를 뒤에 두어 이긴다. 바탕 · 면은 사이트 블록과 같은 흰 면(다크 #1c1e21), 장면 바탕은 사이트 바탕 회색.
// 장면 위 이름표(.lbl)는 늘 흰 바탕이라 밝은 값으로 고정한다. 제목(h1)은 하위 탭 「3D 시안」과 겹쳐 숨긴다.
// 「누르는 것」 색(--accent)은 사이트처럼 검정(다크는 흰 면 + 어두운 글자). 형광은 쓰지 않는다(누르지 않는 표시에만 쓰는 색).
const LIGHT_VARS =
  '--bg:#ffffff;--surface:#fff;--surface-2:#f2f2f2;--chip:#f2f2f2;--scene-bg:#f2f2f2;--line:#e4e4e4;--text:#262626;--muted:#6b6b6b;--accent:#000000;--accent-ink:#fff;--link:#000000;--warn:#c92a2a;--pad-bg:rgba(255,255,255,.86);--pad-ink:#000000;--raised:#fff;color-scheme:light';
const DARK_VARS =
  '--bg:#1c1e21;--surface:#1c1e21;--surface-2:#2a2c30;--chip:#2a2c30;--scene-bg:#131416;--line:#2e3033;--text:#e9e9e9;--muted:#949494;--accent:#ffffff;--accent-ink:#131416;--link:#ffffff;--warn:#ff5a5f;--pad-bg:rgba(28,30,33,.86);--pad-ink:#ffffff;--raised:#33363b;color-scheme:dark';
// --raised = 칸 묶음에서 고른 칸(어두운 화면에서도 묶음 바탕보다 밝게 떠 보이게)
// --link = 어두운 바탕 위 글자 단추(상태 줄 「저장」)도 4.5:1 넘게. color-scheme = 안 고른 체크박스 · 고르기 칸도 어두운 화면 모양으로
const SITE_STYLE =
  `<style>:root{${LIGHT_VARS}}` +
  `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${DARK_VARS}}}` +
  `:root[data-theme="dark"]{${DARK_VARS}}` +
  `body{font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Helvetica Neue','Malgun Gothic','Noto Sans KR',sans-serif}` +
  // 체크박스는 사이트와 같은 강조색(DESIGN.md 2.2 · globals.css)
  `input[type=checkbox]{accent-color:var(--accent)}` +
  `h1{display:none}` +
  // 장면 높이: 창 높이의 64%(폰 62%)이되, 위에서 볼 땐 집 모양(가로가 세로의 약 1.4배)에 맞춰 폭의 72%를 넘지 않게 — 집이 꽉 차고 위아래 빈칸이 안 남는다.
  // 눈높이로 걸을 땐 방 안이라 빈칸이 없으니 원래 높이 그대로. cqw = .stage 폭 기준.
  `.stage{container-type:inline-size}` +
  `#view{height:min(calc(var(--pvh,1vh)*64),72cqw);min-height:220px}#view.walk{height:calc(var(--pvh,1vh)*64);min-height:380px}` +
  `@media (max-width:600px){#view{height:min(calc(var(--pvh,1vh)*62),72cqw)}#view.walk{height:calc(var(--pvh,1vh)*62);min-height:360px}}` +
  `.lbl{color:#000000}.lbl small{color:#6b6b6b}.lbl.issue{background:#fdecec;color:#c92a2a;border-color:#c92a2a}</style>`;

const note = (title: string) =>
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title></head>` +
  `<body style="margin:0;font:16px/1.6 system-ui,sans-serif;padding:24px 16px;color:#222222;background:#ffffff"><p>${title}</p></body></html>`;

async function handle(req: Request, head: boolean): Promise<Response> {
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
  html = html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi, '<h1>3D 시안</h1>');
  html = html.replace(/<meta\s+[^>]*name=["']?(description|og:[a-z:]+|twitter:[a-z:]+)["']?[^>]*>/gi, '');
  html = html.replace(/<meta\s+[^>]*property=["']?og:[a-z:]+["']?[^>]*>/gi, '');
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
