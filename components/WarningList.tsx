// 「주의」 문장 목록: 상자 없이 문장마다 1px 선으로만 나누고, 글자만 빨강(빨강은 주의에만 쓴다).
// 단계 창의 「주의」 탭과 주의사항 창의 「단계별 주의」 탭이 같이 쓴다.
export function WarningList({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((w, i) => (
        <li key={i} className="border-b border-slate-200 py-3.5 text-[15px] font-semibold leading-relaxed text-red-700 last:border-b-0">{w}</li>
      ))}
    </ul>
  );
}
