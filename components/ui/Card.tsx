import type { ElementType, ReactNode } from 'react';

// 목록을 담는 상자(시안 B): 흰 면 + 1px 테두리(#ddd) + 20px 모서리, 그림자 없음. 안의 줄은 1px 선으로 나누고, 상자 안에 상자를 넣지 않는다.
export const cardCls = 'bg-surface border border-line-strong rounded-panel overflow-hidden';
/** 옅은 회색 카드(테두리 없음): 새 홈 「가장 급한 일」 · 「일주일 안에 할 일」 */
export const softCardCls = 'bg-sunken rounded-panel overflow-hidden';
/** 카드 안 한 줄 사이의 선(마지막 줄은 선 없음) */
export const cardRowCls = 'border-b border-line last:border-b-0';

export function Card({ as: Tag = 'div', className = '', soft = false, children, ...rest }: {
  as?: ElementType; className?: string; soft?: boolean; children: ReactNode;
} & Record<string, unknown>) {
  return <Tag className={`${soft ? softCardCls : cardCls} ${className}`} {...rest}>{children}</Tag>;
}
