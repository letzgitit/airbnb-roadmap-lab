import type { Metadata } from 'next';
import { RestylePhotos } from '@/components/decor/RestylePhotos';

export const metadata: Metadata = {
  title: '사진 시안 · 외도민 타임 라인',
  alternates: { canonical: '/decor/photos' },
  robots: { index: false, follow: false },
};

export default function DecorPhotosPage() {
  return <RestylePhotos />;
}
