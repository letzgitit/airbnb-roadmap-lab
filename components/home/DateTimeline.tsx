'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { TASK_KINDS, type TaskItem, type TaskKind } from '@/lib/core/types';
import { shortDate, todayStr } from '@/lib/client/format';
import { useProgress } from '@/components/progress/ProgressProvider';
import { TrashCard } from '@/components/progress/TrashCard';
import { AddButton } from '@/components/ui/AddButton';
import { dateCls, textBtn } from '@/components/ui/buttonCls';
import { Card, cardRowCls } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { IconButton } from '@/components/ui/IconButton';
import { Segmented } from '@/components/ui/Segmented';
import { TYPE_COLOR } from '@/components/TimelineChart';
import { TaskComposer, type StepRef, type TaskWithNote } from '@/components/tasks/TaskComposer';
import { TaskRow } from '@/components/tasks/TaskRow';
import { useEditingSet, useStickyDone } from '@/components/tasks/useTaskList';
import { ShiftDates } from './ShiftDates';
import { addDays, diffDays, mondayOf, stepRanges, toDate, type TimelineStep } from './step-dates';

export type { TimelineStep } from './step-dates';

// 홈 「단계」의 로그인 화면. 로그인 전 단계 막대(TimelineChart)와 같은 모양에서 「n일째」 자리만 실제 날짜로 바꿨다.
//
// ┌ 단계 상자(가로 스크롤 없음: 전체 기간이 상자 폭 안에 들어간다. 배율 = 막대 폭 / 전체 날수) ──────
// │ 「고정 일정」 줄(한 줄, 넘치면 가로로 밀림): 핀 + 날짜 · 이름 글자 단추(누르면 그 날을 고른다)
// │ 날짜 축: 윗줄 월요일 실제 날짜 눈금(「10/13」 「10/27」 …, 글자가 안 겹치게 몇 주 간격인지 폭에 맞춰 고름, 마지막 눈금은 늘 — 끝에 붙으면 오른쪽 맞춤),
// │   아랫줄 고정 일정 핀 + 「오늘」(핀과 겹치면 윗줄). 끝난 단계를 접어 두면 축은 보이는 것부터 시작한다(펼치면 전체).
// │ 「끝난 단계 n개」(접음)
// │ 단계 줄(TimelineChart 와 같은 모양): 제목(+ 「지금」 · 완료 체크) / 보조 줄 실제 기간 「10/13~11/3」 / 막대
// │   막대 칸 안에만: 오늘 = 강조색 세로 표시, 고정 일정 = ink-soft 가는 세로 표시, 고른 주 = 막대 칸 뒤 옅은 ink 띠(18px, 아래 7일 줄과 같은 주).
// │   막대 최소 폭 14px. 줄을 누르면 단계 창(로그인 전과 같은 창).
// │ 맨 아래 단계 종류 범례(legend)
// └──────────────────────────────────────────────
// ┌ 7일 줄 상자 ─ 「10/26~11/1」 + 주 넘기기(‹ ›) / 고른 주의 7일(폰 7칸 × 48px, PC 는 상자 폭을 채우되 칸 최대 96px): 요일 · 날짜 동그라미 · 그 아래 그날 마감 할 일 개수
// │   (0 이면 빈 칸, 기한 지난 게 있으면 빨강). 고른 날 = ink 2px 테두리 + 굵은 글자, 오늘 = 「오늘」 + 강조색 글자.
// └──────────────────────────────────────────────
// ┌ 고른 날 목록 ─ 「10/27 (화) 오늘」 · 「일정 옮기기」 / 담당 · 종류 걸러 보기
// │ ＋ 할 일 추가(마감일 = 고른 날) / 「기한 지남」(어느 날을 골라도 늘 맨 위) / 단계 머리 + 그날 마감 할 일(단계 번호 순,
// │ 그날 기간이 겹치는 단계는 할 일이 없어도 머리가 보인다. 머리를 누르면 단계 창) / 「날짜 없음 n개」(접음, 늘 맨 아래)
// └ 맨 아래 「삭제한 할 일」
// 할 일 줄은 단계 창 「우리 할 일」과 같은 TaskRow(체크 · 고치기 · 지우기). 할 일을 다루는 길은 여기와 단계 창이고 같은 줄을 쓴다.
// 단계 기간 계산은 step-dates.ts. 고정 일정 = 현황 집 정보 중 이름이 「고정 · 」으로 시작하고 값이 YYYY-MM-DD 로 시작하는 줄(+ marks).
// 실제 날짜는 로그인 뒤 /api/progress 로 받은 현황에서만 계산한다(공개 HTML 에는 없다).

const MIN_BAR = 14; // 막대 최소 폭(px)
const TICK_GAP = 56; // 날짜 눈금 글자 사이 최소 간격(px)
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const PIN_PREFIX = /^고정\s*·\s*/;
const colorOf = (type: string) => (TYPE_COLOR as Record<string, string>)[type] ?? 'var(--prep-bar)';
const byDue = (a: TaskItem, b: TaskItem) =>
  (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.stepId - b.stepId || a.createdAt.localeCompare(b.createdAt);
type OwnerFilter = '' | '남편' | '아내';

export function DateTimeline({ steps, currentId, onStep, fixedDay0, marks = [], legend }: {
  steps: TimelineStep[];
  /** 단계 종류 범례(막대 아래, 상자 안 맨 끝) */
  legend?: ReactNode;
  currentId: number | null;
  /** 단계 창 열기(steps 배열의 순번) */
  onStep: (index: number) => void;
  /** 콘텐츠의 날수가 이미 정해진 날에서 센 값이면 그 날(예: 지산 2026-09-01) */
  fixedDay0?: string;
  /** 고정 일정에 더할 표시(예: 지산 만기) */
  marks?: { date: string; label: string }[];
}) {
  const { doc } = useProgress();
  const uid = useId();
  const { editing, reportEdit } = useEditingSet();
  const { isDone, onToggle } = useStickyDone();
  const [today] = useState(todayStr);
  const [picked, setPicked] = useState<string | null>(null);
  const [kindF, setKindF] = useState<TaskKind | ''>('');
  const [ownerF, setOwnerF] = useState<OwnerFilter>('');
  const [composing, setComposing] = useState(false);
  const [shifting, setShifting] = useState(false);
  const [showNoDate, setShowNoDate] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const axisRef = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useCallback(() => { window.requestAnimationFrame(() => headingRef.current?.focus()); }, []);

  const hasDoc = !!doc;
  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; }, [doc]);
  const getDoc = useCallback(() => docRef.current, []);
  // 막대 칸 폭(날짜 눈금 간격을 고르는 데만 쓴다)
  useLayoutEffect(() => {
    const el = axisRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasDoc]);

  const tasks = (doc ? Object.values(doc.tasks).filter((t) => !t.deletedAt || editing.has(t.id)) : []) as TaskWithNote[];
  const ranges = doc ? stepRanges(steps, doc, today, fixedDay0) : [];

  // 고정 일정 핀
  const pins = [
    ...marks,
    ...(doc ? Object.values(doc.property) : [])
      .filter((p) => !p.deletedAt && PIN_PREFIX.test(p.label))
      .map((p) => { const m = p.value.match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/); return m ? { date: m[1], label: m[2] || p.label.replace(PIN_PREFIX, '') } : null; })
      .filter((p): p is { date: string; label: string } => !!p),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const pinsOn = (d: string) => pins.filter((p) => p.date === d);

  // 전체 기간: 단계 기간 · 할 일 마감 · 고정 일정 · 오늘을 모두 담는다(월요일 ~ 일요일로 맞춤)
  const dues = tasks.map((t) => t.due).filter((d): d is string => !!d);
  const bounds = [...ranges.flatMap((r) => [r.from, r.to]), ...dues, ...pins.map((p) => p.date), today].sort();
  // 끝난 단계를 접어 두면 축은 보이는 것(안 끝난 단계 · 오늘 · 고정 일정 · 안 끝난 할 일 마감)부터 시작한다. 펼치면 전체
  const startSrc = showDone ? bounds : [
    ...ranges.filter((r) => !r.done).map((r) => r.from), today, ...pins.map((p) => p.date),
    ...tasks.filter((t) => !t.done && t.due).map((t) => t.due!),
  ].sort();
  const first = mondayOf(startSrc[0]);
  const last = addDays(mondayOf(bounds[bounds.length - 1]), 6);
  const total = diffDays(first, last) + 1;
  const pct = (iso: string) => `${(diffDays(first, iso) / total) * 100}%`;
  /** 그날 칸의 가운데(세로 표시 자리) */
  const mid = (iso: string) => `${((diffDays(first, iso) + 0.5) / total) * 100}%`;
  const spanPct = (from: string, to: string) => `${((diffDays(from, to) + 1) / total) * 100}%`;
  // 처음 고른 날 = 오늘(범위 밖이면 가장 가까운 끝 날)
  const sel = picked ?? (today < first ? first : today > last ? last : today);
  const selWeek = mondayOf(sel);

  if (!doc) return null;

  const pick = (d: string) => { setPicked(d); setComposing(false); setShifting(false); };
  const moveWeek = (n: number) => { const m = addDays(selWeek, n * 7); pick(mondayOf(today) === m ? today : m); };

  // 날짜 눈금: 월요일마다, 글자가 겹치지 않게 k주 간격
  const weekPx = trackW ? (trackW * 7) / total : 0;
  const every = weekPx ? Math.max(1, Math.ceil(TICK_GAP / weekPx)) : 2;
  const ticks: string[] = [];
  for (let m = first; m <= last; m = addDays(m, 7 * every)) ticks.push(m);
  const tickPx = (m: string) => (diffDays(first, m) / total) * trackW;
  // 마지막 눈금은 늘 그린다: 오른쪽 끝 36px 안이면 글자를 눈금 왼쪽으로(오른쪽 맞춤). 그러면 바로 앞 눈금과 붙으면 앞 것을 뺀다
  const lastTick = ticks[ticks.length - 1];
  const lastRight = !!trackW && !!lastTick && tickPx(lastTick) > trackW - 36;
  if (lastRight && ticks.length > 1 && tickPx(lastTick) - tickPx(ticks[ticks.length - 2]) < TICK_GAP * 2) ticks.splice(ticks.length - 2, 1);
  // 「오늘」 글자: 축 아랫줄, 핀과 겹치면 윗줄
  const todayUp = !!trackW && pins.some((p) => Math.abs(diffDays(today, p.date)) / total * trackW < 28);

  const open = tasks.filter((t) => !isDone(t));
  const dueCount = new Map<string, { n: number; late: boolean }>();
  tasks.forEach((t) => {
    if (!t.due) return;
    const c = dueCount.get(t.due) ?? { n: 0, late: false };
    c.n += 1;
    if (!isDone(t) && t.due < today) c.late = true;
    dueCount.set(t.due, c);
  });

  // 고른 날 목록(걸러 보기: 종류 · 담당. 「같이」는 남편 · 아내 둘 다에 보인다)
  const pass = (t: TaskWithNote) => (!kindF || t.kind === kindF) && (!ownerF || t.owner === ownerF || t.owner === '같이');
  const filtered = !!kindF || !!ownerF;
  const late = open.filter((t) => t.due && t.due < today && pass(t)).sort(byDue);
  const lateIds = new Set(late.map((t) => t.id));
  const onDay = tasks.filter((t) => t.due === sel && !lateIds.has(t.id) && pass(t)).sort(byDue);
  const active = ranges.filter((r) => r.from <= sel && sel <= r.to).map((r) => r.id);
  const groupIds = [...new Set([...active, ...onDay.map((t) => t.stepId)])].sort((a, b) => a - b)
    .filter((id) => !filtered || onDay.some((t) => t.stepId === id));
  const noDate = open.filter((t) => !t.due && pass(t)).sort(byDue);
  const noDateOpen = showNoDate || noDate.some((t) => editing.has(t.id));
  const kindCount = new Map<TaskKind, number>();
  tasks.forEach((t) => { if (t.kind) kindCount.set(t.kind, (kindCount.get(t.kind) ?? 0) + 1); });

  const stepRefs: StepRef[] = steps.map((s) => ({ id: s.id, title: s.title }));
  const indexOf = (id: number) => steps.findIndex((s) => s.id === id);
  const titleOf = (id: number) => steps.find((s) => s.id === id)?.title ?? '';
  const typeOf = (id: number) => steps.find((s) => s.id === id)?.type ?? '';
  const row = (t: TaskItem, showStep = false) => (
    <TaskRow key={t.id} t={t} steps={stepRefs} listStepId={null} showStep={showStep} scope="page" inset
      quietLate={lateIds.has(t.id)} onEditChange={reportEdit} onToggle={onToggle} onGone={focusHeading} />
  );
  const selDate = toDate(sel);
  const gap = diffDays(today, sel);
  const rel = gap === 0 ? '오늘' : gap > 0 ? `D-${gap}` : `${-gap}일 전`;
  const defaultStep = groupIds[0] ?? currentId ?? steps[0]?.id ?? 1;
  const doneRanges = ranges.filter((r) => r.done);
  const shownRanges = ranges.filter((r) => !r.done || showDone);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(selWeek, i));

  const selWeekEnd = addDays(selWeek, 6);
  // 막대 칸 안의 표시: 고정 일정 · 오늘(막대 위). 고른 주 띠는 막대 칸 뒤에 따로(막대 색을 바꾸지 않게). 이름 · 보조 줄에는 닿지 않는다
  const trackMarks = (
    <>
      {pins.map((p) => <span key={`t${p.date}${p.label}`} className="absolute -inset-y-1 block w-px bg-ink-soft" style={{ left: mid(p.date) }} />)}
      <span className="absolute -inset-y-1 block w-0.5 -translate-x-1/2 rounded-full bg-accent-ink" style={{ left: mid(today), outline: '1px solid var(--color-surface)' }} />
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Card>
          {pins.length > 0 && (
            <div className="flex items-center gap-x-4 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="고정 일정">
              <span className="shrink-0 whitespace-nowrap text-sm font-normal text-ink-soft"><i className="fas fa-thumbtack mr-1.5" aria-hidden />고정 일정</span>
              {pins.map((p) => (
                <button key={`${p.date}${p.label}`} type="button" onClick={() => pick(p.date)}
                  className="inline-flex min-h-11 shrink-0 items-center gap-x-1.5 whitespace-nowrap text-sm text-ink-soft hover:underline">
                  <span className="font-bold">{shortDate(p.date)}</span><span className="font-normal">{p.label}</span>
                </button>
              ))}
            </div>
          )}
          {/* 날짜 축: 막대 칸과 같은 폭(좌우 16px 안쪽) */}
          <div className="border-b border-line px-4 pt-2 pb-1" aria-hidden>
            <div ref={axisRef} className="relative h-8">
              {ticks.map((m) => (
                m === lastTick && lastRight
                  ? <span key={m} className="absolute top-0 -translate-x-full whitespace-nowrap text-xs font-normal tabular-nums text-muted" style={{ left: pct(m) }}>
                      {shortDate(m)}<span className="ml-1 inline-block h-2 w-px bg-line-strong align-top" />
                    </span>
                  : <span key={m} className="absolute top-0 whitespace-nowrap text-xs font-normal tabular-nums text-muted" style={{ left: pct(m) }}>
                      <span className="mr-1 inline-block h-2 w-px bg-line-strong align-top" />{shortDate(m)}
                    </span>
              ))}
              <span className={`absolute -translate-x-1/2 whitespace-nowrap text-xs font-bold text-accent-ink ${todayUp ? 'top-0' : 'bottom-0'}`} style={{ left: mid(today) }}>오늘</span>
              {pins.map((p) => (
                <i key={`p${p.date}${p.label}`} className="fas fa-thumbtack absolute bottom-0 -translate-x-1/2 text-xs text-ink-soft" style={{ left: mid(p.date) }} />
              ))}
            </div>
          </div>
          <ol aria-label="단계별 기간">
            {doneRanges.length > 0 && (
              <li className={cardRowCls}>
                <FoldRow label="끝난 단계" count={doneRanges.length} open={showDone} onToggle={() => setShowDone((v) => !v)} />
              </li>
            )}
            {shownRanges.map((r) => {
              const cur = currentId === r.id;
              const title = cur ? 'font-bold text-ink' : r.done ? 'font-semibold text-muted' : 'font-semibold text-ink';
              return (
                <li key={r.id} className={cardRowCls}>
                  <button type="button" onClick={() => onStep(steps.findIndex((s) => s.id === r.id))} aria-current={cur ? 'step' : undefined}
                    className={`block min-h-11 w-full px-4 py-3 text-left transition-colors ${cur ? 'bg-accent-soft' : 'hover:bg-sunken active:bg-sunken'}`}>
                    <span className="flex items-start gap-3">
                      <span className={`min-w-0 flex-1 text-base ${title}`}>{r.id}. {r.title}</span>
                      {cur
                        ? <span className="shrink-0 text-sm font-bold text-accent-ink">지금</span>
                        : r.done
                          ? <span className="shrink-0 text-sm text-muted"><i className="fas fa-check" aria-hidden /><span className="sr-only">완료</span></span>
                          : null}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm font-normal text-muted">
                      <span className="text-ink-soft tabular-nums">{shortDate(r.from)}~{shortDate(r.to)}</span>
                    </span>
                    {/* 막대 칸: 막대 + 고른 주 띠 · 고정 일정 · 오늘 표시(이 칸 안에서만) */}
                    <span className="relative mt-2 block h-1.5 w-full" aria-hidden>
                      {/* 고른 주 = 막대 칸 뒤의 옅은 ink 띠(18px). 막대 칸은 불투명이라 막대 색은 그대로 */}
                      <span className="absolute -inset-y-1.5 block bg-ink/6" style={{ left: pct(selWeek), width: spanPct(selWeek, selWeekEnd) }} />
                      <span className="absolute inset-0 block overflow-hidden rounded-full bg-sunken">
                        <span className="absolute inset-y-0 block rounded-full"
                          style={{ left: pct(r.from), width: `max(${MIN_BAR}px, ${spanPct(r.from, r.to)})`, backgroundColor: colorOf(r.type), opacity: r.done ? 0.4 : 1 }} />
                      </span>
                      {trackMarks}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {legend && <div className="border-t border-line px-4 py-2">{legend}</div>}
        </Card>

        {/* 고른 주의 7일 줄 + 주 넘기기 */}
        <Card>
          <div className="flex items-center justify-between gap-2 pl-4">
            <span className="text-sm font-bold text-ink-soft tabular-nums">{shortDate(selWeek)}~{shortDate(selWeekEnd)}</span>
            <span className="flex">
              <IconButton label="지난주" icon="fa-chevron-left" onClick={() => moveWeek(-1)} />
              <IconButton label="다음 주" icon="fa-chevron-right" onClick={() => moveWeek(1)} />
            </span>
          </div>
          <div role="group" aria-label="날짜 고르기" className="flex justify-center pb-2">
            {weekDays.map((d) => {
              const dt = toDate(d);
              const isToday = d === today;
              const on = d === sel;
              const c = dueCount.get(d);
              const pin = pinsOn(d);
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => pick(d)}
                  aria-label={`${dt.getMonth() + 1}월 ${dt.getDate()}일 ${DOW[dt.getDay()]}요일${isToday ? ' 오늘' : ''}${pin.length ? `, 고정 일정 ${pin.map((p) => p.label).join(', ')}` : ''}${c ? `, 마감 할 일 ${c.n}개` : ''}`}
                  className="flex w-12 shrink-0 flex-col items-center focus-visible:-outline-offset-2 md:w-auto md:max-w-24 md:flex-1">
                  <span className={`flex h-4 items-center gap-1 text-xs ${isToday ? 'font-bold text-accent-ink' : 'font-normal text-muted'}`}>
                    {isToday ? '오늘' : DOW[dt.getDay()]}
                    {pin.length > 0 && <i className="fas fa-thumbtack text-ink-soft" aria-hidden />}
                  </span>
                  <span className={`mt-0.5 flex size-9 items-center justify-center rounded-full text-base tabular-nums ${on ? 'font-bold ring-2 ring-inset ring-ink' : isToday ? 'font-bold' : 'font-semibold'} ${isToday ? 'text-accent-ink' : 'text-ink'}`}>
                    {dt.getDate()}
                  </span>
                  {/* 그날 마감 할 일 개수(0 이면 빈 칸) */}
                  <span className={`h-4 text-xs tabular-nums ${c?.late ? 'font-bold text-danger-ink' : 'font-normal text-muted'}`}>{c ? c.n : ''}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* 고른 날 목록 */}
      <section aria-labelledby={`${uid}-day`}>
        <div className="mb-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id={`${uid}-day`} ref={headingRef} tabIndex={-1} className="flex min-w-0 flex-wrap items-baseline gap-x-3 text-lg font-bold text-ink outline-none">
              <span>{shortDate(sel)} ({DOW[selDate.getDay()]})</span>
              <span className={`text-sm ${gap === 0 ? 'font-bold text-accent-ink' : 'font-normal text-muted'}`}>{rel}</span>
              {pinsOn(sel).map((p) => <span key={p.label} className="text-sm font-normal text-ink-soft"><i className="fas fa-thumbtack mr-1.5" aria-hidden />{p.label}</span>)}
            </h3>
            {!shifting && <button type="button" className={`${textBtn} mx-0 shrink-0`} onClick={() => { setShifting(true); setComposing(false); }}>일정 옮기기</button>}
          </div>
          {shifting && <ShiftDates from={sel} titleOf={titleOf} getDoc={getDoc} onClose={() => setShifting(false)} />}
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-48 flex-1">
              <Segmented label="담당으로 걸러 보기" value={ownerF} onChange={setOwnerF}
                options={[{ value: '', label: '전체' }, { value: '남편', label: '남편' }, { value: '아내', label: '아내' }]} />
            </div>
            <label className="flex items-center gap-2 text-sm font-normal text-ink-soft">종류
              <select className={dateCls} value={kindF} onChange={(e) => setKindF(e.target.value as TaskKind | '')} aria-label="종류로 걸러 보기">
                <option value="">전체</option>
                {TASK_KINDS.map((k) => { const n = kindCount.get(k) ?? 0; return <option key={k} value={k} disabled={n === 0}>{n ? `${k} ${n}` : k}</option>; })}
              </select>
            </label>
          </div>
        </div>
        <Card>
          <div className={cardRowCls}>
            {composing
              ? <div className="px-3"><TaskComposer key={sel} stepId={defaultStep} steps={stepRefs} scope="page" initialDue={sel} onClose={() => setComposing(false)} /></div>
              : <AddButton label="할 일 추가" onClick={() => { setComposing(true); setShifting(false); }} />}
          </div>
          {late.length > 0 && (
            <section aria-labelledby={`${uid}-late`} className={cardRowCls}>
              <h4 id={`${uid}-late`} className="px-4 pt-3 text-sm font-bold text-danger-ink">기한 지남</h4>
              {/* 바로 아래 같은 단계 머리가 있으면 단계 이름은 빼고 */}
              <ul>{late.map((t) => row(t, !groupIds.includes(t.stepId)))}</ul>
            </section>
          )}
          {groupIds.map((id) => {
            const items = onDay.filter((t) => t.stepId === id);
            return (
              <section key={id} aria-labelledby={`${uid}-g${id}`} className={cardRowCls}>
                <h4 id={`${uid}-g${id}`}>
                  <button type="button" onClick={() => onStep(indexOf(id))}
                    className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm font-bold text-ink-soft transition-colors hover:bg-sunken focus-visible:-outline-offset-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(typeOf(id)) }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{id}단계 {titleOf(id)}</span>
                    <i className="fas fa-chevron-right text-xs text-muted" aria-hidden />
                  </button>
                </h4>
                {items.length > 0 && <ul>{items.map((t) => row(t))}</ul>}
              </section>
            );
          })}
          {late.length === 0 && groupIds.length === 0 && <p className={`${cardRowCls} px-4 py-3 text-base text-muted`}>이날은 할 일이 없어요.</p>}
          {noDate.length > 0 && (
            <div className={cardRowCls}>
              <FoldRow label="날짜 없음" count={noDate.length} open={noDateOpen} onToggle={() => setShowNoDate((v) => !v)} controls={`${uid}-nodate`} />
              {noDateOpen && <ul id={`${uid}-nodate`} className="border-t border-line">{noDate.map((t) => row(t, true))}</ul>}
            </div>
          )}
        </Card>
        <TrashCard kinds={['task']} />
      </section>
    </div>
  );
}
