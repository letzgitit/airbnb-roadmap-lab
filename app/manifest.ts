import type { MetadataRoute } from 'next';

/** 폰 홈 화면 바로가기 · 앱 설치 — 청록 바탕 흰 글자 「외도민」 아이콘(public/icon-192.png · icon-512.png). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '외도민 타임 라인',
    short_name: '외도민',
    start_url: '/',
    display: 'standalone',
    background_color: '#0B7285',
    theme_color: '#0B7285',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
