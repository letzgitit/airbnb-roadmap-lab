'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signIn, signOut } from 'next-auth/react';
import type { Content, StepStatus } from '@/lib/core/types';
import { SECTION_LABEL, SECTION_ORDER, type StepSection } from '@/lib/client/step-sections';
import { TimelineChart } from './TimelineChart';
import { StepModal } from './StepModal';
import { ScriptsModal } from './ScriptsModal';
import { NoticeRow } from './NoticeRow';
import { NoticeModal } from './NoticeModal';
import { ProgressProvider, useProgress } from './progress/ProgressProvider';
import { Summary } from './progress/Summary';
import { RecordsModal } from './progress/RecordsModal';

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

// 검색 결과 한 줄: 어디에 걸렸는지(label)와, 눌렀을 때 갈 곳
type Hit =
  | { kind: 'step'; i: number; section: StepSection | null; label: string; text: string }
  | { kind: 'update'; idx: number; label: string; text: string };
const MAX_HITS = 8;

function Inner({ content, loginReady }: { content: Content; loginReady: boolean }) {
  const { steps, scripts, updates } = content;
  const { status, doc } = useProgress();
  const loggedIn = status === 'ready' && !!doc;
  const step = useDialog();
  const tool = useDialog();
  const notice = useDialog();
  const records = useDialog();
  const { show: showStep } = step;
  const { show: showNotice } = notice;
  const { hide: hideRecords } = records;
  const [index, setIndex] = useState(0);
  const [section, setSection] = useState<StepSection | null>(null);
  const [noticeIdx, setNoticeIdx] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  // 로그아웃·세션 만료로 현황이 사라지면 「집 정보 · 기록」 창도 같이 닫는다(화면 잠금이 남지 않게)
  const recordsOpen = loggedIn && records.open;
  useEffect(() => { if (!loggedIn) hideRecords(); }, [loggedIn, hideRecords]);

  // 창이 하나라도 열려 있으면 뒤 화면 스크롤을 잠근다
  useEffect(() => {
    document.body.style.overflow = step.open || tool.open || notice.open || recordsOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [step.open, tool.open, notice.open, recordsOpen]);

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

  const openStep = useCallback((i: number, sec: StepSection | null = null) => { setIndex(i); setSection(sec); showStep(); }, [showStep]);
  const openStepById = useCallback((id: number) => { const i = steps.findIndex((s) => s.id === id); if (i >= 0) openStep(i); }, [steps, openStep]);
  const openNotice = useCallback((idx: number | null = null) => { setNoticeIdx(idx); showNotice(); }, [showNotice]);

  const results = useMemo<Hit[] | null>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    const has = (t: string) => t.toLowerCase().includes(q);
    const stepHits: Hit[] = [];
    steps.forEach((s, i) => {
      const base = `${s.id}. ${s.title}`;
      // 제목·요약·체크리스트에 걸리면 단계만 연다
      const head = [s.title, s.summary, ...s.checklist].find(has);
      if (head) stepHits.push({ kind: 'step', i, section: null, label: base, text: head });
      // 네 갈래 목록에 걸리면 그 목록까지 연다(갈래마다 첫 번째 걸린 글 하나)
      const pool: Record<StepSection, string[]> = {
        warnings: s.warnings, official: s.official.map((o) => o.text), tips: s.tips.map((t) => t.text), community: s.community.map((c) => c.text),
      };
      SECTION_ORDER.forEach((k) => {
        const hit = pool[k].find(has);
        if (hit) stepHits.push({ kind: 'step', i, section: k, label: `${base} · ${SECTION_LABEL[k]}`, text: hit });
      });
    });
    const updateHits: Hit[] = [];
    updates.forEach((u, idx) => {
      if (has(u.title)) updateHits.push({ kind: 'update', idx, label: '최근 바뀐 규정', text: u.title });
      else if (has(u.text)) updateHits.push({ kind: 'update', idx, label: '최근 바뀐 규정', text: u.text });
    });
    // 8개 안에서 규정 변화가 단계 글에 묻히지 않게 최소 2칸은 남겨 둔다(단계 글이 적으면 더 많이)
    const upd = updateHits.slice(0, Math.max(2, MAX_HITS - stepHits.length));
    return [...stepHits.slice(0, MAX_HITS - upd.length), ...upd];
  }, [query, steps, updates]);

  const goHit = (r: Hit) => {
    if (r.kind === 'step') openStep(r.i, r.section);
    else openNotice(r.idx);
    setQuery('');
  };

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
                  <button key={k} type="button" className="block w-full text-left p-4 border-b border-slate-50 active:bg-blue-50 hover:bg-slate-50 transition-colors" onClick={() => goHit(r)}>
                    <div className="text-[11px] text-blue-700 font-black mb-1">{r.label}</div>
                    <div className="text-[13px] font-bold text-slate-800 line-clamp-2">{r.text}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main>
        <div className="chart-wrapper">
          {loggedIn && <Summary steps={steps} onOpenStep={openStepById} onOpenRecords={records.show} />}
          <NoticeRow updates={updates} onOpen={() => openNotice(null)} />
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
          <TimelineChart steps={chartSteps} statuses={statuses} counts={counts} onSelect={(i) => openStep(i)} />
        </div>
      </main>

      <StepModal steps={steps} index={index} section={section} open={step.open} shown={step.shown} loggedIn={loggedIn} onClose={step.hide}
        onGo={(i) => { if (i >= 0 && i < steps.length) { setIndex(i); setSection(null); } }} />
      <ScriptsModal scripts={scripts} open={tool.open} shown={tool.shown} onClose={tool.hide} />
      <NoticeModal updates={updates} open={notice.open} shown={notice.shown} initialIndex={noticeIdx} onClose={notice.hide} />
      {loggedIn && <RecordsModal open={records.open} shown={records.shown} onClose={records.hide} />}
    </div>
  );
}

function Legend({ cls, dot, children }: { cls: string; dot: string; children: React.ReactNode }) {
  return <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${cls}`}><div className={`w-2.5 h-2.5 rounded-full ${dot}`} />{children}</div>;
}
