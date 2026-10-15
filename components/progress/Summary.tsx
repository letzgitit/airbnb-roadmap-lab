'use client';

import { signOut } from 'next-auth/react';
import type { TaskItem } from '@/lib/core/types';
import { dueLabel, relTime, todayStr } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { textBtn, useBusy } from './bits';

type StepRef = { id: number; title: string };

// 홈의 「우리 현황」: 지금 단계 · 다음 할 일 3개 · 마지막 수정 한 줄 · 집 정보/기록 입구. 그 밖은 창 안으로.
export function Summary({ steps, onOpenStep, onOpenRecords }: {
  steps: StepRef[]; onOpenStep: (id: number) => void; onOpenRecords: () => void;
}) {
  const { doc, me } = useProgress();
  if (!doc) return null;
  const statusOf = (id: number) => doc.steps[String(id)]?.status ?? 'todo';
  const live = Object.values(doc.tasks).filter((t) => !t.deletedAt);
  const today = todayStr();
  const open = live.filter((t) => !t.done).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.stepId - b.stepId || a.createdAt.localeCompare(b.createdAt));
  // 단계를 「완료」로 바꿔도 그 단계의 안 끝난 할 일은 남지만, 홈에는 진행 중인 단계의 것만 올린다
  const next = open.filter((t) => statusOf(t.stepId) !== 'done').slice(0, 3);
  // 지금 할 단계: 진행 중인 첫 단계, 없으면 시작 안 한 첫 단계
  const now = steps.find((s) => statusOf(s.id) === 'doing') ?? steps.find((s) => statusOf(s.id) === 'todo');
  const la = doc.lastAction;
  const lastLine = la ? `마지막 수정 · ${la.by} · ${relTime(la.at)} — ${la.text}` : '';

  return (
    <section className="mb-6 min-w-0 rounded-3xl border border-blue-100 bg-blue-50/50 p-4" aria-label="우리 현황 요약">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-[14px] font-extrabold text-slate-800 flex items-center gap-2"><i className="fas fa-heart text-blue-600" aria-hidden /> 우리 현황</h4>
        <span className="flex items-center gap-3 text-[13px] font-semibold text-slate-600">{me?.name}<button type="button" className={textBtn} onClick={() => void signOut({ redirect: true, callbackUrl: '/' })}>로그아웃</button></span>
      </div>

      {now ? (
        <button type="button" onClick={() => onOpenStep(now.id)}
          className="w-full min-h-11 flex items-center justify-between gap-3 rounded-2xl bg-white border border-blue-200 px-4 py-2.5 text-left hover:border-blue-400">
          <span className="min-w-0 text-[15px] font-bold text-slate-800 break-keep">
            지금: {now.id}단계 {now.title} <span className="text-blue-700">({statusOf(now.id) === 'doing' ? '진행 중' : '시작 전'})</span>
          </span>
          <i className="fas fa-chevron-right text-slate-500 text-[13px] shrink-0" aria-hidden />
        </button>
      ) : (
        <div className="rounded-2xl bg-white border border-emerald-200 px-4 py-2.5 text-[15px] font-bold text-emerald-700">모든 단계를 마쳤어요.</div>
      )}

      {next.length > 0 && (
        <>
          <div className="mt-4 text-[13px] font-bold text-slate-600">다음 할 일</div>
          <ul className="mt-2 space-y-1.5">
            {next.map((t) => <TaskLine key={t.id} t={t} today={today} onOpen={onOpenStep} />)}
          </ul>
        </>
      )}

      <div className="mt-4 truncate text-[12px] font-semibold text-slate-500" aria-live="polite" title={lastLine || undefined}>
        {la ? (
          <>마지막 수정 · <b className="text-slate-700">{la.by}</b> · {relTime(la.at)} — {la.text}</>
        ) : '아직 수정 내역이 없어요.'}
      </div>

      <button type="button" onClick={onOpenRecords}
        className="mt-3 w-full min-h-11 flex items-center justify-between gap-3 rounded-2xl bg-white/60 border border-blue-100 px-4 py-2 text-left text-[14px] font-bold text-slate-700 hover:bg-white hover:border-blue-300">
        <span className="flex items-center gap-2"><i className="fas fa-folder-open text-slate-500" aria-hidden />집 정보 · 기록</span>
        <i className="fas fa-chevron-right text-slate-500 text-[13px] shrink-0" aria-hidden />
      </button>
    </section>
  );
}

// 다음 할 일 한 줄: 왼쪽 동그라미 = 끝냈어요(되돌리기 알림 8초), 오른쪽 글 = 그 단계 열기
function TaskLine({ t, today, onOpen }: { t: TaskItem; today: string; onOpen: (id: number) => void }) {
  const { send, toast } = useProgress();
  const { busy, run } = useBusy();
  const dl = dueLabel(t.due, today);
  const finish = () => run(async () => {
    const r = await send({ op: 'task.update', id: t.id, patch: { done: true } });
    if (r.ok) toast('할 일을 끝냈어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'task.update', id: t.id, patch: { done: false } }) } });
  });
  return (
    <li className="flex items-center rounded-xl border border-slate-100 bg-white">
      <button type="button" disabled={busy} aria-label={`${t.text} 완료`} onClick={() => void finish()}
        className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl text-slate-400 hover:text-emerald-600 disabled:opacity-50">
        <i className="far fa-circle text-[22px]" aria-hidden />
      </button>
      <button type="button" onClick={() => onOpen(t.stepId)} className="min-w-0 flex-1 min-h-11 py-2 pr-3 text-left rounded-r-xl hover:bg-slate-50">
        <span className="block text-[14px] font-bold truncate text-slate-800">{t.text}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] font-bold text-slate-500">
          <span>{t.stepId}단계</span>
          {dl && <span className={dl.late ? 'text-red-600' : ''}>{dl.date}</span>}
          {dl && <span className={dl.late ? 'text-red-600' : ''}>{dl.rel}</span>}
        </span>
      </button>
    </li>
  );
}
