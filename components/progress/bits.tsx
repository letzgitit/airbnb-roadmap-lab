'use client';

import { useEffect, useState } from 'react';
import { useProgress } from './ProgressProvider';

export function EditBadge({ k }: { k: string }) {
  const { editingBy } = useProgress();
  const m = editingBy(k);
  if (!m) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap">
      <i className="fas fa-pen text-[8px]" /> {m.byName}가 편집 중
    </span>
  );
}

// 편집창을 열어 둔 동안 서버에 「편집 중」 표시를 남긴다(잠금 아님, 경고만)
export function useEditing(k: string) {
  const { setEditing } = useProgress();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    setEditing(k);
    return () => setEditing(null);
  }, [open, k, setEditing]);
  return { open, start: () => setOpen(true), stop: () => setOpen(false) };
}

export const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-400';
export const btnPrimary = 'shrink-0 whitespace-nowrap px-4 py-2 rounded-xl bg-blue-600 text-white text-[13px] font-bold hover:bg-blue-700 disabled:opacity-50';
export const btnGhost = 'shrink-0 whitespace-nowrap px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-[13px] font-bold hover:bg-slate-200';

export function useBusy() {
  const [busy, setBusy] = useState(false);
  return { busy, run: async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } } };
}

export function stamp(by: string | null | undefined, at: string | null | undefined, rel: (s: string | null | undefined) => string) {
  if (!by) return null;
  return <span className="text-[10px] font-semibold text-slate-400">{by} · {rel(at)}</span>;
}
