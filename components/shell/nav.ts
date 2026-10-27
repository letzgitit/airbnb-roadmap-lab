import type { ProgressDoc } from '@/lib/core/types';
import type { LineIconName } from '@/components/ui/LineIcon';

// 로그인했을 때 보이는 문 셋(DESIGN.md 1장): 홈 · 시안 · 자금. 폰은 아래 탭(BottomTabs), PC 는 머리글 안(SiteHeader)이 같은 표를 쓴다.
// 로그인 안 한 방문자에게는 공개 문(open)만 보인다: 홈 · 시안.
// 「우리 집」(/house)은 2026-10-28 메뉴에서 뺐다(경로는 그대로 — 예전 화면 · 직접 주소로 들어간다). 새 홈 안에서 /house 로 보내지 않는다.
export interface NavItem { href: string; label: string; icon: LineIconName; match: (path: string) => boolean; open?: boolean }

const under = (base: string) => (p: string) => p === base || p.startsWith(`${base}/`);

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '홈', icon: 'home', match: (p) => p === '/' || p === '/classic' || p === '/home', open: true },
  { href: '/decor/3d', label: '시안', icon: 'layout', match: under('/decor'), open: true },
  { href: '/money', label: '자금', icon: 'wallet', match: under('/money') },
];

/** 지금 보일 문: 로그인했으면 셋 다, 로그인 안 했거나 허용 밖 계정이면 공개 문만, 아직 모르면(불러오는 중) 없음 */
export function navItemsFor(status: string, loggedIn: boolean): NavItem[] {
  if (loggedIn) return NAV_ITEMS;
  return status === 'anon' || status === 'forbidden' ? NAV_ITEMS.filter((n) => n.open) : [];
}

/** 질문 새 답 점(예전 「우리 집 › 질문」 하위 탭에서만 쓴다): 지우지 않은 질문 중 새 답(unread)이 있나 */
export function hasNewAnswer(doc: ProgressDoc | null): boolean {
  return !!doc && Object.values(doc.questions ?? {}).some((q) => !q.deletedAt && q.unread);
}
