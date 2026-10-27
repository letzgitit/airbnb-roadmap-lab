'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ProgressDoc, Step, TaskItem } from '@/lib/core/types';
import { useProgress } from '@/components/progress/ProgressProvider';
import { firstGuest } from '@/components/home/summary-data';
import { FIXED_DAY0, toTimelineSteps } from '@/components/home/timeline-config';
import { textBtn } from '@/components/ui/buttonCls';
import { Card, softCardCls } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { TaskRow } from '@/components/tasks/TaskRow';
import { longDate, treeRows } from '@/components/tasks/task-view';
import { useEditingSet } from '@/components/tasks/useTaskList';
import type { StepRef } from '@/components/tasks/TaskComposer';
import { addMonths, dateParts, dayCellText, dayCounts, dayTasks, monthOf, monthWeeks, type DayCount } from './home-model';

// 요일 순서 일 · 월 · 화 · 수 · 목 · 금 · 토(2026-10-28 사이트 주인 지시 — monthWeeks 도 일요일 시작)
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 달력 탭: 맨 위 「첫 손님까지」 한 줄 카드(예전 홈 첫 손님 카드와 같은 계산) → 한 달 달력 → 고른 날의 할 일.
 * - 처음 열면 이번 달 · 오늘을 고른 채. 오늘 칸 = 검정 동그라미 숫자 + 「오늘」 글자. 고른 날 = 칸 둘레 ink 2px.
 * - 칸에는 그날 마감인 할 일 개수 「할 일 3」(text-xs 12px — 이 사이트에서 14px 아래가 허용되는 유일한 곳), 지난 날에 안 끝난 일이 있으면 빨강,
 *   다 끝냈으면 흐린 「다 함」. 할 일도 오늘도 없는 주는 48px로 낮춘다(390×844 첫 화면에 그날 목록 첫 줄까지 보이게).
 * - 머리: 「2026년 10월」 왼쪽, [오늘] ‹ › 오른쪽.
 * - 어느 날이든 누를 수 있다 → 달력 밑에 그날 마감인 할 일 줄(TaskRow 쉬운 모양 — 체크 · 고치기 · 지우기 · 설명서, 날짜 줄은 머리가 말하므로 숨김)과
 *   「이날 시작」 묶음(그날부터 하는 일). 없으면 「이날 할 일 없음」.
 */
export function CalendarTab({ steps, rowSteps, today }: { steps: Step[]; rowSteps: StepRef[]; today: string }) {
  const { doc } = useProgress();
  const uid = useId();
  const counts = useMemo(() => (doc ? dayCounts(doc) : new Map<string, DayCount>()), [doc]);
  const [month, setMonth] = useState(() => monthOf(today));
  const [picked, setPicked] = useState<string>(today);
  const dayRef = useRef<HTMLDivElement>(null);
  const userPicked = useRef(false);
  // 사람이 날을 고르면 그날 목록이 보이게(처음 열 때는 끌어오지 않는다)
  useEffect(() => {
    if (userPicked.current) dayRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [picked]);
  const tl = useMemo(() => toTimelineSteps(steps), [steps]);
  const guest = useMemo(() => (doc ? firstGuest(tl, doc, today, FIXED_DAY0) : null), [tl, doc, today]);
  if (!doc) return null;

  const thisMonth = monthOf(today);
  const [y, mo] = month.split('-').map(Number);
  const weeks = monthWeeks(month);
  const pick = (d: string) => { userPicked.current = true; setPicked(d); if (monthOf(d) !== month) setMonth(monthOf(d)); };

  return (
    <div className="flex flex-col gap-3 pt-5">
      <GuestLine guest={guest} />

      <Card as="section" aria-label="할 일 달력">
        {/* 머리: 달 이름은 왼쪽, [오늘] ‹ › 는 오른쪽에 모은다(「오늘」은 이번 달 · 오늘을 보고 있으면 없음) */}
        <div className="flex items-center gap-1 border-b border-line pl-5 pr-2">
          <h3 className="min-w-0 flex-1 text-lg font-semibold text-ink" aria-live="polite">{y}년 {mo}월</h3>
          {!(month === thisMonth && picked === today) && (
            <button type="button" className={`${textBtn} mx-0 px-3`} onClick={() => { setMonth(thisMonth); pick(today); }}>오늘</button>
          )}
          <IconButton label="이전 달" icon="fa-chevron-left" onClick={() => setMonth((v) => addMonths(v, -1))} />
          <IconButton label="다음 달" icon="fa-chevron-right" onClick={() => setMonth((v) => addMonths(v, 1))} />
        </div>
        <div className="grid grid-cols-7 border-b border-line" aria-hidden>
          {DOW.map((d) => <span key={d} className="py-1.5 text-center text-sm font-normal text-muted">{d}</span>)}
        </div>
        <div role="group" aria-label={`${mo}월 달력`}>
          {weeks.map((week) => {
            // 할 일도 오늘도 없는 주는 낮게(48px)
            const busy = week.some((d) => d === today || !!dayCellText(counts.get(d), d, today));
            return (
              <div key={week[0]} className="grid grid-cols-7 border-b border-line last:border-b-0">
                {week.map((d, i) => {
                  const inMonth = d.slice(0, 7) === month.slice(0, 7);
                  const isToday = d === today;
                  const on = d === picked;
                  const c = counts.get(d);
                  const cell = dayCellText(c, d, today);
                  const { wd } = dateParts(d);
                  const say = !cell ? '' : cell.tone === 'done' ? ', 할 일 다 함' : `, 할 일 ${c?.open}개${cell.tone === 'late' ? ' 기한 지남' : ''}`;
                  const label = `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일 ${wd}요일${isToday ? ', 오늘' : ''}${say}`;
                  const face = inMonth ? 'hover:bg-sunken' : 'bg-page/50 hover:bg-sunken';
                  const ring = on ? 'after:pointer-events-none after:absolute after:inset-0 after:ring-2 after:ring-inset after:ring-ink' : '';
                  return (
                    <button key={d} type="button" aria-pressed={on} aria-label={label} aria-controls={`${uid}-day`} onClick={() => pick(d)}
                      className={`relative flex ${busy ? 'min-h-14' : 'h-12'} min-w-0 flex-col items-center text-center transition-colors focus-visible:-outline-offset-2 ${i > 0 ? 'border-l border-line' : ''} ${face} ${ring}`}>
                      <span className={`flex items-center justify-center ${busy ? 'h-8 pt-1' : 'h-12'}`}>
                        <span className={`flex size-7 items-center justify-center rounded-full text-sm tabular-nums ${isToday ? 'bg-ink font-bold text-surface' : inMonth ? 'font-semibold text-ink' : 'font-normal text-muted'}`}>
                          {Number(d.slice(8))}
                        </span>
                      </span>
                      {busy && (
                        <span className="flex min-w-0 flex-col items-center px-0.5 pb-1 text-xs" aria-hidden>
                          {isToday && <span className="font-bold text-ink">오늘</span>}
                          {cell && (
                            <span className={`whitespace-nowrap tabular-nums ${cell.tone === 'late' ? 'font-bold text-danger-ink' : cell.tone === 'done' ? 'font-normal text-muted' : 'font-semibold text-ink'}`}>
                              {cell.text}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Card>

      <div id={`${uid}-day`} ref={dayRef} aria-live="polite" className="scroll-mb-20">
        <DayList key={picked} doc={doc} date={picked} steps={rowSteps} />
      </div>
    </div>
  );
}

/** 고른 날 카드: 머리 「10월 28일 (수)」 → 「이날까지 n개」 + 할 일 줄(날짜 줄 숨김 — 머리가 말한다) → 「이날 시작」 묶음 */
function DayList({ doc, date, steps }: { doc: ProgressDoc; date: string; steps: StepRef[] }) {
  const uid = useId();
  const { reportEdit } = useEditingSet();
  const { due, starting } = useMemo(() => dayTasks(doc, date), [doc, date]);
  const rows = (list: TaskItem[], hideDate: boolean) => treeRows(list, doc.tasks).map((r) => (
    <TaskRow key={r.item.id} t={r.item} steps={steps} listStepId={null} scope="page" inset simple depth={r.depth} hideDate={hideDate}
      parentTitle={r.parentTitle} onEditChange={reportEdit} onToggle={() => undefined} onGone={() => undefined} />
  ));
  return (
    <Card as="section" aria-labelledby={`${uid}-h`}>
      {/* 머리 한 줄: 날짜 + 오른쪽 「이날까지 n개」(첫 화면에 첫 할 일 줄까지 들어오게 줄을 아낀다) */}
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <h3 id={`${uid}-h`} className="text-xl font-semibold text-ink">{longDate(date).replace(/\((.)\)$/, ' ($1)')}</h3>
        {due.length > 0 && <span className="text-sm font-semibold text-muted">이날까지 {due.length}개</span>}
      </div>
      {due.length === 0 && starting.length === 0 ? (
        <p className="px-5 pb-5 pt-2 text-base font-normal text-muted">이날 할 일 없음</p>
      ) : (
        <>
          {due.length > 0 && <ul className="px-5 pb-1">{rows(due, true)}</ul>}
          {starting.length > 0 && (
            <>
              <p className={`px-5 text-sm font-semibold text-muted ${due.length ? 'border-t border-line pt-4' : 'pt-1'}`}>이날 시작 {starting.length}개</p>
              <ul className="px-5 pb-1">{rows(starting, false)}</ul>
            </>
          )}
        </>
      )}
    </Card>
  );
}

/** 맨 위 한 줄 옅은 회색 카드(약 52px): 「첫 손님까지」 · 「D-35」 · 오른쪽 「12월 2일(수) 무렵」 */
function GuestLine({ guest }: { guest: ReturnType<typeof firstGuest> | null }) {
  if (!guest?.finish || guest.dday === null) {
    return <p className="text-base font-normal text-muted">단계에 날짜를 넣으면 첫 손님 날을 계산해요.</p>;
  }
  const n = guest.dday;
  return (
    <div className={`${softCardCls} flex items-center justify-between gap-3 px-5 py-3.5`}>
      <p className="flex items-baseline gap-2.5 whitespace-nowrap">
        <span className="text-sm font-semibold text-muted">첫 손님까지</span>
        <span className="text-xl font-bold text-ink tabular-nums">{n > 0 ? `D-${n}` : n === 0 ? '오늘' : `${-n}일 지남`}</span>
      </p>
      <p className="min-w-0 truncate text-base text-ink-soft tabular-nums">{longDate(guest.finish.date)}{guest.finish.estimate ? ' 무렵' : ''}</p>
    </div>
  );
}
