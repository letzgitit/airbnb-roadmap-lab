'use client';

import { signOut } from 'next-auth/react';
import { dueLabel, relTime, todayStr } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { PropertyCard } from './PropertyCard';

export function Summary({ steps, onOpenStep }: { steps: { id: number; title: string }[]; onOpenStep: (id: number) => void }) {
  const { doc, me } = useProgress();
  if (!doc) return null;
  const live = Object.values(doc.tasks).filter((t) => !t.deletedAt);
  const doneTasks = live.filter((t) => t.done).length;
  const doneSteps = steps.filter((s) => doc.steps[String(s.id)]?.status === 'done').length;
  const pct = steps.length ? Math.round((doneSteps / steps.length) * 100) : 0;
  const today = todayStr();
  const next = live.filter((t) => !t.done).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.stepId - b.stepId || a.createdAt.localeCompare(b.createdAt)).slice(0, 3);
  const la = doc.lastAction;

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-2" aria-label="우리 현황 요약">
      <div className="rounded-3xl border border-blue-100 bg-blue-50/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[13px] font-extrabold text-slate-800 flex items-center gap-2"><i className="fas fa-heart text-blue-600" /> 우리 현황</h4>
          <span className="text-[11px] font-bold text-slate-500">{me?.name} <button type="button" className="ml-1 text-blue-600 underline" onClick={() => void signOut({ redirect: true, callbackUrl: '/' })}>로그아웃</button></span>
        </div>
        <div className="flex items-end justify-between text-[12px] font-bold text-slate-600 mb-1.5">
          <span>단계 {doneSteps}/{steps.length} 완료</span><span className="text-blue-700 text-lg font-black">{pct}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-white overflow-hidden border border-blue-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all" style={{ width: `${pct}%` }} /></div>
        <div className="mt-1 text-[11px] font-semibold text-slate-400">할 일 {doneTasks}/{live.length} 완료</div>

        <div className="mt-4 text-[11px] font-black text-slate-400 tracking-widest">다음 할 일</div>
        <ul className="mt-2 space-y-1.5">
          {next.map((t) => {
            const dl = dueLabel(t.due, today);
            return (
              <li key={t.id}>
                <button type="button" onClick={() => onOpenStep(t.stepId)} className="w-full text-left flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 border border-slate-100 hover:border-blue-300">
                  <span className="text-[13px] font-bold text-slate-800 truncate">{t.text}</span>
                  <span className={`shrink-0 text-[11px] font-bold ${dl?.late ? 'text-red-500' : 'text-slate-400'}`}>{dl ? dl.text : `${t.stepId}단계`}</span>
                </button>
              </li>
            );
          })}
          {next.length === 0 && <li className="text-[13px] font-semibold text-slate-300">남은 할 일이 없어요.</li>}
        </ul>
        <div className="mt-3 text-[11px] font-semibold text-slate-400" aria-live="polite">
          {la ? <>마지막 수정: <b className="text-slate-600">{la.by}</b>가 {relTime(la.at)} · {la.text}</> : '아직 수정 내역이 없어요.'}
        </div>
      </div>
      <PropertyCard />
    </div>
  );
}
