import { HouseFrame } from '@/components/house/HouseFrame';

// 「우리 집」(로그인한 사람만): 하위 탭 넷이 이 틀을 같이 쓴다. 페이지는 빈 틀이고 내용은 로그인 뒤 API 로만 받는다.
export default function HouseLayout({ children }: { children: React.ReactNode }) {
  return <HouseFrame>{children}</HouseFrame>;
}
