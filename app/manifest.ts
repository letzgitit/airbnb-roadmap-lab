import type { MetadataRoute } from 'next';

/** 폰 홈 화면 바로가기 · 앱 설치 — 「외도민」 아이콘(public/icon-192.png · icon-512.png). 아이콘은 형광 #edfc47 + 검정 글자, 주소창 색은 머리 띠 형광, 바탕은 화면 바탕 회색 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '외도민 타임 라인',
    short_name: '외도민',
    start_url: '/',
    display: 'standalone',
    background_color: '#f2f2f2',
    theme_color: '#edfc47',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
