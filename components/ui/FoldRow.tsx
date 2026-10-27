// 접어 두는 줄: 「끝낸 일 12개」 「날짜 없음 8개」 「삭제한 할 일 3개」 「전체 40건 보기」. 끝낸 것 · 지난 것 · 지운 것은 기본으로 접는다.
// count 가 숫자면 「n개」로 붙이고, 다른 단위(건 등)는 label 에 직접 쓴다. controls = 펼쳐지는 영역의 id.
export function FoldRow({ label, count, open, onToggle, controls, tone = 'default' }: {
  label: string; count?: number; open: boolean; onToggle: () => void; controls?: string; tone?: 'default' | 'danger';
}) {
  return (
    <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle}
      className={`flex min-h-11 w-full items-center gap-2 px-4 text-left text-base font-semibold transition-colors hover:bg-sunken ${tone === 'danger' ? 'text-danger-ink' : 'text-ink-soft'}`}>
      <span className="min-w-0 flex-1">
        {label}
        {count != null && <span className="ml-1.5 font-normal text-muted">{count}개</span>}
      </span>
      <i className={`fas fa-chevron-down text-sm text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
    </button>
  );
}
