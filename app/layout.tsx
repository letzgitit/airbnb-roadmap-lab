import type { Metadata } from 'next';
import './globals.css';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
