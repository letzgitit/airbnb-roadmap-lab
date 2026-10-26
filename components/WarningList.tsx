// 「주의」 문장 목록: 상자 없이 문장마다 1px 선으로만 나눈다. 빨간 글자가 줄줄이 이어지면 읽기 힘들어서
// 글자는 본문색, 빨강은 문장 앞 작은 표시에만 쓴다(빨강은 주의에만 쓴다).
// 단계 창의 「주의사항」 탭과 주의사항 창의 「단계별 주의사항」 탭이 같이 쓴다.
export function WarningList({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((w, i) => (
        <li key={i} className="flex items-start gap-2 border-b border-line py-3 last:border-b-0">
          <i className="fas fa-triangle-exclamation mt-[0.4em] shrink-0 text-xs text-danger-ink" aria-hidden />
          <span className="min-w-0 text-base font-normal leading-relaxed text-ink">{w}</span>
        </li>
      ))}
    </ul>
  );
}
