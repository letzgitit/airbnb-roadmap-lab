import type { Metadata } from 'next';
import './globals.css';
import { TopLoader } from '@/components/TopLoader';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || undefined;
const title = '외도민 타임 라인';
const description = '외국인 도시민박업 실전 창업을 위한 A to Z 로드맵 & 꿀팁 가이드';
const ogImage = 'https://images.unsplash.com/photo-1556912173-3db996ea8c89?q=80&w=1200&auto=format&fit=crop';

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title,
  description,
  openGraph: { title, description, type: 'website', locale: 'ko_KR', url: siteUrl, images: [{ url: ogImage, width: 1200, height: 800 }] },
  twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
};

// 첫 그리기 전에 돌아 화면 모드를 <html> 에 먼저 반영한다(저장값 없음 = 시스템). 깜빡임을 막으려고 head 에 인라인으로 둔다.
const themeInit = `(function(){var d=false;try{var m=localStorage.getItem('theme');d=m==='dark'||(m!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);}catch(e){}var h=document.documentElement;if(d)h.classList.add('dark');h.style.colorScheme=d?'dark':'light';})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <TopLoader />
        {children}
      </body>
    </html>
  );
}
