'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Step } from '@/lib/core/types';
import { onActivate } from '@/lib/client/a11y';
import { StepPanel } from './progress/StepPanel';
import { useProgress } from './progress/ProgressProvider';

// 누르면 상세 칸에 더 보여 주는 항목(요령·톡방 사례·주의사항)
interface Item { summary: string; badge?: string; detail: ReactNode }
type Sel = { s: 'tips' | 'community' | 'warnings'; i: number };

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);
const sectionTitle = 'text-[14px] font-bold text-slate-700 mt-8 mb-3 flex items-center gap-2';

function buildItems(step: Step): Record<Sel['s'], Item[]> {
  const meta = (children: ReactNode) => <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-600 mb-3">{children}</div>;
  return {
    tips: step.tips.map((t) => ({ summary: t.text, detail: (<><h5>요령</h5><p>{t.text}</p>{t.from && <p className="text-[13px] !mb-0">출처: {t.from}</p>}</>) })),
    community: step.community.map((c) => ({
      summary: c.text, badge: c.kind,
      detail: (<><h5>톡방 사례</h5>{meta(<>{c.kind && <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[12px] font-bold">{c.kind}</span>}{c.date && <span>{c.date}</span>}</>)}<p>{c.text}</p></>),
    })),
    warnings: step.warnings.map((w) => ({ summary: w, detail: (<><h5>주의</h5><div className="warn-box">{w}</div></>) })),
  };
}

export function StepModal({ steps, index, open, shown, loggedIn, onClose, onGo }: {
  steps: Step[]; index: number; open: boolean; shown: boolean; loggedIn: boolean;
  onClose: () => void; onGo: (i: number) => void;
}) {
  const step = steps[index];
  const items = useMemo(() => (step ? buildItems(step) : null), [step]);
  const [sel, setSel] = useState<Sel | null>(null);
  const [panel, setPanel] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { hasDirty, confirmDiscard } = useProgress();
  // 단계 창 안의 편집 폼에 저장 안 한 내용이 있으면, 닫기·이전/다음 단계 전에 앱 안 확인 창을 띄운다
  const guard = (fn: () => void) => {
    if (!hasDirty('modal')) { fn(); return; }
    void confirmDiscard().then((ok) => { if (ok) fn(); });
  };
  const guardedClose = () => guard(onClose);
  const closeRefFn = useRef(guardedClose);
  useEffect(() => { closeRefFn.current = guardedClose; });

  useEffect(() => {
    if (!open || !items) return;
    // 데스크톱에서는 누를 수 있는 첫 항목을 바로 열어 둔다
    const first = (['tips', 'community', 'warnings'] as const).find((k) => items[k].length > 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSel(window.innerWidth > 768 && first ? { s: first, i: 0 } : null);
    setPanel(false);
  }, [open, index, items]);

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

  if (!open || !step || !items) return null;
  const current = sel ? items[sel.s][sel.i] : undefined;
  const stepRefs = steps.map((s) => ({ id: s.id, title: s.title }));
  const pick = (s: Sel['s'], i: number) => { setSel({ s, i }); setPanel(true); };

  const clickable = (key: Sel['s'], title: string, icon: string, tone: { card: string; text: string }) => items[key].length > 0 && (
    <div key={key}>
      <h5 className={sectionTitle}><i className={`${icon} text-slate-500`} aria-hidden /> {title}</h5>
      {items[key].map((item, i) => (
        <div key={i} className={`guide-card ${tone.card}`} role="button" tabIndex={0} onClick={() => pick(key, i)} onKeyDown={onActivate(() => pick(key, i))}>
          <div className="flex justify-between items-center gap-3">
            <span className={`text-[14px] leading-relaxed line-clamp-2 ${tone.text}`}>{item.summary}</span>
            <span className="flex items-center gap-2 shrink-0">
              {item.badge && <span className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 text-[12px] font-bold">{item.badge}</span>}
              <i className="fas fa-chevron-right text-slate-400 text-[12px]" aria-hidden />
            </span>
          </div>
        </div>
      ))}
    </div>
  );

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

            {step.official.length > 0 && (
              <div>
                <h5 className={sectionTitle}><i className="fas fa-scale-balanced text-slate-500" aria-hidden /> 공식 기준</h5>
                {step.official.map((o, i) => {
                  const url = safeUrl(o.url);
                  return (
                    <div key={i} className="rounded-[20px] border border-slate-200 bg-white px-[18px] py-4 mb-3.5">
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
              </div>
            )}

            {clickable('tips', '고수들의 필살기', 'fas fa-magic', { card: 'bg-slate-50', text: 'font-normal text-slate-800' })}
            {clickable('community', '톡방 사례', 'fas fa-comments', { card: 'bg-slate-50', text: 'font-normal text-slate-700' })}

            {step.checklist.length > 0 && (
              <div>
                <h5 className={sectionTitle}><i className="fas fa-check-circle text-slate-500" aria-hidden /> 필수 체크리스트</h5>
                {step.checklist.map((c, i) => <ChecklistRow key={i} text={c} stepId={step.id} loggedIn={loggedIn} />)}
              </div>
            )}

            {clickable('warnings', '실패 방지 주의사항', 'fas fa-exclamation-triangle', { card: '', text: 'font-bold text-red-600' })}
          </div>

          <div className={`detail-panel md:relative md:translate-x-0 md:w-1/2 md:bg-white md:shadow-none ${panel ? 'active' : ''}`}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-4 sticky top-0 bg-white z-20 md:bg-slate-50/30">
              <button onClick={() => setPanel(false)} aria-label="목록으로" className="w-11 h-11 shrink-0 flex items-center justify-center bg-slate-100 rounded-xl md:hidden"><i className="fas fa-arrow-left text-sm" aria-hidden /></button>
              <h3 className="font-bold text-slate-800 text-lg truncate">내용 상세 보기</h3>
            </div>
            <div className="flex-grow overflow-y-auto p-8 bg-white">
              <div className="prose prose-blue prose-sm text-slate-700 w-full max-w-none">
                {current ? current.detail : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4">
                    <i className="fas fa-mouse-pointer text-4xl opacity-20" aria-hidden />
                    <p className="font-medium">좌측의 항목을 클릭하여 상세 정보를 확인하세요.</p>
                  </div>
                )}
              </div>
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
