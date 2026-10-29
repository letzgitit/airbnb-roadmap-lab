import { LineIcon } from './LineIcon';

// 접어 두는 줄(데일리 .fold summary — 44px · 15/600 · 오른쪽 꺾쇠): 「완료 9」 「n개 더 보기」(펼치면 「접기」) 「날짜 없음 8개」 「삭제한 할 일 3개」.
// 끝낸 것 · 지난 것 · 지운 것은 기본으로 접는다. count 는 이름 뒤에 숫자로 붙인다(unit 을 주면 「3개」처럼). controls = 펼쳐지는 영역의 id.
// 꺾쇠는 어느 화면이든 단계 블록 머리와 같게(20px · 본문색 ink-soft, 접힘 = 아래 · 펼침 = 위 — 2026-10-29 「모두 다 동일하게」).
export function FoldRow({ label, count, unit = '개', open, onToggle, controls, tone = 'default' }: {
  label: string; count?: number; unit?: string; open: boolean; onToggle: () => void; controls?: string; tone?: 'default' | 'danger';
}) {
  return (
    <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle}
      className={`flex min-h-11 w-full items-center gap-2 px-4 text-left text-cta font-semibold transition-colors hover:bg-sunken ${tone === 'danger' ? 'text-danger-ink' : 'text-ink'}`}>
      <span className="min-w-0 flex-1">
        {label}
        {count != null && <span className="ml-1.5 font-normal text-muted tabular-nums">{count}{unit}</span>}
      </span>
      <LineIcon name="chevron" className={`size-5 text-ink-soft transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} stroke={2} />
    </button>
  );
}
