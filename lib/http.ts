// 현황 API 공용 응답 헤더·요청 검사.

// 개인정보가 담긴 응답: 브라우저·CDN·프록시 어디에도 저장하지 않는다.
export const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };

// 쓰기 요청(CSRF 방어): 다른 사이트에서 날아온 요청은 거른다.
// - JSON 본문만 받는다(다른 출처의 fetch 는 사전 요청(preflight)에서 막히고, HTML 폼은 JSON 을 못 보낸다).
// - 브라우저가 붙이는 Sec-Fetch-Site 가 있으면 same-origin 이어야 한다.
// - Origin 이 있으면 이 서버 주소와 같아야 한다(파싱 못 하는 값·"null" 도 거절).
// CLI·검증 스크립트처럼 브라우저가 아닌 호출은 쿠키가 없으므로 위 헤더가 없어도 된다(로그인 검사에서 걸린다).
export function checkWriteRequest(req: Request): string | null {
  const ct = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (ct !== 'application/json') return 'bad_content_type';
  return checkOrigin(req);
}

// 사진 올리기(multipart): HTML 폼도 multipart 를 보낼 수 있으므로 JSON 검사 대신 직접 붙이는 헤더를 요구한다.
// 다른 출처에서 이 헤더를 붙이면 사전 요청(preflight)에서 막히고, HTML 폼은 헤더를 못 붙인다.
export const UPLOAD_HEADER = 'x-photos-upload';
export function checkUploadRequest(req: Request): string | null {
  const ct = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (ct !== 'multipart/form-data') return 'bad_content_type';
  if (req.headers.get(UPLOAD_HEADER) !== '1') return 'bad_origin';
  return checkOrigin(req);
}

function checkOrigin(req: Request): string | null {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return 'bad_origin';
  const origin = req.headers.get('origin');
  if (origin) {
    let host: string;
    try { host = new URL(origin).host; } catch { return 'bad_origin'; }
    const hosts = [req.headers.get('host'), req.headers.get('x-forwarded-host')].filter(Boolean);
    if (!hosts.includes(host)) return 'bad_origin';
  }
  return null;
}
