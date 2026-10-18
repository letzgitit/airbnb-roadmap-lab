'use client';

import { useCallback, useMemo, useState } from 'react';
import { signIn, signOut } from 'next-auth/react';
import type { Content, StepStatus } from '@/lib/core/types';
import { SECTION_ORDER, TAB_LABEL, type StepSection } from '@/lib/client/step-sections';
import { dueState, todayStr } from '@/lib/client/format';
import { TimelineChart, TYPE_DOT, TYPE_LABEL, TYPE_ORDER, type StepCounts } from './TimelineChart';
import { StepModal } from './StepModal';
import { ScriptsModal } from './ScriptsModal';
import { HomeEntries } from './HomeEntries';
import { NoticeModal } from './NoticeModal';
import { ThemeToggle } from './ThemeToggle';
import { ProgressProvider, useProgress } from './progress/ProgressProvider';
import { RecordsModal } from './progress/RecordsModal';
import { PhotosProvider } from './progress/PhotosPanel';
import { useSheetRouter, type SheetKind } from './use-sheet-router';

export default function App({ content, loginReady }: { content: Content; loginReady: boolean }) {
  return (
    <ProgressProvider>
      <Inner content={content} loginReady={loginReady} />
    </ProgressProvider>
  );
}

// 검색 결과 한 줄: 어디에 걸렸는지(label + 탭 이름 tag)와, 눌렀을 때 갈 곳
type Hit =
  | { kind: 'step'; i: number; section: StepSection | null; label: string; tag?: string; text: string }
  | { kind: 'update'; idx: number; label: string; tag?: string; text: string };
const MAX_HITS = 8;

function Inner({ content, loginReady }: { content: Content; loginReady: boolean }) {
  const { steps, scripts, updates } = content;
  const { status, doc, hasDirty, confirmDiscard } = useProgress();
  const loggedIn = status === 'ready' && !!doc;
  const [query, setQuery] = useState('');
  const stepIds = useMemo(() => steps.map((s) => s.id), [steps]);

  // 저장 안 한 편집이 있는 시트는 떠나기 전에 앱 안 확인 창을 거친다
  // (단계 창 = 그 창 안의 폼, 집 정보·기록 = 어느 범위의 폼이든)
  const isDirty = useCallback((kind: SheetKind) => (kind === 'step' ? hasDirty('modal') : kind === 'records' ? hasDirty() : false), [hasDirty]);
  const guard = useCallback(async (kind: SheetKind) => !isDirty(kind) || (await confirmDiscard()), [isDirty, confirmDiscard]);

  // 시트는 한 번에 하나만, 주소 해시(#step-3 · #notice · #records · #scripts)와 함께 열고 닫는다
  const { sheet, shown, open: openSheet, close: closeSheet, goStep } = useSheetRouter({ stepIds, loggedIn, status, isDirty, confirm: confirmDiscard });

  // 사진은 타임라인 단계로 묶는다(단계 이름은 공개 콘텐츠의 단계를 그대로 쓴다)
  const photoSteps = useMemo(() => steps.map((s) => ({ id: s.id, title: s.title })), [steps]);
  const chartSteps = useMemo(() => steps.map((s) => ({ id: s.id, label: `${s.id}. ${s.title}` })), [steps]);
  const statuses = useMemo(() => {
    if (!loggedIn || !doc) return null;
    const m: Record<number, StepStatus | undefined> = {};
    steps.forEach((s) => { m[s.id] = doc.steps[String(s.id)]?.status; });
    return m;
  }, [loggedIn, doc, steps]);
  // 단계별 할 일 개수. 「오늘 n」 · 「기한 지남 n」은 안 끝난 할 일만 센다(마감 기준은 할 일 줄의 날짜 표시와 같다).
  const today = todayStr();
  const counts = useMemo(() => {
    if (!loggedIn || !doc) return null;
    const m: Record<number, StepCounts> = {};
    Object.values(doc.tasks).forEach((t) => {
      if (t.deletedAt) return;
      const c = (m[t.stepId] ??= { done: 0, total: 0, today: 0, late: 0 });
      c.total += 1;
      if (t.done) { c.done += 1; return; }
      const due = dueState(t.due, today);
      if (due === 'today') c.today += 1;
      else if (due === 'late') c.late += 1;
    });
    return m;
  }, [loggedIn, doc, today]);
  // 지금 하는 단계: 진행 중인 첫 단계, 없으면 시작 안 한 첫 단계(타임라인의 「지금」 줄 기준)
  const currentId = useMemo(() => {
    if (!statuses) return null;
    const first = (want: StepStatus) => steps.find((s) => (statuses[s.id] ?? 'todo') === want)?.id;
    return first('doing') ?? first('todo') ?? null;
  }, [statuses, steps]);

  const openStep = useCallback((i: number, section: StepSection | null = null) => openSheet({ kind: 'step', index: i, section }), [openSheet]);
  const openNotice = useCallback((idx: number | null = null) => openSheet({ kind: 'notice', initialIndex: idx }), [openSheet]);
  const warnCount = useMemo(() => steps.reduce((n, s) => n + s.warnings.length, 0), [steps]);

  const results = useMemo<Hit[] | null>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    const has = (t: string) => t.toLowerCase().includes(q);
    const stepHits: Hit[] = [];
    steps.forEach((s, i) => {
      const base = `${s.id}. ${s.title}`;
      // 제목·요약·추천 할 일에 걸리면 단계만 연다(「할 일」 탭)
      const head = [s.title, s.summary, ...s.checklist].find(has);
      if (head) stepHits.push({ kind: 'step', i, section: null, label: base, text: head });
      // 네 갈래 목록에 걸리면 그 탭까지 연다(갈래마다 첫 번째 걸린 글 하나). 라벨은 탭 이름 그대로.
      const pool: Record<StepSection, string[]> = {
        warnings: s.warnings, official: s.official.map((o) => o.text), tips: [...s.tips.map((t) => t.text), ...s.community.map((c) => c.text)], refs: s.refs.flatMap((r) => [r.title, r.summary]),
      };
      SECTION_ORDER.forEach((k) => {
        const hit = pool[k].find(has);
        if (hit) stepHits.push({ kind: 'step', i, section: k, label: base, tag: TAB_LABEL[k], text: hit });
      });
    });
    const updateHits: Hit[] = [];
    updates.forEach((u, idx) => {
      if (has(u.title)) updateHits.push({ kind: 'update', idx, label: '주의사항', tag: '바뀐 규정', text: u.title });
      else if (has(u.text)) updateHits.push({ kind: 'update', idx, label: '주의사항', tag: '바뀐 규정', text: u.text });
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
    <PhotosProvider steps={photoSteps}>
    <div className="app-container">
      <header className="border-b border-slate-200 bg-white">
        <div className="px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="min-w-0 text-2xl font-bold leading-tight text-slate-900">외도민 타임 라인</h1>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => openSheet({ kind: 'scripts' })} aria-label="멘트함"
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-700 transition-colors hover:bg-slate-50">
                <i className="fas fa-comment-medical text-[15px] text-slate-500" aria-hidden /><span>멘트함</span>
              </button>
              <ThemeToggle />
            </div>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3">
            <p className="text-xs text-slate-500">주money</p>
            {/* 로그아웃은 여기 한 곳뿐(익명일 때 로그인 링크가 있는 자리) */}
            {loggedIn && (
              <button type="button" onClick={() => void signOut({ redirect: true, callbackUrl: '/' })}
                className="-mr-2 inline-flex min-h-9 items-center px-2 text-[13px] font-semibold text-slate-600 hover:underline">로그아웃</button>
            )}
            {status === 'anon' && (loginReady ? (
              <button type="button" onClick={() => void signIn('google', { callbackUrl: '/' })} className="inline-flex min-h-9 items-center text-[13px] font-bold text-blue-700 dark:text-blue-300 underline underline-offset-4">
                로그인
              </button>
            ) : (
              <button type="button" disabled aria-disabled="true" className="inline-flex min-h-9 cursor-not-allowed items-center text-[13px] font-semibold text-slate-400">
                로그인 준비 중
              </button>
            ))}
            {status === 'forbidden' && (
              <button type="button" onClick={() => void signOut({ callbackUrl: '/' })} className="inline-flex min-h-9 items-center gap-x-3 text-[13px] font-bold text-slate-700"><span>허용되지 않은 계정이에요</span><span className="underline underline-offset-4">로그아웃</span></button>
            )}
          </div>

          <div className="relative z-30 mt-2">
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="임대인 설득, 조명 색온도, 구청 실사 등 키워드 검색" aria-label="검색"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 pl-11 pr-4 text-[15px] font-semibold text-slate-900 placeholder-slate-500 transition-colors focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <i className="fas fa-search pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-slate-400" aria-hidden />
            {results && (
              <div className="search-dropdown absolute left-0 top-full z-50 mt-2 w-full">
                {results.length === 0 && <div className="p-4 text-center text-[15px] text-slate-500">검색 결과가 없습니다.</div>}
                {results.map((r, k) => (
                  <button key={k} type="button" className="block w-full border-b border-slate-100 p-4 text-left transition-colors hover:bg-slate-50 active:bg-slate-100" onClick={() => goHit(r)}>
                    <div className="mb-1 flex flex-wrap gap-x-3 text-[12px] font-bold text-slate-500"><span>{r.label}</span>{r.tag && <span>{r.tag}</span>}</div>
                    <div className="line-clamp-2 text-[15px] font-bold text-slate-800">{r.text}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main>
        <div className="chart-wrapper">
          {!loggedIn && <p className="mb-4 max-w-[720px] px-1 text-[15px] leading-relaxed text-slate-600">외도민 등록부터 첫 손님까지 {steps.length}단계예요. 단계를 누르면 할 일과 주의사항이 나와요.</p>}
          <HomeEntries ruleCount={updates.length} warnCount={warnCount} loggedIn={loggedIn}
            onOpenNotice={() => openNotice(null)} onOpenRecords={() => openSheet({ kind: 'records' })} />
          <div className="mb-3 mt-2 flex flex-col items-start gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[17px] font-bold text-slate-900">단계별 일정 (Day 0~45)</h2>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-semibold text-slate-700" aria-label="색 설명">
              {TYPE_ORDER.map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${TYPE_DOT[t]}`} aria-hidden />{TYPE_LABEL[t]}</li>
              ))}
            </ul>
          </div>
          <TimelineChart steps={chartSteps} statuses={statuses} counts={counts} currentId={currentId} onSelect={(i) => openStep(i)} />
        </div>
      </main>

      <StepModal steps={steps} index={sheet?.kind === 'step' ? sheet.index : 0} section={sheet?.kind === 'step' ? sheet.section : null}
        open={sheet?.kind === 'step'} shown={shown} loggedIn={loggedIn} onClose={closeSheet} beforeClose={() => guard('step')} onGo={goStep} />
      <ScriptsModal scripts={scripts} open={sheet?.kind === 'scripts'} shown={shown} onClose={closeSheet} />
      <NoticeModal steps={steps} updates={updates} open={sheet?.kind === 'notice'} initialIndex={sheet?.kind === 'notice' ? sheet.initialIndex : null} shown={shown} onClose={closeSheet} />
      {loggedIn && <RecordsModal open={sheet?.kind === 'records'} shown={shown} onClose={closeSheet} beforeClose={() => guard('records')} />}
    </div>
    </PhotosProvider>
  );
}
