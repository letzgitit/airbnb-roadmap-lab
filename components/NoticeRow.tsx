'use client';

// 홈의 주의사항 입구. 목록은 홈에 펼치지 않고, 이 한 줄을 눌러 「주의사항」 창(바뀐 규정 · 단계별 주의)에서 본다.
// 빨강은 「주의」를 뜻하므로 이 줄만 빨간 바탕을 쓴다.
export function NoticeRow({ ruleCount, warnCount, onOpen }: { ruleCount: number; warnCount: number; onOpen: () => void }) {
  if (ruleCount + warnCount === 0) return null;
  return (
    <button type="button" onClick={onOpen}
      className="mb-5 w-full max-w-[720px] min-h-14 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-left hover:border-red-400">
      <i className="fas fa-triangle-exclamation text-red-600 text-[17px] shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-slate-900">주의사항</span>
        <span className="block text-[13px] text-slate-600">바뀐 규정 {ruleCount}건, 단계별 주의 {warnCount}건</span>
      </span>
      <i className="fas fa-chevron-right text-slate-500 text-[13px] shrink-0" aria-hidden />
    </button>
  );
}
