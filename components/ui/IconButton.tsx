import type { ButtonHTMLAttributes, Ref } from 'react';

// 동그란 아이콘 단추(닫기 · 메뉴 등): 44px, 이름(aria-label) 필수. filled = 들어간 면(시트 닫기), onAccent = 강조색 면(머리글) 위 흰 아이콘.
// icon 은 Font Awesome 이름(예: 'fa-xmark'). aria-haspopup 같은 단추 속성은 그대로 넘길 수 있다.
export function IconButton({ label, icon, onClick, buttonRef, variant = 'plain', className = '', ...rest }: {
  label: string; icon: string; onClick?: () => void; buttonRef?: Ref<HTMLButtonElement>; variant?: 'plain' | 'filled' | 'onAccent';
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'aria-label'>) {
  const look = variant === 'filled' ? 'bg-sunken text-ink-soft hover:bg-line' : variant === 'onAccent' ? 'text-on-accent hover:bg-accent-hover' : 'text-ink-soft hover:bg-sunken';
  return (
    <button ref={buttonRef} type="button" aria-label={label} onClick={onClick} {...rest}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:text-faint ${look} ${className}`}>
      <i className={`fas ${icon} text-base`} aria-hidden />
    </button>
  );
}
