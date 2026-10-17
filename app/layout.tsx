import type { Metadata } from 'next';
import './globals.css';
import { TopLoader } from '@/components/TopLoader';
import { DEFAULT_THEME_MODE } from '@/lib/client/theme-default';

// 환경변수가 없어도 운영 주소로 떨어진다(canonical · og:url · 공유 그림 주소가 localhost 로 새지 않게).
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://jumoney-oedomin.vercel.app').replace(/\/$/, '');
const title = '외도민 타임 라인';
const description = '외국인 도시민박업 실전 창업을 위한 A to Z 로드맵 & 꿀팁 가이드';

// 공유 그림은 app/opengraph-image.tsx · app/twitter-image.tsx 가 빌드 때 만든다(여기서 images 를 적지 않는다).
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: { canonical: '/' },
  openGraph: { title, description, type: 'website', locale: 'ko_KR', url: '/' },
  twitter: { card: 'summary_large_image', title, description },
};

// 첫 그리기 전에 돌아 화면 모드를 <html> 에 먼저 반영한다(저장값 없음 = DEFAULT_THEME_MODE). 깜빡임을 막으려고 head 에 인라인으로 둔다.
const themeInit = `(function(){var d=false;try{var m=localStorage.getItem('theme');if(m!=='light'&&m!=='dark'&&m!=='system')m=${JSON.stringify(DEFAULT_THEME_MODE)};d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);}catch(e){}var h=document.documentElement;if(d)h.classList.add('dark');h.style.colorScheme=d?'dark':'light';})();`;

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
