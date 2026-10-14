'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signIn, signOut } from 'next-auth/react';
import type { Content, StepStatus } from '@/lib/core/types';
import { TimelineChart } from './TimelineChart';
import { StepModal } from './StepModal';
import { ScriptsModal } from './ScriptsModal';
import { ProgressProvider, useProgress } from './progress/ProgressProvider';
import { Summary } from './progress/Summary';
import { LogCard } from './progress/LogCard';
import { TrashCard } from './progress/TrashCard';

export default function App({ content, loginReady }: { content: Content; loginReady: boolean }) {
  return (
    <ProgressProvider>
      <Inner content={content} loginReady={loginReady} />
    </ProgressProvider>
  );
}

function useDialog() {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(() => {
    if (t.current) clearTimeout(t.current);
    setOpen(true);
    t.current = setTimeout(() => setShown(true), 10);
  }, []);
  const hide = useCallback(() => {
    setShown(false);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setOpen(false), 300);
  }, []);
  return { open, shown, show, hide };
}

function Inner({ content, loginReady }: { content: Content; loginReady: boolean }) {
  const { steps, scripts, updates } = content;
  const { status, doc } = useProgress();
  const loggedIn = status === 'ready' && !!doc;
  const step = useDialog();
  const tool = useDialog();
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    document.body.style.overflow = step.open || tool.open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [step.open, tool.open]);

  const chartSteps = useMemo(() => steps.map((s) => ({ id: s.id, label: `${s.id}. ${s.title}` })), [steps]);
  const statuses = useMemo(() => {
    if (!loggedIn || !doc) return null;
    const m: Record<number, StepStatus | undefined> = {};
    steps.forEach((s) => { m[s.id] = doc.steps[String(s.id)]?.status; });
    return m;
  }, [loggedIn, doc, steps]);
  const counts = useMemo(() => {
    if (!loggedIn || !doc) return null;
    const m: Record<number, { done: number; total: number }> = {};
    Object.values(doc.tasks).forEach((t) => {
      if (t.deletedAt) return;
      const c = (m[t.stepId] ??= { done: 0, total: 0 });
      c.total += 1; if (t.done) c.done += 1;
    });
    return m;
  }, [loggedIn, doc]);

  const openStep = useCallback((i: number) => { setIndex(i); step.show(); }, [step]);
  const openStepById = useCallback((id: number) => { const i = steps.findIndex((s) => s.id === id); if (i >= 0) openStep(i); }, [steps, openStep]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    const out: { i: number; label: string; text: string }[] = [];
    steps.forEach((s, i) => {
      const texts = [s.title, s.summary, ...s.official.map((o) => o.text), ...s.tips.map((t) => t.text), ...s.community.map((c) => c.text), ...s.checklist, ...s.warnings];
      const hit = texts.find((t) => t.toLowerCase().includes(q));
      if (hit) out.push({ i, label: `${s.id}. ${s.title}`, text: hit });
    });
    return out.slice(0, 8);
  }, [query, steps]);

  return (
    <div className="app-container">
      <header className="gradient-header relative">
        <div className="header-bg" />
        <div className="relative z-30 px-6 pt-10 pb-12">
          <div className="flex flex-wrap justify-between items-start gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-black text-white leading-tight tracking-tight">외도민 타임 라인</h1>
              <p className="text-sm text-blue-100 mt-2 font-medium opacity-90">Created by <span className="font-bold text-amber-300">주money</span></p>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-2">
              <button onClick={tool.show} className="toolbox-btn"><i className="fas fa-comment-medical text-lg" /><span>상황별 필승 멘트함</span></button>
              {status === 'anon' && (loginReady ? (
                <button onClick={() => void signIn('google', { callbackUrl: '/' })} className="text-[12px] font-bold text-blue-100 hover:text-white underline underline-offset-4">
                  <i className="fab fa-google mr-1" />우리 현황 보기 (로그인)
                </button>
              ) : (
                <button type="button" disabled aria-disabled="true" className="text-[12px] font-semibold text-blue-100/80 cursor-not-allowed">
                  <i className="fab fa-google mr-1" aria-hidden />로그인 준비 중
                </button>
              ))}
              {status === 'forbidden' && (
                <button onClick={() => void signOut({ callbackUrl: '/' })} className="text-[12px] font-bold text-amber-200 underline underline-offset-4">허용되지 않은 계정이에요 · 로그아웃</button>
              )}
            </div>
          </div>

          <div className="relative z-30">
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="임대인 설득, 조명 색온도, 구청 실사 등 키워드 검색" aria-label="검색"
              className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/10 border border-white/30 text-white placeholder-white/60 focus:bg-white focus:text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-500/30 transition-all text-sm font-semibold" />
            <i className="fas fa-search absolute left-4 top-4.5 text-white/50 text-xl pt-1" />
            {results && (
              <div className="absolute top-full left-0 w-full mt-3 search-dropdown z-50">
                {results.length === 0 && <div className="p-4 text-center text-slate-400 text-sm">검색 결과가 없습니다.</div>}
                {results.map((r, k) => (
                  <div key={k} className="p-4 border-b border-slate-50 active:bg-blue-50 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => { openStep(r.i); setQuery(''); }}>
                    <div className="text-[10px] text-blue-500 font-black mb-1">{r.label}</div>
                    <div className="text-[13px] font-bold text-slate-800 line-clamp-2">{r.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main>
        <div className="chart-wrapper">
          {loggedIn && <Summary steps={steps} onOpenStep={openStepById} />}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 px-2 gap-4">
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2"><i className="fas fa-calendar-alt text-blue-600" /> 타임 라인 (Day 0 ~ 45)</h3>
            <div className="flex flex-wrap gap-3 text-[11px] font-bold">
              <Legend cls="bg-slate-100 text-slate-600" dot="bg-slate-400">준비</Legend>
              <Legend cls="bg-red-50 text-red-600" dot="bg-red-500">계약</Legend>
              <Legend cls="bg-orange-50 text-orange-600" dot="bg-orange-500">중요</Legend>
              <Legend cls="bg-blue-50 text-blue-600" dot="bg-blue-500">설비</Legend>
              <Legend cls="bg-purple-50 text-purple-600" dot="bg-purple-500">행정</Legend>
            </div>
          </div>
          <TimelineChart steps={chartSteps} statuses={statuses} counts={counts} onSelect={openStep} />
        </div>

        {loggedIn && <LogCard />}

        {updates.length > 0 && (
          <section className="mx-4 mb-10 rounded-3xl bg-white border border-slate-100 shadow-sm p-5" aria-label="최근 바뀐 것">
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2 mb-4"><i className="fas fa-bell text-blue-600" /> 최근 바뀐 것</h3>
            <ul className="space-y-3">
              {updates.map((u, i) => (
                <li key={i} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[12px] font-bold text-slate-500">{u.date}</div>
                  {u.source && <div className="mt-0.5 text-[12px] font-semibold text-slate-500">출처 {/^https?:\/\//i.test(u.url) ? <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline underline-offset-2 break-all">{u.source}</a> : u.source}</div>}
                  <div className="mt-1 font-extrabold text-slate-800 text-[14px]">{u.title}</div>
                  <p className="mt-1 text-[13px] text-slate-600 leading-relaxed">{u.text}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {loggedIn && <TrashCard />}
      </main>

      <StepModal steps={steps} index={index} open={step.open} shown={step.shown} loggedIn={loggedIn} onClose={step.hide}
        onGo={(i) => { if (i >= 0 && i < steps.length) setIndex(i); }} />
      <ScriptsModal scripts={scripts} open={tool.open} shown={tool.shown} onClose={tool.hide} />
    </div>
  );
}

function Legend({ cls, dot, children }: { cls: string; dot: string; children: React.ReactNode }) {
  return <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${cls}`}><div className={`w-2.5 h-2.5 rounded-full ${dot}`} />{children}</div>;
}
