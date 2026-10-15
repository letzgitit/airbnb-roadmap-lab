'use client';

import { useCallback, useMemo, useState } from 'react';
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
import { useSheetRouter, type SheetKind } from './use-sheet-router';

export default function App({ content, loginReady }: { content: Content; loginReady: boolean }) {
  return (
    <ProgressProvider>
      <Inner content={content} loginReady={loginReady} />
    </ProgressProvider>
  );
}

// 검색 결과 한 줄: 어디에 걸렸는지(label)와, 눌렀을 때 갈 곳
type Hit =
  | { kind: 'step'; i: number; section: StepSection | null; label: string; text: string }
  | { kind: 'update'; idx: number; label: string; text: string };
const MAX_HITS = 8;

function Inner({ content, loginReady }: { content: Content; loginReady: boolean }) {
  const { steps, scripts, updates } = content;
  const { status, doc, hasDirty, confirmDiscard } = useProgress();
  const loggedIn = status === 'ready' && !!doc;
  const [query, setQuery] = useState('');
  const stepIds = useMemo(() => steps.map((s) => s.id), [steps]);

  // 저장 안 한 편집이 있는 시트는 떠나기 전에 앱 안 확인 창을 거친다
  // (단계 창 = 그 창 안의 폼, 집 정보·기록 = 어느 범위의 폼이든)
  const guard = useCallback(async (kind: SheetKind) => {
    if (kind !== 'step' && kind !== 'records') return true;
    if (!hasDirty(kind === 'step' ? 'modal' : undefined)) return true;
    return confirmDiscard();
  }, [hasDirty, confirmDiscard]);

  // 시트는 한 번에 하나만, 주소 해시(#step-3 · #notice · #records · #scripts)와 함께 열고 닫는다
  const { sheet, shown, open: openSheet, close: closeSheet, goStep } = useSheetRouter({ stepIds, loggedIn, status, guard });

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

  const openStep = useCallback((i: number, section: StepSection | null = null) => openSheet({ kind: 'step', index: i, section }), [openSheet]);
  const openStepById = useCallback((id: number) => { const i = steps.findIndex((s) => s.id === id); if (i >= 0) openStep(i); }, [steps, openStep]);
  const openNotice = useCallback((idx: number | null = null) => openSheet({ kind: 'notice', initialIndex: idx }), [openSheet]);

  const results = useMemo<Hit[] | null>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    const has = (t: string) => t.toLowerCase().includes(q);
    const stepHits: Hit[] = [];
    steps.forEach((s, i) => {
      const base = `${s.id}. ${s.title}`;
      // 제목·요약·체크리스트에 걸리면 단계만 연다(「챙길 것」 탭)
      const head = [s.title, s.summary, ...s.checklist].find(has);
      if (head) stepHits.push({ kind: 'step', i, section: null, label: base, text: head });
      // 네 갈래 목록에 걸리면 그 탭까지 연다(갈래마다 첫 번째 걸린 글 하나)
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
        <div className="relative z-30 px-5 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="min-w-0 text-2xl font-black leading-tight tracking-tight text-white">외도민 타임 라인</h1>
            <button type="button" onClick={() => openSheet({ kind: 'scripts' })} aria-label="상황별 필승 멘트함" className="toolbox-btn h-10 shrink-0 gap-2 px-3 py-0 text-[13px]">
              <i className="fas fa-comment-medical text-base" aria-hidden /><span>멘트함</span>
            </button>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3">
            <p className="text-xs font-medium text-blue-100 opacity-90">Created by <span className="font-bold text-amber-300">주money</span></p>
            {status === 'anon' && (loginReady ? (
              <button type="button" onClick={() => void signIn('google', { callbackUrl: '/' })} className="inline-flex min-h-9 items-center text-[12px] font-bold text-blue-100 underline underline-offset-4 hover:text-white">
                <i className="fab fa-google mr-1" aria-hidden />우리 현황 보기 (로그인)
              </button>
            ) : (
              <button type="button" disabled aria-disabled="true" className="inline-flex min-h-9 cursor-not-allowed items-center text-[12px] font-semibold text-blue-100/80">
                <i className="fab fa-google mr-1" aria-hidden />로그인 준비 중
              </button>
            ))}
            {status === 'forbidden' && (
              <button type="button" onClick={() => void signOut({ callbackUrl: '/' })} className="inline-flex min-h-9 items-center text-[12px] font-bold text-amber-200 underline underline-offset-4">허용되지 않은 계정이에요 · 로그아웃</button>
            )}
          </div>

          <div className="relative z-30 mt-2">
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="임대인 설득, 조명 색온도, 구청 실사 등 키워드 검색" aria-label="검색"
              className="h-11 w-full rounded-2xl border border-white/30 bg-white/10 pl-11 pr-4 text-sm font-semibold text-white placeholder-white/60 transition-all focus:bg-white focus:text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-500/30" />
            <i className="fas fa-search pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-white/60" aria-hidden />
            {results && (
              <div className="search-dropdown absolute left-0 top-full z-50 mt-3 w-full">
                {results.length === 0 && <div className="p-4 text-center text-sm text-slate-400">검색 결과가 없습니다.</div>}
                {results.map((r, k) => (
                  <button key={k} type="button" className="block w-full border-b border-slate-50 p-4 text-left transition-colors hover:bg-slate-50 active:bg-blue-50" onClick={() => goHit(r)}>
                    <div className="mb-1 text-[11px] font-black text-blue-700">{r.label}</div>
                    <div className="line-clamp-2 text-[13px] font-bold text-slate-800">{r.text}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main>
        <div className="chart-wrapper">
          {loggedIn
            ? <Summary steps={steps} onOpenStep={openStepById} onOpenRecords={() => openSheet({ kind: 'records' })} />
            : <p className="mb-4 px-1 text-[14px] leading-relaxed text-slate-600">외도민 등록부터 첫 손님까지 {steps.length}단계예요. 단계를 누르면 챙길 것과 주의사항이 나와요.</p>}
          <NoticeRow updates={updates} onOpen={() => openNotice(null)} />
          <div className="mb-6 flex flex-col items-start gap-4 px-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-800"><i className="fas fa-calendar-alt text-blue-600" /> 타임 라인 (Day 0 ~ 45)</h3>
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

      <StepModal steps={steps} index={sheet?.kind === 'step' ? sheet.index : 0} section={sheet?.kind === 'step' ? sheet.section : null}
        open={sheet?.kind === 'step'} shown={shown} loggedIn={loggedIn} onClose={closeSheet} beforeClose={() => guard('step')} onGo={goStep} />
      <ScriptsModal scripts={scripts} open={sheet?.kind === 'scripts'} shown={shown} onClose={closeSheet} />
      <NoticeModal updates={updates} open={sheet?.kind === 'notice'} initialIndex={sheet?.kind === 'notice' ? sheet.initialIndex : null} shown={shown} onClose={closeSheet} />
      {loggedIn && <RecordsModal open={sheet?.kind === 'records'} shown={shown} onClose={closeSheet} beforeClose={() => guard('records')} />}
    </div>
  );
}

function Legend({ cls, dot, children }: { cls: string; dot: string; children: React.ReactNode }) {
  return <div className={`flex items-center gap-1.5 rounded-full px-2 py-1 ${cls}`}><div className={`h-2.5 w-2.5 rounded-full ${dot}`} />{children}</div>;
}
