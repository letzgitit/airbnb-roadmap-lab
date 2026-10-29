// 묶음 머리(데일리 .grp-h): 이름 14/700 `sub` + 오른쪽 「n건」 13 `muted`, 아래 1px 선. 새 홈 달력 탭(「오늘」 · 「다가오는 일정」)과 검색 결과 묶음이 같이 쓴다.
export function GroupHead({ id, name, count, level = 3 }: { id: string; name: string; count: number; level?: 2 | 3 }) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <H id={id} className="mx-5 flex items-baseline justify-between gap-3 border-b border-line pb-2 pt-6 text-meta font-normal text-muted">
      <b className="min-w-0 truncate text-sm font-bold text-sub">{name}</b>
      {count > 0 && <span className="tabular-nums">{count}건</span>}
    </H>
  );
}
