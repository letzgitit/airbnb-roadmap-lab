import type { Metadata } from 'next';
import { DecorFrame } from '@/components/decor/DecorFrame';

// 꾸미기(참고 모음 · 3D 시안): 로그인한 두 사람만 본다. 페이지는 빈 틀이고, 자료는 로그인을 확인하는 API 로만 받는다.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DecorLayout({ children }: { children: React.ReactNode }) {
  return <DecorFrame>{children}</DecorFrame>;
}
