import type { ButtonHTMLAttributes, Ref } from 'react';
import { LineIcon, type LineIconName } from './LineIcon';

// 동그란 아이콘 단추(닫기 · 메뉴 등): 44px, 이름(aria-label) 필수. filled = 옅은 면(시트 닫기), outline = 1px 테두리 동그라미(머리글 「설정」, 시안 B).
// icon 은 Font Awesome 이름(예: 'fa-xmark') 또는 선 아이콘 이름(LineIcon, 예: 'gear'). aria-haspopup 같은 단추 속성은 그대로 넘길 수 있다.
export function IconButton({ label, icon, onClick, buttonRef, variant = 'plain', className = '', ...rest }: {
  label: string; icon: string; onClick?: () => void; buttonRef?: Ref<HTMLButtonElement>; variant?: 'plain' | 'filled' | 'outline';
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'aria-label'>) {
  const look = variant === 'filled' ? 'bg-sunken text-ink-soft hover:bg-strong' : variant === 'outline' ? 'border border-line-strong text-ink hover:bg-sunken' : 'text-ink-soft hover:bg-sunken';
  return (
    <button ref={buttonRef} type="button" aria-label={label} onClick={onClick} {...rest}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:text-faint ${look} ${className}`}>
      {icon.startsWith('fa-') ? <i className={`fas ${icon} text-base`} aria-hidden /> : <LineIcon name={icon as LineIconName} className="size-5" />}
    </button>
  );
}
