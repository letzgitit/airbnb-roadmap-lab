'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Step } from '@/lib/core/types';
import { useProgress } from '@/components/progress/ProgressProvider';
import { firstGuest } from '@/components/home/summary-data';
import { FIXED_DAY0, toTimelineSteps } from '@/components/home/timeline-config';
import { textBtn } from '@/components/ui/buttonCls';
import { Card, cardRowCls, softCardCls } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { longDate } from '@/components/tasks/task-view';
import { addMonths, calendarMarks, dateParts, monthOf, monthWeeks, startMonth, type CalendarMark, type TabId } from './home-model';

const DOW = ['월', '화', '수', '목', '금', '토', '일'];
/** 칸 하나에 이름을 몇 개까지(나머지는 이름 뒤 「+n」) */
const PER_CELL = 1;

/**
 * 달력 탭: 맨 위 「첫 손님까지」 옅은 회색 카드(예전 홈 첫 손님 카드와 같은 계산) → 한 달 달력.
 * 처음 여는 달 = 이번 달, 이번 달에 마감이 없으면 가장 가까운 마감이 있는 달(startMonth).
 * 칸에는 서류 · 인테리어 · 에어비앤비 카드의 마감 날짜만 — 카드 짧은 이름 하나(칸 폭에 안 들어가면 두 줄까지, 잘라 내지 않음),
 * 더 있으면 「에어컨 +1」. 기한 지남 = 빨강, 다 한 카드 = 흐린 글자.
 * 마감이 있는 날을 누르면 달력 밑에 그날 마감인 카드 목록(화면 안으로 끌어옴) → 누르면 그 탭으로 가서 그 카드를 펼친다(onOpenCard).
 * 오늘 숫자 = 검정 동그라미 면 + 흰 숫자(다크는 반대), 고른 날 = ink 2px 고리.
 */
export function CalendarTab({ steps, today, onOpenCard }: { steps: Step[]; today: string; onOpenCard: (tab: TabId, cardId: string) => void }) {
  const { doc } = useProgress();
  const uid = useId();
  const marks = useMemo(() => (doc ? calendarMarks(doc, today) : []), [doc, today]);
  const [month, setMonth] = useState(() => startMonth(marks, today));
  const [picked, setPicked] = useState<string | null>(null);
  const dayRef = useRef<HTMLDivElement>(null);
  // 날을 고르면 그날 목록이 다 보이게
  useEffect(() => { if (picked) dayRef.current?.scrollIntoView({ block: 'nearest' }); }, [picked]);
  const tl = useMemo(() => toTimelineSteps(steps), [steps]);
  const guest = useMemo(() => (doc ? firstGuest(tl, doc, today, FIXED_DAY0) : null), [tl, doc, today]);
  if (!doc) return null;

  const byDay = new Map<string, CalendarMark[]>();
  for (const m of marks) byDay.set(m.date, [...(byDay.get(m.date) ?? []), m]);
  const thisMonth = monthOf(today);
  const [y, mo] = month.split('-').map(Number);
  const weeks = monthWeeks(month);
  const pickedList = picked ? byDay.get(picked) ?? [] : [];

  return (
    <div className="flex flex-col gap-5 pt-5">
      <GuestLine guest={guest} />

      <Card as="section" aria-label="마감 달력">
        <div className="flex items-center gap-1 border-b border-line px-2">
          <IconButton label="이전 달" icon="fa-chevron-left" onClick={() => setMonth((v) => addMonths(v, -1))} />
          <h3 className="min-w-0 flex-1 text-center text-lg font-semibold text-ink" aria-live="polite">{y}년 {mo}월</h3>
          <IconButton label="다음 달" icon="fa-chevron-right" onClick={() => setMonth((v) => addMonths(v, 1))} />
          <button type="button" className={`${textBtn} mx-0 px-3 ${month === thisMonth ? 'invisible' : ''}`} onClick={() => setMonth(thisMonth)}>오늘</button>
        </div>
        <div className="grid grid-cols-7 border-b border-line" aria-hidden>
          {DOW.map((d) => <span key={d} className="py-1.5 text-center text-sm font-normal text-muted">{d}</span>)}
        </div>
        <div role="group" aria-label={`${mo}월 달력`}>
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 border-b border-line last:border-b-0">
              {week.map((d, i) => {
                const list = byDay.get(d) ?? [];
                const inMonth = d.slice(0, 7) === month.slice(0, 7);
                const isToday = d === today;
                const on = d === picked;
                const { wd } = dateParts(d);
                const label = `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일 ${wd}요일${isToday ? ' 오늘' : ''}`
                  + (list.length ? `, 마감 ${list.map((m) => m.title).join(', ')}` : '');
                const body = (
                  <>
                    <span className="flex h-8 items-center justify-center">
                      <span className={`flex size-7 items-center justify-center rounded-full text-sm tabular-nums ${on ? 'ring-2 ring-inset ring-ink' : ''} ${isToday ? 'bg-ink font-bold text-surface' : inMonth ? 'font-semibold text-ink' : 'font-normal text-muted'}`}>
                        {Number(d.slice(8))}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5 px-0.5 pb-1.5" aria-hidden>
                      {list.slice(0, PER_CELL).map((m) => (
                        <span key={`${m.tab}-${m.cardId}`}
                          className={`line-clamp-2 block break-keep text-[12px] leading-tight ${m.late ? 'font-bold text-danger-ink' : m.finished ? 'font-normal text-muted line-through' : 'font-semibold text-ink'}`}>
                          {m.short}
                          {list.length > PER_CELL && <span className="whitespace-nowrap font-normal text-muted no-underline"> +{list.length - PER_CELL}</span>}
                        </span>
                      ))}
                    </span>
                  </>
                );
                const cls = `flex min-h-16 min-w-0 flex-col text-left ${i > 0 ? 'border-l border-line' : ''} ${inMonth ? '' : 'bg-page/50'}`;
                // 마감이 있는 날만 누를 수 있다
                return list.length > 0
                  ? <button key={d} type="button" aria-pressed={on} aria-label={label} aria-controls={`${uid}-day`} onClick={() => setPicked(on ? null : d)}
                      className={`${cls} transition-colors hover:bg-sunken focus-visible:-outline-offset-2`}>{body}</button>
                  : <div key={d} className={cls}><span className="sr-only">{label}</span>{body}</div>;
              })}
            </div>
          ))}
        </div>
      </Card>

      <div id={`${uid}-day`} ref={dayRef} aria-live="polite" className="scroll-mb-20">
        {picked ? (
          <Card as="section" aria-labelledby={`${uid}-dh`}>
            <h3 id={`${uid}-dh`} className="px-4 pt-3 pb-2 text-base font-bold text-ink">
              {Number(picked.slice(5, 7))}월 {Number(picked.slice(8))}일 ({dateParts(picked).wd}) 마감
            </h3>
            <ul className="border-t border-line">
              {pickedList.map((m) => (
                <li key={`${m.tab}-${m.cardId}`} className={cardRowCls}>
                  <button type="button" onClick={() => onOpenCard(m.tab, m.cardId)}
                    className="flex min-h-14 w-full items-center gap-3 py-3 pl-4 pr-2 text-left transition-colors hover:bg-sunken focus-visible:-outline-offset-2">
                    <span className="min-w-0 flex-1">
                      <span className={`block text-base font-semibold ${m.finished ? 'text-muted line-through' : 'text-ink'}`}>{m.title}</span>
                      <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm font-normal text-muted">
                        <span>{m.tabLabel}</span>
                        {m.late && <span className="font-bold text-danger-ink">기한 지남</span>}
                        {m.finished && <span>다 했어요</span>}
                      </span>
                    </span>
                    <span className="flex size-11 shrink-0 items-center justify-center text-muted" aria-hidden><i className="fas fa-chevron-right text-sm" /></span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-sm font-normal text-muted">글자가 적힌 날을 누르면 그날까지 할 일이 나와요.</p>
        )}
      </div>
    </div>
  );
}

/**
 * 맨 위 옅은 회색 카드(시안 B 「가장 급한 일」과 같은 면): 「첫 손님까지」 · 큰 「D-35」 · 「12월 2일(수) 무렵」.
 */
function GuestLine({ guest }: { guest: ReturnType<typeof firstGuest> | null }) {
  if (!guest?.finish || guest.dday === null) {
    return <p className="text-base font-normal text-muted">단계에 날짜를 넣으면 첫 손님 날을 계산해요.</p>;
  }
  const n = guest.dday;
  return (
    <div className={`${softCardCls} flex flex-wrap items-end justify-between gap-x-3 px-5 py-4.5`}>
      <p>
        <span className="block text-sm font-semibold text-muted">첫 손님까지</span>
        <span className="mt-1 block text-display font-bold tracking-[-0.015em] text-ink tabular-nums">{n > 0 ? `D-${n}` : n === 0 ? '오늘' : `${-n}일 지남`}</span>
      </p>
      <p className="pb-1 text-base text-ink-soft tabular-nums">{longDate(guest.finish.date)}{guest.finish.estimate ? ' 무렵' : ''}</p>
    </div>
  );
}
