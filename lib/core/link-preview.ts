import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';

// 「꾸미기 참고」에 올린 링크의 제목 · 대표 그림 읽기. 서버가 남이 준 주소로 요청을 보내므로(SSRF 위험) 여기가 보안 경계다.
//  - http · https 만, 포트는 80 · 443 만, 주소에 아이디 · 비밀번호가 붙은 것은 거절
//  - 호스트를 DNS 로 풀어 사설 · 루프백 · 링크로컬 · 메타데이터 IP 가 하나라도 섞이면 거절. 연결하는 순간에도 같은 검사를 한다(검사 뒤 DNS 가 바뀌는 속임수 방지)
//  - 리다이렉트는 3번까지, 단계마다 같은 검사. 전체 5초 · 읽는 양 1MB · 스크립트는 실행하지 않고 meta 태그만 정규식으로 뽑는다
//  - 그림은 서버에 저장하지 않고 주소만 돌려준다
// CLI 는 타입만 지우고 돌리므로(Node strip-types) 생성자 매개변수 속성 문법을 쓰지 않는다.

export class LinkBlockedError extends Error {
  constructor(message: string) { super(message); this.name = 'LinkBlockedError'; }
}

const TOTAL_MS = 5000;
const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// ── IP 검사 ──
function blockedV4(a: number, b: number, c: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;           // 공유 주소 공간(CGNAT)
  if (a === 169 && b === 254) return true;                      // 링크로컬 · 클라우드 메타데이터
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;             // 문서용
  if (a === 198 && (b === 18 || b === 19)) return true;        // 장비 시험용
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;                                    // 멀티캐스트 · 예약 · 브로드캐스트
  return false;
}

function parseV6(input: string): number[] | null {
  let s = input.toLowerCase();
  if (s.includes('%')) return null;
  const m = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (m) {
    const v = m[2].split('.').map(Number);
    if (v.length !== 4 || v.some((n) => !(n >= 0 && n <= 255))) return null;
    s = `${m[1]}${((v[0] << 8) | v[1]).toString(16)}:${((v[2] << 8) | v[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const groups = (p: string) => (p === '' ? [] : p.split(':'));
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && head.length + tail.length > 7) return null;
  const all = halves.length === 1 ? head : [...head, ...Array<string>(8 - head.length - tail.length).fill('0'), ...tail];
  const out: number[] = [];
  for (const g of all) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    out.push(n >> 8, n & 255);
  }
  return out;
}

/** 이 IP 로는 연결하지 않는다. 읽을 수 없는 주소도 막는다 */
export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split('.').map(Number);
    return blockedV4(a, b, c);
  }
  if (!net.isIPv6(ip)) return true;
  const x = parseV6(ip);
  if (!x) return true;
  const zero = (from: number, to: number) => x.slice(from, to).every((n) => n === 0);
  if (zero(0, 16)) return true;                                           // ::
  if (zero(0, 15) && x[15] === 1) return true;                            // ::1
  if (zero(0, 10) && x[10] === 0xff && x[11] === 0xff) return blockedV4(x[12], x[13], x[14]);   // ::ffff:a.b.c.d
  if (zero(0, 12)) return true;                                           // ::a.b.c.d (옛 방식)
  if (x[0] === 0 && x[1] === 0x64 && x[2] === 0xff && x[3] === 0x9b && zero(4, 12)) return blockedV4(x[12], x[13], x[14]); // 64:ff9b::/96
  if (x[0] === 0x20 && x[1] === 0x02) return blockedV4(x[2], x[3], x[4]);                // 6to4
  if ((x[0] & 0xfe) === 0xfc) return true;                                // fc00::/7
  if (x[0] === 0xfe) return true;                                         // fe80::/10 · fec0::/10
  if (x[0] === 0xff) return true;                                         // 멀티캐스트
  if (x[0] === 0x20 && x[1] === 0x01 && x[2] === 0 && x[3] === 0) return true;           // 테레도
  if (x[0] === 0x20 && x[1] === 0x01 && x[2] === 0x0d && x[3] === 0xb8) return true;     // 문서용
  if (x[0] === 0x01 && x[1] === 0 && zero(2, 8)) return true;             // 100::/64
  return false;
}

const bare = (host: string) => host.replace(/^\[|\]$/g, '');

/** 주소 모양 검사(DNS 전). 통과하면 URL, 아니면 LinkBlockedError */
export function checkUrlShape(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new LinkBlockedError('주소 모양이 올바르지 않아요.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new LinkBlockedError('http 나 https 주소만 올릴 수 있어요.');
  if (u.username || u.password) throw new LinkBlockedError('아이디 · 비밀번호가 든 주소는 올릴 수 없어요.');
  if (u.port && u.port !== '80' && u.port !== '443') throw new LinkBlockedError('이 주소는 올릴 수 없어요.');
  const host = bare(u.hostname);
  if (!host) throw new LinkBlockedError('주소 모양이 올바르지 않아요.');
  if (net.isIP(host) && isBlockedIp(host)) throw new LinkBlockedError('이 주소는 올릴 수 없어요.');
  return u;
}

type Addr = { address: string; family: number };
const resolveAll = (host: string): Promise<Addr[]> => new Promise((resolve, reject) => {
  dns.lookup(host, { all: true, verbatim: true }, (err, addrs) => (err ? reject(err) : resolve(addrs)));
});

async function assertPublicHost(host: string) {
  if (net.isIP(host)) return;                      // 숫자 주소는 checkUrlShape 에서 이미 봤다
  const addrs = await resolveAll(host);
  if (addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address))) throw new LinkBlockedError('이 주소는 올릴 수 없어요.');
}

// 연결할 때 쓰는 DNS 조회: 여기서도 막힌 IP 가 섞이면 연결하지 않는다
const safeLookup = ((host: string, options: dns.LookupOptions, cb: (err: Error | null, a?: string | Addr[], f?: number) => void) => {
  dns.lookup(host, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err);
    if (addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address))) return cb(new LinkBlockedError('이 주소는 올릴 수 없어요.'));
    if (options?.all) return cb(null, addrs);
    return cb(null, addrs[0].address, addrs[0].family);
  });
}) as unknown as net.LookupFunction;

// ── 한 번 요청 ──
type Hop = { kind: 'redirect'; location: string } | { kind: 'page'; html: string; contentType: string } | { kind: 'other' };

function requestOnce(u: URL, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      protocol: u.protocol, hostname: bare(u.hostname), port: u.port || undefined, path: `${u.pathname}${u.search}`, method: 'GET',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.7', 'accept-encoding': 'gzip, deflate, br' },
      lookup: safeLookup, signal,
    }, (res) => {
      const status = res.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
        res.resume();
        resolve({ kind: 'redirect', location: String(res.headers.location) });
        return;
      }
      const type = String(res.headers['content-type'] ?? '');
      if (status < 200 || status >= 300 || !/html|xml/i.test(type)) { res.destroy(); resolve({ kind: 'other' }); return; }
      const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
      let stream: NodeJS.ReadableStream = res;
      if (enc === 'gzip' || enc === 'x-gzip') stream = res.pipe(zlib.createGunzip());
      else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
      else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
      else if (enc && enc !== 'identity') { res.destroy(); resolve({ kind: 'other' }); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        res.destroy();
        const buf = Buffer.concat(chunks);
        const charset = /charset=["']?([\w-]+)/i.exec(type)?.[1] ?? 'utf-8';
        let html: string;
        try { html = new TextDecoder(charset).decode(buf); } catch { html = buf.toString('utf8'); }
        resolve({ kind: 'page', html, contentType: type });
      };
      stream.on('data', (c: Buffer) => {
        chunks.push(c);
        size += c.length;
        // 필요한 건 <head> 안의 meta 뿐: 닫히면 그만 읽는다
        if (size >= MAX_BYTES || /<\/head\s*>/i.test(c.toString('latin1'))) finish();
      });
      stream.on('end', finish);
      stream.on('error', () => finish());
    });
    req.on('error', reject);
    req.end();
  });
}

// ── meta 뽑기 ──
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, g: string) => {
    if (g[0] === '#') {
      const n = g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[g.toLowerCase()] ?? all;
  });
}
const clean = (s: string | undefined, max: number) => {
  const t = decodeEntities(s ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

export function parseMeta(html: string, base: URL): { title: string | null; image: string | null } {
  const head = html.slice(0, MAX_BYTES);
  const meta = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content !== undefined && !meta.has(key)) meta.set(key, attrs.content);
  }
  const pageTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const title = clean(meta.get('og:title') ?? meta.get('twitter:title') ?? pageTitle, 150);
  let image: string | null = null;
  for (const k of ['og:image', 'og:image:secure_url', 'og:image:url', 'twitter:image', 'twitter:image:src']) {
    const v = clean(meta.get(k), 2000);
    if (!v) continue;
    try {
      const abs = new URL(v, base);
      if (abs.protocol === 'https:' || abs.protocol === 'http:') { image = abs.toString(); break; }
    } catch { /* 다음 후보 */ }
  }
  return { title, image };
}

export interface Preview { title: string | null; image: string | null; finalUrl: string; fetched: boolean }

/**
 * 링크의 제목 · 대표 그림 읽기. 주소가 막혀야 하는 것이면 LinkBlockedError 를 던진다.
 * 그 밖의 실패(시간 초과 · 사이트가 막음 · 그림 없음)는 던지지 않고 fetched=false 로 돌려준다.
 */
export async function fetchPreview(rawUrl: string): Promise<Preview> {
  let u = checkUrlShape(rawUrl);
  // 네이버 블로그 PC 주소는 껍데기 화면(meta 없음)만 줘서 모바일 주소로 읽는다. 저장하는 링크는 그대로.
  if (u.hostname === 'blog.naver.com' && /^\/[^/]+\/\d+\/?$/.test(u.pathname)) u = new URL(`https://m.blog.naver.com${u.pathname}`);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TOTAL_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(bare(u.hostname));
      const r = await requestOnce(u, ctl.signal);
      if (r.kind === 'redirect') {
        if (hop === MAX_REDIRECTS) break;
        u = checkUrlShape(new URL(r.location, u).toString());
        continue;
      }
      if (r.kind === 'page') {
        const m = parseMeta(r.html, u);
        return { ...m, finalUrl: u.toString(), fetched: !!(m.title || m.image) };
      }
      break;
    }
  } catch (e) {
    if (e instanceof LinkBlockedError || (e as { cause?: unknown })?.cause instanceof LinkBlockedError) throw e instanceof LinkBlockedError ? e : (e as { cause: LinkBlockedError }).cause;
    /* 시간 초과 · 연결 실패 등은 아래에서 빈 결과로 */
  } finally {
    clearTimeout(timer);
  }
  return { title: null, image: null, finalUrl: rawUrl, fetched: false };
}
