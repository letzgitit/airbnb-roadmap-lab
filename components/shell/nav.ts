import type { ProgressDoc } from '@/lib/core/types';

// 로그인했을 때 보이는 문 넷(DESIGN.md 1장). 폰은 아래 탭(BottomTabs), PC 는 머리글 안(SiteHeader)이 같은 표를 쓴다.
export interface NavItem { href: string; label: string; icon: string; match: (path: string) => boolean }

const under = (base: string) => (p: string) => p === base || p.startsWith(`${base}/`);

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '홈', icon: 'fa-house', match: (p) => p === '/' },
  { href: '/house', label: '우리 집', icon: 'fa-door-open', match: under('/house') },
  { href: '/decor', label: '꾸미기', icon: 'fa-couch', match: under('/decor') },
  { href: '/money', label: '돈 · 다른 집', icon: 'fa-wallet', match: under('/money') },
];

/** 「우리 집」 점: 지우지 않은 질문 중 새 답(unread)이 있나 */
export function hasNewAnswer(doc: ProgressDoc | null): boolean {
  return !!doc && Object.values(doc.questions ?? {}).some((q) => !q.deletedAt && q.unread);
}
