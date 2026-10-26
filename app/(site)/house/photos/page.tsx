import type { Metadata } from 'next';
import { PhotosPanel } from '@/components/progress/PhotosPanel';

// 우리 집 › 사진. 사진은 로그인 뒤 /api/photos 로만 받는다.
export const metadata: Metadata = {
  title: '사진',
  robots: { index: false, follow: false },
  alternates: { canonical: '/house/photos' },
};

export default function HousePhotosPage() {
  return <PhotosPanel active />;
}
