import type { Metadata } from 'next';
import { PropertyCard } from '@/components/progress/PropertyCard';
import { TrashCard } from '@/components/progress/TrashCard';

// 우리 집 › 집 정보. 값은 로그인 뒤 /api/progress 로만 받는다(이 페이지에는 아무 값도 없다).
export const metadata: Metadata = {
  title: '집 정보',
  robots: { index: false, follow: false },
  alternates: { canonical: '/house' },
};

export default function HousePage() {
  return (
    <>
      <PropertyCard />
      <TrashCard kinds={['property']} />
    </>
  );
}
