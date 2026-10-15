'use client';

import type { UpdateItem } from '@/lib/core/types';

// 홈의 주의사항 입구. 목록은 홈에 펼치지 않고, 이 한 줄을 눌러 「최근 바뀐 규정」 창에서 본다.
export function NoticeRow({ updates, onOpen }: { updates: UpdateItem[]; onOpen: () => void }) {
  const top = updates[0]; // updates.json 은 최신순
  if (!top) return null;
  return (
    <button type="button" onClick={onOpen}
      className="mb-6 w-full max-w-[720px] min-h-14 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-left hover:border-amber-400">
      <i className="fas fa-triangle-exclamation text-amber-600 text-[18px] shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-slate-800">주의사항 · 최근 바뀐 규정 {updates.length}건</span>
        <span className="block truncate text-[13px] text-slate-600">{top.date} {top.title}</span>
      </span>
      <i className="fas fa-chevron-right text-slate-500 text-[13px] shrink-0" aria-hidden />
    </button>
  );
}
