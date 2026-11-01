import { LineIcon } from './LineIcon';

// 묶음 머리(데일리 .grp-h): 이름 14/700 `sub` + 오른쪽 「n개」 13 `muted`, 아래 1px 선. 새 홈 달력 탭(「오늘」 · 「다가오는 일정」 · 「기한 지남」)과 검색 결과 묶음이 같이 쓴다.
// fold 를 주면 머리 줄 전체가 접기 · 펴기 단추(제목 안 단추, 누르는 칸 52px)가 되고 맨 오른쪽에 꺾쇠(펼침 = 위, 접힘 = 아래 — 단계 블록 머리와 같은 꼴).
// tone = 'danger' 면 이름과 개수를 빨강(text-danger-ink)으로(기한 지난 할 일 묶음).
// 몸통을 숨기는 일은 부르는 쪽이 한다(controls = 몸통 id). fold 가 없으면(검색 결과) 예전 그대로 글자만.
export function GroupHead({ id, name, count, level = 3, fold, tone = 'default' }: {
  id: string; name: string; count: number; level?: 2 | 3;
  fold?: { open: boolean; onToggle: () => void; controls: string };
  tone?: 'default' | 'danger';
}) {
  const H = level === 2 ? 'h2' : 'h3';
  const isDanger = tone === 'danger';
  if (!fold) {
    return (
      <H id={id} className="mx-5 flex items-baseline justify-between gap-3 border-b border-line pb-2 pt-6 text-meta font-normal text-muted">
        <b className={`min-w-0 truncate text-sm font-bold ${isDanger ? 'text-danger-ink' : 'text-sub'}`}>{name}</b>
        {count > 0 && <span className={`tabular-nums ${isDanger ? 'font-semibold text-danger-ink' : ''}`}>{count}개</span>}
      </H>
    );
  }
  const { open, onToggle, controls } = fold;
  return (
    <H id={id} className="mx-5 border-b border-line text-meta font-normal text-muted">
      <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle}
        className="group -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-3 px-2 pb-2 pt-6 text-left focus-visible:-outline-offset-2 active:opacity-60">
        <b className={`min-w-0 truncate text-sm font-bold transition-colors ${isDanger ? 'text-danger-ink' : 'text-sub group-hover:text-ink'}`}>{name}</b>
        <span className="flex shrink-0 items-center gap-2">
          {count > 0 && <span className={`tabular-nums ${isDanger ? 'font-semibold text-danger-ink' : ''}`}>{count}개</span>}
          <LineIcon name="chevron" stroke={2} className={`size-5 text-ink-soft transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
        </span>
      </button>
    </H>
  );
}
