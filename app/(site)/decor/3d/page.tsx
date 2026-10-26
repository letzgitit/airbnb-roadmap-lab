import type { Metadata } from 'next';
import { Room3D } from '@/components/decor/Room3D';

export const metadata: Metadata = {
  title: '3D 시안 · 외도민 타임 라인',
  alternates: { canonical: '/decor/3d' },
  robots: { index: false, follow: false },
};

export default function Decor3DPage() {
  return <Room3D />;
}
