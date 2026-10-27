import type { ElementType, ReactNode } from 'react';

// 목록을 담는 상자(데일리 블록 .sec 결): 흰 면 + 1px 선 테두리, 각진 모서리, 그림자 없음. 안의 줄은 1px 선으로 나누고, 상자 안에 상자를 넣지 않는다.
export const cardCls = 'bg-surface border border-line rounded-panel overflow-hidden';
/** 옅은 회색 칸(테두리 없음): 블록 안에서 한 단계 들어간 면 */
export const softCardCls = 'bg-sunken rounded-panel overflow-hidden';
/** 카드 안 한 줄 사이의 선(마지막 줄은 선 없음) */
export const cardRowCls = 'border-b border-line last:border-b-0';

export function Card({ as: Tag = 'div', className = '', soft = false, children, ...rest }: {
  as?: ElementType; className?: string; soft?: boolean; children: ReactNode;
} & Record<string, unknown>) {
  return <Tag className={`${soft ? softCardCls : cardCls} ${className}`} {...rest}>{children}</Tag>;
}
