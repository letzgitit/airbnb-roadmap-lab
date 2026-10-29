import type { Ref } from 'react';
import { LineIcon } from './LineIcon';
import { addBtnCls } from './buttonCls';

// 「＋ 할 일」 · 「＋ 메모」 글자 단추(addBtnCls — 15/700 + 18px ＋ 선 아이콘, 44px, 글자 폭).
// 할 일 더하기는 어느 화면이든 이 한 모양 · 「＋ 할 일」 이름(새 홈 단계 블록 · 자세히 보기 단계 창 · 그날 창 — 2026-10-29 「모두 다 동일하게」).
// srLabel = 화면 읽기 프로그램에만 붙는 뒷말(예: 「: 3단계에 더하기」).
export function AddTextButton({ label, onClick, buttonRef, srLabel }: {
  label: string; onClick: () => void; buttonRef?: Ref<HTMLButtonElement>; srLabel?: string;
}) {
  return (
    <button ref={buttonRef} type="button" onClick={onClick} className={addBtnCls}>
      <LineIcon name="plus" className="size-4.5" stroke={2.2} />{label}
      {srLabel && <span className="sr-only">{srLabel}</span>}
    </button>
  );
}

// 「＋ ○○ 추가」(사진 · 링크는 「＋ ○○ 올리기」). 누르면 그 자리에서 입력 폼이 펼쳐진다.
// 모양은 이 한 가지: 앞 44px 칸에 ＋ 선 아이콘, 검정 글자 15/700(데일리 단추 글자), 높이 44px. label 에는 「＋」 없이 「할 일 추가」처럼 쓴다.
// icon 에 Font Awesome 이름(예: 'fa-link')을 주면 그 아이콘을 쓴다.
export function AddButton({ label, onClick, buttonRef, icon }: {
  label: string; onClick: () => void; buttonRef?: Ref<HTMLButtonElement>; icon?: string;
}) {
  return (
    <button ref={buttonRef} type="button" onClick={onClick}
      className="flex min-h-11 w-full items-center pr-4 text-left text-ink transition-colors hover:bg-sunken active:bg-sunken">
      <span className="flex size-11 shrink-0 items-center justify-center">
        {icon ? <i className={`fas ${icon} text-sm`} aria-hidden /> : <LineIcon name="plus" className="size-5" stroke={2} />}
      </span>
      <span className="text-cta font-bold">{label}</span>
    </button>
  );
}
