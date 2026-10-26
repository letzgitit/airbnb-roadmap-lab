import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // 3D 시안 HTML 은 git 에 안 올리고(private/ 는 .gitignore) 배포에만 싣는다. 라우트 핸들러가 fs 로 읽으니 서버 묶음에 넣어 준다.
  outputFileTracingIncludes: {
    '/api/room3d': ['./private/room3d.html'],
    // 3D 시안 살 것 값 표(로그인한 사람에게만 상태 라우트가 실어 준다)
    '/api/decor/room3d-state': ['./private/room3d-prices.json'],
    // 사진 시안: 목록 라우트도 어떤 사진이 있는지(readdir) 보므로 둘 다 폴더째 싣는다. 키는 라우트 경로 글롭('[file]' 은 글롭에서 글자 묶음이라 '*')
    '/api/restyle': ['./private/restyle/**/*'],
    '/api/restyle/*': ['./private/restyle/**/*'],
  },
  // 옛 주소(구조 개편 전 북마크 · 홈 화면 바로가기)
  async redirects() {
    return [
      { source: '/plan', destination: '/money', permanent: false },
      { source: '/questions', destination: '/house/questions', permanent: false },
      // 꾸미기 첫 탭은 3D 시안(참고 모음은 /decor/refs 로 옮김)
      { source: '/decor', destination: '/decor/3d', permanent: false },
    ];
  },
  async headers() {
    return [
      {
        // 다른 사이트가 이 화면을 iframe 으로 덮어 클릭을 훔치지 못하게(현황 삭제 버튼 등)
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // 현황 API 는 어떤 캐시에도 남기지 않는다(라우트에서도 붙이지만 이중으로)
        source: '/api/progress/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
      {
        // 손님 링크(/q/<토큰>): 질문 · 답이 실린 화면이라 캐시에 남기지 않고 검색에도 안 올린다
        source: '/q/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
        ],
      },
      {
        // 사진 API(목록 · 바이트)도 같다: CDN · 공유 캐시에 사진이 남지 않게
        source: '/api/photos/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
      {
        // 사진 시안(목록 · 사진)도 같다: 집 안 사진이라 CDN · 공유 캐시에 남기지 않는다
        source: '/api/restyle/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
      {
        // 3D 시안: 이 사이트 안 iframe 에만 띄운다. 맨 위 규칙의 DENY · frame-ancestors 'none' 을 덮는다(뒤 규칙이 같은 헤더를 이긴다).
        // 외부 스크립트(three.js 등)가 로그인 쿠키로 현황 API 를 부르지 못하게 같은 출처 권한 없이(sandbox) 돌린다 — 새 창으로 열어도 같다.
        source: '/api/room3d',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "sandbox allow-scripts; frame-ancestors 'self'" },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
