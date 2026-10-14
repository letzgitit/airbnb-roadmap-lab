'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Step } from '@/lib/core/types';
import { StepPanel } from './progress/StepPanel';

interface Item { summary: string; badge?: string; detail: ReactNode }
interface Section { key: string; title: string; icon: string; color: string; items: Item[] }

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);

function buildSections(step: Step): Section[] {
  const meta = (children: ReactNode) => <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold text-slate-500 mb-3">{children}</div>;
  return [
    {
      key: 'official', title: '공식 기준', icon: 'fas fa-scale-balanced', color: 'text-slate-800',
      items: step.official.map((o) => ({
        summary: o.text, badge: o.region,
        detail: (
          <>
            <h5>공식 기준</h5>
            {meta(<>
              {o.region && <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-black">{o.region}</span>}
              {o.checked && <span><i className="far fa-calendar-check mr-1" />확인일 {o.checked}</span>}
            </>)}
            <p>{o.text}</p>
            <p className="text-[13px]">출처: {safeUrl(o.url) ? <a href={safeUrl(o.url)!} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-bold">{o.source || o.url}</a> : (o.source || '-')}</p>
          </>
        ),
      })),
    },
    {
      key: 'tips', title: '고수들의 필살기', icon: 'fas fa-magic', color: 'text-blue-600',
      items: step.tips.map((t) => ({ summary: t.text, detail: (<><h5>요령</h5><p>{t.text}</p>{t.from && <p className="text-[13px] !mb-0">출처: {t.from}</p>}</>) })),
    },
    {
      key: 'community', title: '톡방 사례', icon: 'fas fa-comments', color: 'text-slate-800',
      items: step.community.map((c) => ({
        summary: c.text, badge: c.kind,
        detail: (<><h5>톡방 사례</h5>{meta(<>{c.kind && <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-black">{c.kind}</span>}{c.date && <span>{c.date}</span>}</>)}<p>{c.text}</p></>),
      })),
    },
    {
      key: 'checklist', title: '필수 체크리스트', icon: 'fas fa-check-circle', color: 'text-slate-800',
      items: step.checklist.map((c) => ({ summary: c, detail: (<><h5>필수 체크리스트</h5><div className="note-box">{c}</div></>) })),
    },
    {
      key: 'warnings', title: '실패 방지 주의사항', icon: 'fas fa-exclamation-triangle', color: 'text-red-500',
      items: step.warnings.map((w) => ({ summary: w, detail: (<><h5>주의</h5><div className="warn-box">{w}</div></>) })),
    },
  ].filter((s) => s.items.length > 0);
}

export function StepModal({ steps, index, open, shown, loggedIn, onClose, onGo }: {
  steps: Step[]; index: number; open: boolean; shown: boolean; loggedIn: boolean;
  onClose: () => void; onGo: (i: number) => void;
}) {
  const step = steps[index];
  const sections = useMemo(() => (step ? buildSections(step) : []), [step]);
  const [sel, setSel] = useState<{ s: string; i: number } | null>(null);
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    if (!open) return;
    const first = sections[0];
    // 데스크톱에서는 첫 항목을 바로 열어 둔다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSel(window.innerWidth > 768 && first ? { s: first.key, i: 0 } : null);
    setPanel(false);
  }, [open, index, sections]);

  if (!open || !step) return null;
  const current = sel ? sections.find((s) => s.key === sel.s)?.items[sel.i] : undefined;
  const stepRefs = steps.map((s) => ({ id: s.id, title: s.title }));

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={step.title}>
      <div className="modal-overlay absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`absolute inset-x-0 bottom-0 top-10 bg-white rounded-t-[40px] flex flex-col modal-content transition-transform ${shown ? '' : 'translate-y-full'} md:relative md:top-auto md:inset-x-auto md:h-[85vh] md:rounded-[32px] md:mx-auto md:mt-[7vh] shadow-2xl overflow-hidden`}>
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start sticky top-0 bg-white z-20">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 uppercase tracking-tighter">STEP {String(index + 1).padStart(2, '0')}</span>
              <span className="text-[10px] font-black text-slate-400">Day {step.day}</span>
            </div>
            <h2 className="text-2xl font-black text-slate-800 mt-2 tracking-tight">{step.id}. {step.title}</h2>
          </div>
          <button onClick={onClose} aria-label="닫기" className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"><i className="fas fa-times" /></button>
        </div>

        <div className="flex-grow overflow-hidden flex flex-col md:flex-row relative">
          <div className="flex-grow overflow-y-auto bg-slate-50/50 p-6 md:w-1/2 border-r border-slate-100">
            {step.summary && <div className="note-box !mt-0">{step.summary}</div>}
            {loggedIn && <StepPanel stepId={step.id} steps={stepRefs} />}
            {sections.map((sec) => (
              <div key={sec.key}>
                <h5 className="text-[11px] font-black text-slate-400 mt-8 mb-3 tracking-widest uppercase flex items-center gap-2"><i className={sec.icon} /> {sec.title}</h5>
                {sec.items.map((item, i) => (
                  <div key={i} className="guide-card" role="button" tabIndex={0}
                    onClick={() => { setSel({ s: sec.key, i }); setPanel(true); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setSel({ s: sec.key, i }); setPanel(true); } }}>
                    <div className="flex justify-between items-center gap-3">
                      <span className={`font-bold text-[14px] line-clamp-2 ${sec.color}`}>{item.summary}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        {item.badge && <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-black">{item.badge}</span>}
                        <i className="fas fa-chevron-right text-slate-300 text-[10px]" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className={`detail-panel md:relative md:translate-x-0 md:w-1/2 md:bg-white md:shadow-none ${panel ? 'active' : ''}`}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-4 sticky top-0 bg-white z-20 md:bg-slate-50/30">
              <button onClick={() => setPanel(false)} aria-label="목록으로" className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg md:hidden"><i className="fas fa-arrow-left text-sm" /></button>
              <h3 className="font-bold text-slate-800 text-lg truncate">내용 상세 보기</h3>
            </div>
            <div className="flex-grow overflow-y-auto p-8 bg-white">
              <div className="prose prose-blue prose-sm text-slate-700 w-full max-w-none">
                {current ? current.detail : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4">
                    <i className="fas fa-mouse-pointer text-4xl opacity-20" />
                    <p className="font-medium">좌측의 항목을 클릭하여 상세 정보를 확인하세요.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 p-5 bg-white flex justify-between items-center sticky bottom-0 z-20">
          <button onClick={() => onGo(index - 1)} style={{ visibility: index === 0 ? 'hidden' : 'visible' }} className="flex items-center gap-2 px-5 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"><i className="fas fa-chevron-left" />이전 단계</button>
          <button onClick={() => onGo(index + 1)} style={{ visibility: index === steps.length - 1 ? 'hidden' : 'visible' }} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all">다음 단계<i className="fas fa-chevron-right" /></button>
        </div>
      </div>
    </div>
  );
}
