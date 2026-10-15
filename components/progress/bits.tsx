'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { displayName, withGa } from '@/lib/client/format';
import { useProgress, type DirtyScope } from './ProgressProvider';

export function EditBadge({ k }: { k: string }) {
  const { editingBy } = useProgress();
  const m = editingBy(k);
  if (!m) return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[12px] font-bold text-slate-700">
      <i className="fas fa-pen text-[12px]" aria-hidden /> {withGa(m.byName)} 편집 중
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

export const inputCls = 'w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[15px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400';
export const btnPrimary = 'shrink-0 whitespace-nowrap min-h-11 px-4 py-2 rounded-xl bg-blue-600 text-white text-[15px] font-bold hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:hover:bg-slate-200';
export const btnGhost = 'shrink-0 whitespace-nowrap min-h-11 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-[15px] font-bold hover:bg-slate-200';
// 연필·휴지통 같은 아이콘 단추(44×44)
export const iconBtn = 'w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-white';
// 작은 글자 단추(「+ 항목 추가」「로그아웃」「복원」 등): 글자는 작아도 누르는 칸은 44px
export const textBtn = 'inline-flex items-center min-h-11 px-2 -mx-2 text-[13px] font-bold text-blue-700 hover:underline';

export function useBusy() {
  const [busy, setBusy] = useState(false);
  return { busy, run: async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } } };
}

// 누가 · 언제: 가운뎃점 대신 간격으로 나눈다
export function Stamp({ by, at, rel }: { by: string | null | undefined; at: string | null | undefined; rel: (s: string | null | undefined) => string }) {
  if (!by) return null;
  return (
    <span className="inline-flex flex-wrap gap-x-3 text-[13px] font-semibold text-slate-500">
      <span>{displayName(by)}</span><span>{rel(at)}</span>
    </span>
  );
}

// 저장 안 한 내용이 있는 폼을 등록한다(단계 창 닫기 확인·탭 닫기 경고에 쓰임). 폼이 사라지면 자동 해제.
export function useDirty(key: string, dirty: boolean, scope: DirtyScope = 'page') {
  const { markDirty } = useProgress();
  useEffect(() => {
    markDirty(key, scope, dirty);
    return () => markDirty(key, scope, false);
  }, [key, scope, dirty, markDirty]);
}

// 편집 폼 안의 Esc = 편집 취소. 바뀐 게 없으면 바로 닫고, 있으면 「저장 안 한 내용이 있어요」 확인 뒤 닫는다.
// 단계 창의 Esc(창 닫기)까지 올라가지 않게 여기서 멈춘다.
export function useFormEsc(dirty: boolean, cancel: () => void) {
  const { confirmDiscard } = useProgress();
  return (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    if (!dirty) { cancel(); return; }
    void confirmDiscard().then((ok) => { if (ok) cancel(); });
  };
}
