// 「주의」 문장 목록: 상자 없이 문장마다 1px 선으로만 나눈다. 빨간 글자가 줄줄이 이어지면 읽기 힘들어서
// 글자는 진한 회색, 빨강은 문장 앞 작은 표시에만 쓴다(빨강은 주의에만 쓴다).
// 단계 창의 「주의사항」 탭과 주의사항 창의 「단계별 주의사항」 탭이 같이 쓴다.
export function WarningList({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((w, i) => (
        <li key={i} className="flex items-start gap-2.5 border-b border-slate-200 py-3.5 last:border-b-0">
          <i className="fas fa-triangle-exclamation mt-[0.4em] shrink-0 text-[12px] text-red-600 dark:text-red-400" aria-hidden />
          <span className="min-w-0 text-[15px] font-normal leading-relaxed text-slate-800">{w}</span>
        </li>
      ))}
    </ul>
  );
}
