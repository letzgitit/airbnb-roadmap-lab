// 「돈 · 다른 집」(/money) 공용 모양과 계산. 서버(app/api/plan)와 화면(components/money)이 같이 쓴다.
// 🔴 여기엔 금액·이름 같은 값을 넣지 않는다(공개 저장소). 값은 모두 로그인 뒤 /api/plan 응답으로만 온다.
import type { Me, MoneyItem, MoneyVia, PlanProject, PlanState } from './core/types';

export interface PlanItem { src: PlanProject; id: string; text: string; due: string; done: boolean; stepId: number }
export interface PlanPayload {
  me: Me;
  items: PlanItem[];
  money: MoneyItem[];
  plan: PlanState | null;
  /** 지산 문서를 읽었는가(못 읽으면 지산 · 원주 일정이 빠진다) */
  jisan: 'ok' | 'missing' | 'error';
}

export const PROJECT_LABEL: Record<PlanProject, string> = { oedomin: '외도민', jisan: '지산 · 원주' };
export const VIA_LABEL: Record<MoneyVia, string> = { cash: '현금', credit: '마이너스 통장' };

// 할 일 글 끝의 「(추정)」「(제안)」은 글에서 떼어 작은 표시로 보인다
const MARK_RE = /\s*\((추정|제안)\)\s*$/;
export function splitMark(text: string): { text: string; mark: '추정' | '제안' | null } {
  const m = text.match(MARK_RE);
  return m ? { text: text.replace(MARK_RE, ''), mark: m[1] as '추정' | '제안' } : { text, mark: null };
}

// 돈 흐름: 날짜 순서(날짜 없는 것은 맨 뒤)로 늘어놓고, 줄마다 그 뒤 남는 현금 · 마통 여유를 계산한다.
// 나가는 돈(-)은 그 via 에서 빠지고, 들어오는 돈(+)은 그 via 에 더해진다(마통 갚기 = 마통 +).
// 금액 미정(null)은 잔액을 바꾸지 않는다.
export interface MoneyRow { item: MoneyItem; cash: number | null; credit: number | null }
export function moneyRows(money: MoneyItem[], plan: PlanState | null): MoneyRow[] {
  let cash = plan?.cash ?? null;
  let credit = plan?.credit ?? null;
  const sorted = money.filter((m) => !m.deletedAt).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.createdAt.localeCompare(b.createdAt));
  return sorted.map((m) => {
    if (m.amount !== null) {
      if (m.via === 'cash' && cash !== null) cash += m.amount;
      if (m.via === 'credit' && credit !== null) credit += m.amount;
    }
    return { item: m, cash, credit };
  });
}

// 「2,140만」
export function manwon(n: number): string {
  return n === 0 ? '0' : `${Math.abs(n).toLocaleString('ko-KR')}만`;
}
