'use client';

import { signOut } from 'next-auth/react';
import type { TaskItem } from '@/lib/core/types';
import { dueLabel, relTime, todayStr } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { PropertyCard } from './PropertyCard';
import { textBtn } from './bits';

type StepRef = { id: number; title: string };

export function Summary({ steps, onOpenStep }: { steps: StepRef[]; onOpenStep: (id: number) => void }) {
  const { doc, me } = useProgress();
  if (!doc) return null;
  const statusOf = (id: number) => doc.steps[String(id)]?.status ?? 'todo';
  const live = Object.values(doc.tasks).filter((t) => !t.deletedAt);
  const doneTasks = live.filter((t) => t.done).length;
  const doneSteps = steps.filter((s) => statusOf(s.id) === 'done').length;
  const pct = steps.length ? Math.round((doneSteps / steps.length) * 100) : 0;
  const today = todayStr();
  const open = live.filter((t) => !t.done).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.stepId - b.stepId || a.createdAt.localeCompare(b.createdAt));
  // 단계를 「완료」로 바꿔도 그 단계의 안 끝난 할 일은 남는다. 요약에선 따로 회색으로 보여 준다.
  const next = open.filter((t) => statusOf(t.stepId) !== 'done').slice(0, 3);
  const leftover = open.filter((t) => statusOf(t.stepId) === 'done');
  // 지금 할 단계: 진행 중인 첫 단계, 없으면 시작 안 한 첫 단계
  const now = steps.find((s) => statusOf(s.id) === 'doing') ?? steps.find((s) => statusOf(s.id) === 'todo');
  const la = doc.lastAction;

  return (
    <div className="mb-6 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2" aria-label="우리 현황 요약">
      <div className="min-w-0 rounded-3xl border border-blue-100 bg-blue-50/50 p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h4 className="text-[14px] font-extrabold text-slate-800 flex items-center gap-2"><i className="fas fa-heart text-blue-600" aria-hidden /> 우리 현황</h4>
          <span className="flex items-center gap-3 text-[13px] font-semibold text-slate-600">{me?.name}<button type="button" className={textBtn} onClick={() => void signOut({ redirect: true, callbackUrl: '/' })}>로그아웃</button></span>
        </div>

        {now ? (
          <button type="button" onClick={() => onOpenStep(now.id)}
            className="w-full min-h-11 mb-4 flex items-center justify-between gap-3 rounded-2xl bg-white border border-blue-200 px-4 py-2.5 text-left hover:border-blue-400">
            <span className="min-w-0 text-[15px] font-bold text-slate-800 break-keep">
              지금: {now.id}단계 {now.title} <span className="text-blue-700">({statusOf(now.id) === 'doing' ? '진행 중' : '시작 전'})</span>
            </span>
            <i className="fas fa-chevron-right text-slate-500 text-[13px] shrink-0" aria-hidden />
          </button>
        ) : (
          <div className="mb-4 rounded-2xl bg-white border border-emerald-200 px-4 py-2.5 text-[15px] font-bold text-emerald-700">모든 단계를 마쳤어요.</div>
        )}

        <div className="flex items-end justify-between text-[13px] font-bold text-slate-600 mb-1.5">
          <span>단계 {doneSteps}/{steps.length} 완료</span><span className="text-blue-700 text-lg font-black">{pct}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-white overflow-hidden border border-blue-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} /></div>
        <div className="mt-1 text-[12px] font-semibold text-slate-500">할 일 {doneTasks}/{live.length} 완료</div>

        {next.length > 0 && (
          <>
            <div className="mt-4 text-[13px] font-bold text-slate-600">다음 할 일</div>
            <ul className="mt-2 space-y-1.5">
              {next.map((t) => <TaskLine key={t.id} t={t} today={today} onOpen={onOpenStep} />)}
            </ul>
          </>
        )}
        {leftover.length > 0 && (
          <>
            <div className="mt-4 text-[13px] font-bold text-slate-500">완료한 단계의 남은 할 일</div>
            <ul className="mt-2 space-y-1.5">
              {leftover.slice(0, 3).map((t) => <TaskLine key={t.id} t={t} today={today} onOpen={onOpenStep} muted />)}
            </ul>
            {leftover.length > 3 && <div className="mt-1 text-[12px] font-semibold text-slate-500">외 {leftover.length - 3}개</div>}
          </>
        )}

        <div className="mt-4 text-[12px] font-semibold text-slate-500" aria-live="polite">
          {la ? (
            <>
              <div>마지막 수정: <b className="text-slate-700">{la.by}</b>가 {relTime(la.at)}</div>
              <div className="mt-0.5 text-slate-600 break-words">{la.text}</div>
            </>
          ) : '아직 수정 내역이 없어요.'}
        </div>
      </div>
      <PropertyCard />
    </div>
  );
}

function TaskLine({ t, today, onOpen, muted }: { t: TaskItem; today: string; onOpen: (id: number) => void; muted?: boolean }) {
  const dl = dueLabel(t.due, today);
  return (
    <li>
      <button type="button" onClick={() => onOpen(t.stepId)}
        className={`w-full min-h-11 text-left rounded-xl px-3 py-2 border hover:border-blue-300 ${muted ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-100'}`}>
        <span className={`block text-[14px] font-bold truncate ${muted ? 'text-slate-500' : 'text-slate-800'}`}>{t.text}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] font-bold text-slate-500">
          <span>{t.stepId}단계</span>
          {dl && <span className={dl.late && !muted ? 'text-red-600' : ''}>{dl.date}</span>}
          {dl && <span className={dl.late && !muted ? 'text-red-600' : ''}>{dl.rel}</span>}
        </span>
      </button>
    </li>
  );
}
