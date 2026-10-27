'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import { displayName, relTime, withGa } from '@/lib/client/format';
import { useProgress, type DirtyScope } from './ProgressProvider';
import { AddButton } from '@/components/ui/AddButton';

export function EditBadge({ k }: { k: string }) {
  const { editingBy } = useProgress();
  const m = editingBy(k);
  if (!m) return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sunken px-2 py-0.5 text-sm font-bold text-ink-soft">
      <i className="fas fa-pen text-sm" aria-hidden /> {withGa(m.byName)} 편집 중
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

// 입력칸(inputCls · dateCls · composerCls)과 단추(btnPrimary · btnGhost · btnDanger · textBtn) 모양은 components/ui/buttonCls.ts 에 있다.
// 확인 창(ProgressProvider)도 같은 모양을 쓰는데 이 파일은 ProgressProvider 를 불러 쓰므로, 고리가 생기지 않게 그쪽에 두고 여기서 다시 내보낸다.
export { inputCls, dateCls, composerCls, btnPrimary, btnGhost, btnDanger, textBtn } from '@/components/ui/buttonCls';

// ── 한 줄 모양: 우리 할 일 · 집 정보 · 기록 · 추천 할 일이 모두 같은 틀 ──
//   [앞 44px 조작] [글: 15px 본문 + 있으면 13px 보조 한 줄] [뒤 44px 아이콘 단추(휴지통)]
export const rowCls = 'flex items-start border-b border-line last:border-b-0';
export const leadCls = 'flex size-11 shrink-0 items-center justify-center';
export const rowText = 'text-base font-semibold text-ink';
export const rowSub = 'text-sm font-normal text-muted';
// 단추 이름(aria-label)에 쓰는 글 줄임: 줄마다 이름이 달라야 하지만 너무 길면 읽기 힘들다
export const clipLabel = (s: string, n = 30) => (s.length > n ? `${s.slice(0, n)}…` : s);
// 「삭제」 확인 창 아래에 한 줄로 붙는 안내(서버가 30일 보관한다 — lib/core/engine.ts TRASH_KEEP_MS)
export const TRASH_NOTE = '지운 것은 30일 동안 목록 맨 아래에서 되살릴 수 있어요.';

// 줄 끝의 휴지통: 평소엔 회색(muted), 누르는 순간 · 마우스를 올리면 빨강. 누르면 바로 지우지 않고 확인 창을 띄운다.
export function TrashButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-danger-ink focus-visible:text-danger-ink active:text-danger-ink disabled:opacity-40">
      <i className="fas fa-trash-can text-base" aria-hidden />
    </button>
  );
}

// 「＋ ○○ 추가」 줄(누르면 그 자리에서 입력칸이 펼쳐진다). 옛 이름 — 모양은 공통 AddButton 하나다(목록 첫 줄에 둔다).
export function AddRow({ label, onClick, buttonRef }: { label: string; onClick: () => void; buttonRef?: React.Ref<HTMLButtonElement> }) {
  return <AddButton label={label} onClick={onClick} buttonRef={buttonRef} />;
}

// 줄바꿈 없는 글을 담는 입력칸: 글이 길어지면 높이가 따라 늘어난다(스크롤 칸이 아니라 다 보이게)
export function AutoTextarea({ value, className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} value={value} rows={rest.rows ?? 1} className={`${className} resize-none overflow-hidden`} {...rest} />;
}

// 한 줄짜리 글 입력칸 공통 처리: Enter = 저장(한글 조합 중 Enter 와 Shift+Enter 는 그대로 둔다), 붙여넣은 줄바꿈은 공백으로
export const enterSubmit = (e: KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); }
};
export const oneLine = (s: string) => s.replace(/\r?\n/g, ' ');

export function useBusy() {
  const [busy, setBusy] = useState(false);
  return { busy, run: async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } } };
}

// 마지막으로 누가 · 언제 고쳤는지: 줄마다 두지 않고 편집 폼 안에 한 줄로만 둔다(가운뎃점 대신 간격으로 나눈다)
export function LastEdit({ by, at }: { by: string | null | undefined; at: string | null | undefined }) {
  if (!by) return null;
  return (
    <p className="flex flex-wrap gap-x-3 text-sm font-normal text-muted">
      <span>마지막 수정</span><span>{displayName(by)}</span><span>{relTime(at)}</span>
    </p>
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
