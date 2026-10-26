import type { Metadata } from 'next';
import { DecorFrame } from '@/components/decor/DecorFrame';

// 꾸미기(참고 모음 · 3D 시안 · 사진 시안): 로그인 안 한 방문자도 본다. 페이지는 빈 틀이고, 자료는 API 로만 받는다
// (참고 모음은 서버가 공개로 고른 항목의 사진 · 제목만 내려준다 — app/api/bench/route.ts). 검색 노출은 하지 않는다.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DecorLayout({ children }: { children: React.ReactNode }) {
  return <DecorFrame>{children}</DecorFrame>;
}
