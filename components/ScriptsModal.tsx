'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ScriptItem } from '@/lib/core/types';

function iconFor(who: string) {
  if (/중개/.test(who)) return 'fa-building';
  if (/임대|집주인/.test(who)) return 'fa-user-tie';
  if (/이웃|주민/.test(who)) return 'fa-users';
  if (/구청|주무관|공무원/.test(who)) return 'fa-landmark';
  if (/게스트|손님/.test(who)) return 'fa-plane-arrival';
  return 'fa-comment-dots';
}

export function ScriptsModal({ scripts, open, shown, onClose }: { scripts: ScriptItem[]; open: boolean; shown: boolean; onClose: () => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, ScriptItem[]>();
    scripts.forEach((s) => m.set(s.who, [...(m.get(s.who) ?? []), s]));
    return [...m.entries()];
  }, [scripts]);
  const [sel, setSel] = useState<ScriptItem | null>(null);
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSel(window.innerWidth > 768 ? (groups[0]?.[1][0] ?? null) : null);
    setPanel(false);
  }, [open, groups]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="상황별 필승 멘트 공략집">
      <div className="modal-overlay absolute inset-0 bg-slate-900/70 backdrop-blur-md" onClick={onClose} />
      <div className={`absolute inset-x-0 bottom-0 top-16 bg-white rounded-t-[40px] flex flex-col modal-content transition-transform ${shown ? '' : 'translate-y-full'} md:relative md:top-auto md:h-[80vh] md:rounded-[32px] md:mt-[10vh] shadow-2xl overflow-hidden`}>
        <div className="px-8 py-8 border-b border-slate-100 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-black text-slate-900">상황별 필승 멘트 공략집</h2>
            <p className="text-sm text-slate-500 mt-2 font-medium">당신을 전문가로 만들어주는 {groups.length}인의 이해관계자 대응법</p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-full text-slate-500"><i className="fas fa-times" /></button>
        </div>
        <div className="flex-grow overflow-hidden flex flex-col md:flex-row relative">
          <div className="flex-grow overflow-y-auto bg-slate-50/50 p-6 md:w-1/2 border-r border-slate-100">
            {groups.map(([who, items]) => (
              <div className="mb-8" key={who}>
                <h3 className="text-lg font-black text-blue-800 mb-4 flex items-center gap-3"><i className={`fas ${iconFor(who)} bg-blue-100 p-2 rounded-xl text-blue-600`} /> {who}</h3>
                {items.map((it, i) => (
                  <div key={i} className="guide-card" role="button" tabIndex={0} onClick={() => { setSel(it); setPanel(true); }} onKeyDown={(e) => { if (e.key === 'Enter') { setSel(it); setPanel(true); } }}>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-700 text-sm">{it.situation}</span>
                      <i className="fas fa-comment-dots text-blue-400 text-sm" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className={`detail-panel md:relative md:translate-x-0 md:w-1/2 md:bg-white md:shadow-none ${panel ? 'active' : ''}`}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-4 sticky top-0 bg-white z-20 md:bg-slate-50/30">
              <button onClick={() => setPanel(false)} aria-label="목록으로" className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg md:hidden"><i className="fas fa-arrow-left text-sm" /></button>
              <h3 className="font-bold text-slate-800 text-lg truncate">{sel ? `${sel.who} · ${sel.situation}` : '멘트 상세 가이드'}</h3>
            </div>
            <div className="flex-grow overflow-y-auto p-8 bg-white">
              <div className="prose prose-blue prose-sm text-slate-700 w-full max-w-none">
                {sel ? (
                  <>
                    <div className="script-box">{sel.lines.map((l, i) => <blockquote key={i} className={i ? 'mt-3' : ''}>&ldquo;{l}&rdquo;</blockquote>)}</div>
                    {sel.tips.map((t, i) => <p key={i}>{t}</p>)}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4">
                    <i className="fas fa-comment-dots text-4xl opacity-20" />
                    <p className="font-medium">좌측의 멘트 항목을 클릭하여 상세 내용을 확인하세요.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
