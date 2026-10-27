import type { ProgressDoc } from '@/lib/core/types';
import type { LineIconName } from '@/components/ui/LineIcon';

// 머리 띠 오른쪽 문(DESIGN.md 1장 · 6장, 2026-10-28 사이트 주인 결정): 시안 · 자금. 「홈」 문은 없다 — 제호 「외도민 준비」가 곧 홈 링크다.
// 폰 아래 탭 줄도 없앴다. 폰 · PC 모두 머리 띠 오른쪽(설정 톱니 왼쪽)에 선 아이콘 + 글자.
// 로그인 안 한 방문자에게는 공개 문(open)만 보인다: 시안.
// 「우리 집」(/house)은 2026-10-28 메뉴에서 뺐다(경로는 그대로 — 예전 화면 · 직접 주소로 들어간다).
export interface NavItem { href: string; label: string; icon: LineIconName; match: (path: string) => boolean; open?: boolean }

const under = (base: string) => (p: string) => p === base || p.startsWith(`${base}/`);

/** 홈으로 치는 주소(제호 앞 「‹」를 붙이지 않는 곳) */
export const isHomePath = (p: string) => p === '/' || p === '/home' || p === '/classic';

export const NAV_ITEMS: NavItem[] = [
  { href: '/decor/3d', label: '시안', icon: 'cube', match: under('/decor'), open: true },
  { href: '/money', label: '자금', icon: 'wallet', match: under('/money') },
];

/** 지금 보일 문: 로그인했으면 둘 다, 로그인 안 했거나 허용 밖 계정이면 공개 문만, 아직 모르면(불러오는 중) 없음 */
export function navItemsFor(status: string, loggedIn: boolean): NavItem[] {
  if (loggedIn) return NAV_ITEMS;
  return status === 'anon' || status === 'forbidden' ? NAV_ITEMS.filter((n) => n.open) : [];
}

/** 질문 새 답 점(예전 「우리 집 › 질문」 하위 탭에서만 쓴다): 지우지 않은 질문 중 새 답(unread)이 있나 */
export function hasNewAnswer(doc: ProgressDoc | null): boolean {
  return !!doc && Object.values(doc.questions ?? {}).some((q) => !q.deletedAt && q.unread);
}
