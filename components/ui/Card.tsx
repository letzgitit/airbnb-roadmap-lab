import type { ElementType, ReactNode } from 'react';

// 목록을 담는 상자: 면 + 테두리 + 16px 모서리(그림자 없음). 안의 줄은 1px 선으로 나누고, 상자 안에 상자를 넣지 않는다.
export const cardCls = 'bg-surface border border-line rounded-panel overflow-hidden';
/** 카드 안 한 줄 사이의 선(마지막 줄은 선 없음) */
export const cardRowCls = 'border-b border-line last:border-b-0';

export function Card({ as: Tag = 'div', className = '', children, ...rest }: {
  as?: ElementType; className?: string; children: ReactNode;
} & Record<string, unknown>) {
  return <Tag className={`${cardCls} ${className}`} {...rest}>{children}</Tag>;
}
