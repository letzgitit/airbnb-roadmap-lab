import type { Metadata } from 'next';
import { LogPage } from '@/components/house/LogPage';

// 우리 집 › 기록. 기록은 로그인 뒤 /api/progress 로만 받는다.
export const metadata: Metadata = {
  title: '기록',
  robots: { index: false, follow: false },
  alternates: { canonical: '/house/log' },
};

export default function HouseLogPage() {
  return <LogPage />;
}
