'use client';

import { useEffect, useRef, useState } from 'react';
import type { Step } from '@/lib/core/types';
import { SECTION_LABEL, SECTION_ORDER, sectionCount, type StepSection } from '@/lib/client/step-sections';
import { StepPanel } from './progress/StepPanel';
import { useProgress } from './progress/ProgressProvider';

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);
const sectionTitle = 'text-[14px] font-bold text-slate-700 mt-8 mb-3 flex items-center gap-2';
const cardBase = 'rounded-[20px] border px-[18px] py-4 mb-3.5';

// 목록 한 줄의 모양(아이콘·바탕). 주의사항만 붉은 기운을 둔다.
const ROW: Record<StepSection, { icon: string; iconCls: string; border: string; bg: string }> = {
  warnings: { icon: 'fas fa-triangle-exclamation', iconCls: 'text-red-600', border: 'border-red-100', bg: 'bg-red-50/60' },
  official: { icon: 'fas fa-scale-balanced', iconCls: 'text-slate-500', border: 'border-slate-200', bg: 'bg-white' },
  tips: { icon: 'fas fa-magic', iconCls: 'text-slate-500', border: 'border-slate-200', bg: 'bg-white' },
  community: { icon: 'fas fa-comments', iconCls: 'text-slate-500', border: 'border-slate-200', bg: 'bg-white' },
};

interface View { sel: StepSection | null; panel: boolean }

export function StepModal({ steps, index, section, open, shown, loggedIn, onClose, onGo }: {
  steps: Step[]; index: number; section: StepSection | null; open: boolean; shown: boolean; loggedIn: boolean;
  onClose: () => void; onGo: (i: number) => void;
}) {
  const step = steps[index];
  const [view, setView] = useState<View>({ sel: null, panel: false });
  const closeRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<Partial<Record<StepSection, HTMLButtonElement | null>>>({});
  const { hasDirty, confirmDiscard } = useProgress();
  // 단계 창 안의 편집 폼에 저장 안 한 내용이 있으면, 닫기·이전/다음 단계 전에 앱 안 확인 창을 띄운다
  const guard = (fn: () => void) => {
    if (!hasDirty('modal')) { fn(); return; }
    void confirmDiscard().then((ok) => { if (ok) fn(); });
  };
  const guardedClose = () => guard(onClose);
  const closeRefFn = useRef(guardedClose);
  useEffect(() => { closeRefFn.current = guardedClose; });

  // 열 때·단계를 바꿀 때 무엇을 보여 줄지 정한다.
  //  - 검색에서 section 을 달고 왔으면 그 목록을 바로 연다
  //  - 아니면 넓은 화면은 오른쪽 칸이 비지 않게 첫 목록을 골라 두고, 폰은 아무것도 안 고른 채 닫아 둔다
  useEffect(() => {
    if (!open) return;
    const s = steps[index];
    if (!s) return;
    const has = (k: StepSection) => sectionCount(s, k) > 0;
    const wide = window.matchMedia('(min-width: 768px)').matches;
    const next: View = section && has(section)
      ? { sel: section, panel: true }
      : { sel: wide ? (SECTION_ORDER.find(has) ?? null) : null, panel: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(next);
  }, [open, index, section, steps]);

  // 열리면 닫기 버튼으로 포커스, Esc 로 닫기, 닫히면 연 요소로 포커스 복귀
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRefFn.current(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (back && document.contains(back)) back.focus();
    };
  }, [open]);

  if (!open || !step) return null;
  const stepRefs = steps.map((s) => ({ id: s.id, title: s.title }));
  const cats = SECTION_ORDER.filter((k) => sectionCount(step, k) > 0);
  // 단계를 바꾼 첫 그림에서 이전 단계의 선택이 남아 있어도(효과가 고치기 전) 빈 목록을 그리지 않는다
  const cur = view.sel && sectionCount(step, view.sel) > 0 ? view.sel : null;

  const pick = (k: StepSection) => {
    setView({ sel: k, panel: true });
    // 폰: 밀려 들어온 오른쪽 칸의 「목록으로」로 포커스(스크롤은 건드리지 않는다). 넓은 화면은 그 단추가 없어 아무 일도 안 일어난다.
    requestAnimationFrame(() => backRef.current?.focus({ preventScroll: true }));
  };
  const closePanel = () => {
    setView((v) => ({ ...v, panel: false }));
    if (cur) rowRefs.current[cur]?.focus({ preventScroll: true });
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={step.title}>
      <div className="modal-overlay absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={guardedClose} />
      <div className={`absolute inset-x-0 bottom-0 top-10 bg-white rounded-t-[40px] flex flex-col modal-content transition-transform ${shown ? '' : 'translate-y-full'} md:relative md:top-auto md:inset-x-auto md:h-[85vh] md:rounded-[32px] md:mx-auto md:mt-[7vh] shadow-2xl overflow-hidden`}>
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start sticky top-0 bg-white z-20">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">STEP {String(index + 1).padStart(2, '0')}</span>
              <span className="text-[12px] font-bold text-slate-500">{step.day}</span>
            </div>
            <h2 className="text-2xl font-black text-slate-800 mt-2 tracking-tight">{step.id}. {step.title}</h2>
          </div>
          <button ref={closeRef} onClick={guardedClose} aria-label="닫기" className="w-11 h-11 shrink-0 flex items-center justify-center bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors"><i className="fas fa-times" aria-hidden /></button>
        </div>

        <div className="flex-grow overflow-hidden flex flex-col md:flex-row relative">
          <div className="flex-grow overflow-y-auto bg-slate-50/50 p-6 md:w-1/2 border-r border-slate-100">
            {step.summary && <div className="note-box !mt-0">{step.summary}</div>}
            {loggedIn && <StepPanel key={step.id} stepId={step.id} steps={stepRefs} />}

            {step.checklist.length > 0 && (
              <div>
                <h5 className={sectionTitle}><i className="fas fa-check-circle text-slate-500" aria-hidden /> 필수 체크리스트</h5>
                {step.checklist.map((c, i) => <ChecklistRow key={i} text={c} stepId={step.id} loggedIn={loggedIn} />)}
              </div>
            )}

            {/* 긴 목록은 여기서 펼치지 않는다. 한 줄씩 눌러 오른쪽 칸(폰은 밀려 들어오는 창)에서 본다 */}
            {cats.length > 0 && (
              <div className="mt-6">
                {cats.map((k) => {
                  const on = cur === k;
                  const r = ROW[k];
                  return (
                    <button key={k} ref={(el) => { rowRefs.current[k] = el; }} type="button" onClick={() => pick(k)} aria-current={on ? 'true' : undefined}
                      className={`w-full min-h-14 mb-2.5 flex items-center justify-between gap-3 rounded-[20px] border px-[18px] py-3 text-left transition-colors ${r.bg} ${on ? 'border-blue-400' : `${r.border} hover:border-blue-300`}`}>
                      <span className="flex min-w-0 items-center gap-2.5 text-[15px] font-bold text-slate-800">
                        <i className={`${r.icon} ${r.iconCls}`} aria-hidden />{SECTION_LABEL[k]}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-[14px] font-bold text-slate-600">
                        {sectionCount(step, k)}<i className="fas fa-chevron-right text-slate-400 text-[12px]" aria-hidden />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className={`detail-panel md:relative md:translate-x-0 md:w-1/2 md:bg-white md:shadow-none ${view.panel ? 'active' : ''}`}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-4 sticky top-0 bg-white z-20 md:bg-slate-50/30">
              <button ref={backRef} onClick={closePanel} aria-label="목록으로" className="w-11 h-11 shrink-0 flex items-center justify-center bg-slate-100 rounded-xl md:hidden"><i className="fas fa-arrow-left text-sm" aria-hidden /></button>
              <h3 className="font-bold text-slate-800 text-lg truncate">
                {cur ? <>{SECTION_LABEL[cur]} <span className="font-semibold text-slate-500">{sectionCount(step, cur)}</span></> : '내용 상세 보기'}
              </h3>
            </div>
            <div className="flex-grow overflow-y-auto p-6 md:p-8 bg-white">
              {cur ? <SectionCards step={step} k={cur} /> : (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500 space-y-4">
                  <i className="fas fa-mouse-pointer text-4xl opacity-20" aria-hidden />
                  <p className="font-normal text-center">주의사항·공식 기준·필살기·톡방 사례를 고르면 여기에 보여요.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 p-5 bg-white flex justify-between items-center sticky bottom-0 z-20">
          <button onClick={() => guard(() => onGo(index - 1))} style={{ visibility: index === 0 ? 'hidden' : 'visible' }} className="flex items-center gap-2 px-5 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"><i className="fas fa-chevron-left" />이전 단계</button>
          <button onClick={() => guard(() => onGo(index + 1))} style={{ visibility: index === steps.length - 1 ? 'hidden' : 'visible' }} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all">다음 단계<i className="fas fa-chevron-right" /></button>
        </div>
      </div>
    </div>
  );
}

// 오른쪽 칸(폰은 밀려 들어오는 창)에 보이는, 고른 갈래의 전체 목록
function SectionCards({ step, k }: { step: Step; k: StepSection }) {
  if (k === 'warnings') {
    return (
      <>
        {step.warnings.map((w, i) => (
          <div key={i} className={`${cardBase} border-red-100 bg-red-50/60`}>
            <p className="text-[14px] font-semibold text-red-700 leading-relaxed">{w}</p>
          </div>
        ))}
      </>
    );
  }
  if (k === 'official') {
    return (
      <>
        {step.official.map((o, i) => {
          const url = safeUrl(o.url);
          return (
            <div key={i} className={`${cardBase} border-slate-200 bg-white`}>
              <p className="text-[15px] font-semibold text-slate-900 leading-relaxed">{o.text}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] font-semibold text-slate-600">
                {o.region && <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 text-[12px] font-bold">{o.region}</span>}
                {o.checked && <span>확인일 {o.checked}</span>}
                {url
                  ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline underline-offset-2 font-bold break-all">{o.source || o.url}<i className="fas fa-arrow-up-right-from-square ml-1 text-[12px]" aria-hidden /></a>
                  : o.source && <span>출처 {o.source}</span>}
              </div>
            </div>
          );
        })}
      </>
    );
  }
  if (k === 'tips') {
    return (
      <>
        {step.tips.map((t, i) => (
          <div key={i} className={`${cardBase} border-slate-200 bg-white`}>
            <p className="text-[15px] font-medium text-slate-800 leading-relaxed">{t.text}</p>
            {t.from && <p className="mt-2 text-[13px] font-semibold text-slate-600">출처: {t.from}</p>}
          </div>
        ))}
      </>
    );
  }
  return (
    <>
      {step.community.map((c, i) => (
        <div key={i} className={`${cardBase} border-slate-200 bg-white`}>
          {(c.kind || c.date) && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-600">
              {c.kind && <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[12px] font-bold">{c.kind}</span>}
              {c.date && <span>{c.date}</span>}
            </div>
          )}
          <p className="text-[15px] font-medium text-slate-800 leading-relaxed">{c.text}</p>
        </div>
      ))}
    </>
  );
}

// 필수 체크리스트 한 줄: 로그인했을 때만 「할 일로 추가」 한 가지 동작. 로그인 전엔 누를 수 없는 줄.
function ChecklistRow({ text, stepId, loggedIn }: { text: string; stepId: number; loggedIn: boolean }) {
  const { doc, send, toast } = useProgress();
  const [busy, setBusy] = useState(false);
  const taskText = text.trim().slice(0, 200);
  const added = loggedIn && !!doc && Object.values(doc.tasks).some((t) => !t.deletedAt && t.stepId === stepId && t.text.trim() === taskText);
  return (
    <div className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white pl-[18px] pr-2 py-2 mb-2.5 min-h-[52px]">
      <span className="flex-1 min-w-0 text-[14px] font-semibold text-slate-800 leading-relaxed py-1.5">{text}</span>
      {loggedIn && (added ? (
        <span className="shrink-0 inline-flex items-center gap-1 min-h-11 px-3 text-[13px] font-bold text-emerald-700"><i className="fas fa-check" aria-hidden />할 일에 있음</span>
      ) : (
        <button type="button" disabled={busy} className="shrink-0 whitespace-nowrap min-h-11 px-3 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-bold hover:bg-slate-200 disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            try {
              const r = await send({ op: 'task.add', stepId, text: taskText });
              if (r.ok) toast(`${stepId}단계 할 일에 추가했어요.`);
            } finally { setBusy(false); }
          }}>할 일로 추가</button>
      ))}
    </div>
  );
}
