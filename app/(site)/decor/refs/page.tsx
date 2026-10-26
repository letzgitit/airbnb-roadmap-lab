import type { Metadata } from 'next';
import { BenchPanel } from '@/components/decor/BenchPanel';

export const metadata: Metadata = {
  title: '참고 모음 · 외도민 타임 라인',
  alternates: { canonical: '/decor/refs' },
  robots: { index: false, follow: false },
};

export default function DecorPage() {
  return <BenchPanel active />;
}
