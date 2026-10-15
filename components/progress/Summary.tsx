'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import type { TaskItem } from '@/lib/core/types';
import { dueLabel, todayStr } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { useBusy } from './bits';

type StepRef = { id: number; title: string };

const STAY_MS = 8000;  // 되돌리기 알림이 떠 있는 동안 = 방금 끝낸 줄을 제자리에 두는 시간
const GUARD_MS = 700;  // 빠른 두 번 탭이 곧바로 「되돌리기」가 되지 않게 막는 시간

// 홈의 「우리 현황」: 지금 단계 · 다음 할 일 3개 · 집 정보/기록 입구. 마지막 수정 줄은 「집 정보 · 기록」 창의 기록 탭 맨 위에 있다.
export function Summary({ steps, onOpenStep, onOpenRecords }: {
  steps: StepRef[]; onOpenStep: (id: number) => void; onOpenRecords: () => void;
}) {
  const { doc } = useProgress();
  // 방금 끝낸 할 일(id → 끝낸 시각). 이 줄은 알림 시간 동안 사라지지 않고 체크된 채 제자리에 남는다
  // (사라지면 다음 줄이 손가락 밑으로 올라와 빠른 두 번 탭이 할 일 두 개를 끝내 버린다).
  const [recent, setRecent] = useState<Record<string, number>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const m = timers.current;
    return () => { m.forEach((t) => clearTimeout(t)); m.clear(); };
  }, []);
  const unmark = useCallback((id: string) => {
    const old = timers.current.get(id);
    if (old) { clearTimeout(old); timers.current.delete(id); }
    setRecent((r) => { if (!(id in r)) return r; const n = { ...r }; delete n[id]; return n; });
  }, []);
  const mark = useCallback((id: string) => {
    setRecent((r) => ({ ...r, [id]: Date.now() }));
    const old = timers.current.get(id);
    if (old) clearTimeout(old);
    timers.current.set(id, setTimeout(() => { timers.current.delete(id); unmark(id); }, STAY_MS));
  }, [unmark]);

  if (!doc) return null;
  const statusOf = (id: number) => doc.steps[String(id)]?.status ?? 'todo';
  const live = Object.values(doc.tasks).filter((t) => !t.deletedAt);
  const today = todayStr();
  // 안 끝난 할 일 + 방금 끝낸 할 일, 기존 정렬 그대로(끝냈다고 자리가 바뀌지 않는다)
  const pool = live.filter((t) => !t.done || t.id in recent)
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.stepId - b.stepId || a.createdAt.localeCompare(b.createdAt));
  // 단계를 「완료」로 바꿔도 그 단계의 안 끝난 할 일은 남지만, 홈에는 진행 중인 단계의 것만 올린다
  const next = pool.filter((t) => statusOf(t.stepId) !== 'done').slice(0, 3);
  // 지금 할 단계: 진행 중인 첫 단계, 없으면 시작 안 한 첫 단계
  const now = steps.find((s) => statusOf(s.id) === 'doing') ?? steps.find((s) => statusOf(s.id) === 'todo');

  return (
    // 넓은 화면에선 한 줄이 너무 길어지지 않게 720px 까지만(타임라인 왼쪽 끝에 맞춰 왼쪽 정렬)
    <section className="mb-4 min-w-0 max-w-[720px] rounded-2xl border border-slate-200 bg-white p-4" aria-label="우리 현황 요약">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-extrabold text-slate-900">우리 현황</h2>
        <button type="button" className="-mx-2 inline-flex min-h-11 items-center px-2 text-[13px] font-semibold text-slate-600 hover:underline"
          onClick={() => void signOut({ redirect: true, callbackUrl: '/' })}>로그아웃</button>
      </div>

      {now ? (
        <button type="button" onClick={() => onOpenStep(now.id)}
          className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-blue-200 bg-[#EFF6FF] px-4 py-2.5 text-left hover:border-blue-400">
          <span className="min-w-0">
            <span className="block text-[12px] font-bold text-blue-700">{statusOf(now.id) === 'doing' ? '지금 하는 단계' : '다음 단계'} · {now.id}/{steps.length}</span>
            <span className="block text-[16px] font-bold text-slate-800">{now.title}</span>
          </span>
          <i className="fas fa-chevron-right shrink-0 text-[13px] text-slate-500" aria-hidden />
        </button>
      ) : (
        <div className="rounded-xl border border-slate-200 px-4 py-2.5 text-[15px] font-bold text-slate-800">모든 단계를 마쳤어요.</div>
      )}

      {next.length > 0 && (
        <>
          <div className="mt-4 text-[13px] font-bold text-slate-500">다음 할 일</div>
          <ul className="mt-1">
            {next.map((t) => <TaskLine key={t.id} t={t} today={today} onOpen={onOpenStep} finishedAt={recent[t.id]} onMark={mark} onUnmark={unmark} />)}
          </ul>
        </>
      )}

      <button type="button" onClick={onOpenRecords}
        className="mt-4 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-left text-[15px] font-bold text-slate-700 hover:bg-slate-50">
        <span className="flex items-center gap-2"><i className="fas fa-folder-open text-slate-500" aria-hidden />집 정보 · 기록</span>
        <i className="fas fa-chevron-right shrink-0 text-[13px] text-slate-500" aria-hidden />
      </button>
    </section>
  );
}

// 다음 할 일 한 줄: 왼쪽 동그라미 = 끝냈어요(체크된 채 8초 남고, 그동안 다시 누르면 되돌림), 오른쪽 글 = 그 단계 열기
function TaskLine({ t, today, onOpen, finishedAt, onMark, onUnmark }: {
  t: TaskItem; today: string; onOpen: (id: number) => void;
  finishedAt: number | undefined; onMark: (id: string) => void; onUnmark: (id: string) => void;
}) {
  const { send, toast } = useProgress();
  const { busy, run } = useBusy();
  const dl = dueLabel(t.due, today);
  const justDone = t.done && finishedAt !== undefined;
  const undo = () => {
    onUnmark(t.id);
    void send({ op: 'task.update', id: t.id, patch: { done: false } });
  };
  const finish = () => run(async () => {
    onMark(t.id); // 보내기 전에 표시해 두어야 낙관적 갱신이 이 줄을 지우지 못한다
    const r = await send({ op: 'task.update', id: t.id, patch: { done: true } });
    if (r.ok) toast('할 일을 끝냈어요.', { ms: STAY_MS, action: { label: '되돌리기', run: undo } });
    else onUnmark(t.id);
  });
  return (
    <li className="flex items-start border-b border-slate-100 last:border-b-0">
      <button type="button" disabled={busy} aria-label={`${t.text} 완료`} aria-pressed={justDone}
        onClick={() => {
          if (justDone) {
            if (Date.now() - (finishedAt as number) < GUARD_MS) return;
            undo();
          } else void finish();
        }}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-50 ${justDone ? 'text-emerald-600' : 'text-slate-400 hover:text-emerald-600'}`}>
        {justDone ? <i className="fas fa-circle-check text-[22px]" aria-hidden /> : <i className="far fa-circle text-[22px]" aria-hidden />}
      </button>
      <button type="button" onClick={() => onOpen(t.stepId)} className="min-h-11 min-w-0 flex-1 py-2.5 pr-1 text-left">
        <span className={`line-clamp-2 text-[15px] font-bold leading-snug ${justDone ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{t.text}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] font-semibold text-slate-500">
          <span>{t.stepId}단계</span>
          {dl && <span className={dl.late && !justDone ? 'text-red-600' : ''}>{dl.date}</span>}
          {dl && <span className={dl.late && !justDone ? 'text-red-600' : ''}>{dl.rel}</span>}
        </span>
      </button>
    </li>
  );
}
