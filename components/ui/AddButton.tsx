import type { Ref } from 'react';

// 목록의 첫 줄 「＋ ○○ 추가」(사진 · 링크는 「＋ ○○ 올리기」). 누르면 그 자리에서 입력 폼이 펼쳐진다.
// 모양은 이 한 가지: 앞 44px 칸에 아이콘, 강조색 글자, 높이 44px. label 에는 「＋」 없이 「할 일 추가」처럼 쓴다.
export function AddButton({ label, onClick, buttonRef, icon = 'fa-plus' }: {
  label: string; onClick: () => void; buttonRef?: Ref<HTMLButtonElement>; icon?: string;
}) {
  return (
    <button ref={buttonRef} type="button" onClick={onClick}
      className="flex min-h-11 w-full items-center pr-4 text-left text-accent-ink transition-colors hover:bg-sunken active:bg-sunken">
      <span className="flex size-11 shrink-0 items-center justify-center"><i className={`fas ${icon} text-sm`} aria-hidden /></span>
      <span className="text-base font-semibold">{label}</span>
    </button>
  );
}
