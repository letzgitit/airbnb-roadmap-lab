import type { ProgressDoc } from '@/lib/core/types';

// 로그인했을 때 보이는 문 넷(DESIGN.md 1장). 폰은 아래 탭(BottomTabs), PC 는 머리글 안(SiteHeader)이 같은 표를 쓴다.
// 로그인 안 한 방문자에게는 공개 문(open)만 보인다: 홈 · 꾸미기.
export interface NavItem { href: string; label: string; icon: string; match: (path: string) => boolean; open?: boolean }

const under = (base: string) => (p: string) => p === base || p.startsWith(`${base}/`);

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '홈', icon: 'fa-house', match: (p) => p === '/' || p === '/classic' || p === '/home', open: true },
  { href: '/house', label: '우리 집', icon: 'fa-door-open', match: under('/house') },
  { href: '/decor/3d', label: '꾸미기 참고', icon: 'fa-couch', match: under('/decor'), open: true },
  // 메뉴 이름은 짧게 「돈」(페이지 첫 구역이 돈 흐름이고, 지산 · 원주 할 일도 돈 계획과 같이 본다). 페이지 제목은 그대로 「돈 · 다른 집」
  { href: '/money', label: '돈', icon: 'fa-wallet', match: under('/money') },
];

/** 지금 보일 문: 로그인했으면 넷 다, 로그인 안 했거나 허용 밖 계정이면 공개 문만, 아직 모르면(불러오는 중) 없음 */
export function navItemsFor(status: string, loggedIn: boolean): NavItem[] {
  if (loggedIn) return NAV_ITEMS;
  return status === 'anon' || status === 'forbidden' ? NAV_ITEMS.filter((n) => n.open) : [];
}

/** 「우리 집」 점: 지우지 않은 질문 중 새 답(unread)이 있나 */
export function hasNewAnswer(doc: ProgressDoc | null): boolean {
  return !!doc && Object.values(doc.questions ?? {}).some((q) => !q.deletedAt && q.unread);
}
