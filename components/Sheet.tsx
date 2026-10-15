'use client';

import { useEffect, useId, useRef, type ReactNode, type Ref } from 'react';

export interface SheetProps {
  open: boolean;
  /** 열림 애니메이션 상태(false 면 화면 밖 아래에 있다). 닫는 애니메이션 동안 open 은 true 로 남는다. */
  shown: boolean;
  title: ReactNode;
  /** 제목 위 작은 줄(단계 번호 등) */
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  /** 헤더 바로 아래에 붙는 막대(탭 등). 본문이 스크롤돼도 같이 남는다. */
  tabs?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** 닫기 확정(✕ · 바깥 누르기 · Esc 가 beforeClose 를 통과한 뒤) */
  onClose: () => void;
  /** 닫기 요청 앞의 확인. false 를 돌려주면 닫지 않는다(저장 안 한 편집 보호). */
  beforeClose?: () => boolean | Promise<boolean>;
  bodyRef?: Ref<HTMLDivElement>;
  bodyClassName?: string;
}

// 모든 창(단계 · 최근 바뀐 규정 · 집 정보·기록 · 멘트함)이 쓰는 공용 시트:
// 폰은 아래에서 올라오는 시트(위쪽 둥근 모서리), 넓은 화면은 가운데 카드.
export function Sheet({ open, shown, title, eyebrow, subtitle, tabs, footer, children, onClose, beforeClose, bodyRef, bodyClassName = 'bg-white' }: SheetProps) {
  const uid = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<() => void>(() => {});
  const asking = useRef(false);

  // 닫기 요청: 확인(beforeClose)을 거친 뒤에만 닫는다. 확인 창이 떠 있는 동안의 중복 요청은 무시한다.
  const request = async () => {
    if (asking.current) return;
    asking.current = true;
    try {
      if (beforeClose && !(await beforeClose())) return;
      onClose();
    } finally {
      asking.current = false;
    }
  };
  useEffect(() => { askRef.current = () => { void request(); }; });

  // 열려 있는 동안 뒤 화면 스크롤을 잠근다(시트는 한 번에 하나만 열린다)
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // 열리면 닫기 버튼으로 포커스, Esc 로 닫기, 닫히면 연 요소로 포커스 복귀
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') askRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (back && document.contains(back)) back.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
      <div className="absolute inset-0 bg-slate-900/50" onClick={() => askRef.current()} />
      <div className={`absolute inset-x-0 bottom-0 top-10 flex flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl transition-transform duration-300 ease-out ${shown ? '' : 'translate-y-full'} md:relative md:top-auto md:mx-auto md:mt-[7vh] md:h-[85vh] md:max-w-[760px] md:rounded-3xl`}>
        <div className="shrink-0 border-b border-slate-100 bg-white">
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
            <div className="min-w-0">
              {eyebrow && <div className="mb-1.5 flex items-center gap-2">{eyebrow}</div>}
              <h2 id={`${uid}-title`} className="text-xl font-black leading-snug text-slate-900">{title}</h2>
              {subtitle && <p className="mt-1 text-[13px] font-medium leading-snug text-slate-600">{subtitle}</p>}
            </div>
            <button ref={closeRef} type="button" onClick={() => askRef.current()} aria-label="닫기"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200">
              <i className="fas fa-times" aria-hidden />
            </button>
          </div>
          {tabs}
        </div>
        <div ref={bodyRef} className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${bodyClassName}`}>{children}</div>
        {footer && <div className="shrink-0 border-t border-slate-100 bg-white">{footer}</div>}
      </div>
    </div>
  );
}
