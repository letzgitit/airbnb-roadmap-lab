import type { ButtonHTMLAttributes, Ref } from 'react';
import { LineIcon, type LineIconName } from './LineIcon';

// 아이콘 단추(닫기 · 메뉴 등, 데일리 .icon-btn): 44px, 모서리 10(단추), 이름(aria-label) 필수. filled = 옅은 면(시트 닫기), outline = 1px 테두리.
// icon 은 Font Awesome 이름(예: 'fa-xmark') 또는 선 아이콘 이름(LineIcon, 예: 'gear'). aria-haspopup 같은 단추 속성은 그대로 넘길 수 있다.
export function IconButton({ label, icon, onClick, buttonRef, variant = 'plain', className = '', ...rest }: {
  /** band = 형광 머리 띠 위(검정 선 아이콘, 눌러도 형광 위 옅은 검정만) */
  label: string; icon: string; onClick?: () => void; buttonRef?: Ref<HTMLButtonElement>; variant?: 'plain' | 'filled' | 'outline' | 'band';
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'aria-label'>) {
  const look = variant === 'filled' ? 'bg-sunken text-ink-soft hover:bg-strong'
    : variant === 'outline' ? 'border border-line-strong text-ink hover:bg-sunken'
    : variant === 'band' ? 'text-on-marker hover:bg-black/10 active:bg-black/15'
    : 'text-ink-soft hover:bg-sunken';
  return (
    <button ref={buttonRef} type="button" aria-label={label} onClick={onClick} {...rest}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-control transition-colors disabled:text-faint ${look} ${className}`}>
      {icon.startsWith('fa-') ? <i className={`fas ${icon} text-base`} aria-hidden /> : <LineIcon name={icon as LineIconName} className="size-5.5" />}
    </button>
  );
}
