import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
    ];
  },
};

export default nextConfig;
