'use client';

import { useState } from 'react';
import { shortDate, todayStr } from '@/lib/client/format';
import { useProgress } from '@/components/progress/ProgressProvider';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { ToggleChips } from '@/components/ui/ToggleChips';
import { TYPE_DOT, TYPE_LABEL, TYPE_ORDER } from '@/components/TimelineChart';
import type { TimelineType } from '@/lib/timeline';
import { MonthCalendar } from './MonthCalendar';
import { StepBars } from './StepBars';
import { axisOf, PUBLIC_DOC, type Pin, type TimelineStep } from './step-dates';

export type { TimelineStep } from './step-dates';

// 홈 「단계」의 날짜 화면. 로그인한 사람과 로그인 안 한 사람이 같은 컴포넌트 · 같은 모양을 본다.
//
// [ 단계 | 달력 ]  보기 고르기(Segmented)
// ┌ 상자 ──────────────────────────────────────────────
// │ 단계 종류 거르기 칩(준비 · 계약 · 중요 · 설비 · 행정 · 운영, 여러 개 켜기 · 다 끄면 전체) — 두 탭에 같이 적용
// │ 「고정 일정」 줄(핀 + 날짜 · 이름, 누르면 그날 창)
// │ 단계 탭 = StepBars(날짜 띠 + 막대) / 달력 탭 = MonthCalendar(월 보기)
// │ 기한 지난 안 끝난 할 일이 있으면 「기한 지남 n개」 한 줄(누르면 오늘 창)
// └──────────────────────────────────────────────
// 로그인 전(guest): 현황(할 일 · 목표일 · 고정 일정 · 단계 상태)을 받지 않으므로 빈 현황(PUBLIC_DOC)으로 그린다 — 단계 기간은
//   공개 일정 날수를 오늘부터 센 것이고(기간 글자는 「13~14일째」), 날짜는 누를 수 없다(그날 창 · 편집 없음). 개인 내용은 애초에 없다.
// 고른 탭 · 칩은 이 브라우저에만 기억한다(localStorage, 못 쓰면 기본값).
type View = 'steps' | 'month';
const VIEW_KEY = 'home:view';
const TYPES_KEY = 'home:types';
const recall = <T,>(key: string, ok: (v: unknown) => v is T, fallback: T): T => {
  try { const raw = localStorage.getItem(key); const v = raw == null ? null : JSON.parse(raw); return ok(v) ? v : fallback; } catch { return fallback; }
};
const remember = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 저장 못 해도 화면은 그대로 */ } };
const isView = (v: unknown): v is View => v === 'steps' || v === 'month';
const isTypes = (v: unknown): v is TimelineType[] => Array.isArray(v) && v.every((x) => (TYPE_ORDER as string[]).includes(x));

export function DateTimeline({ steps, currentId, onStep, onDay, fixedDay0, marks = [], guest = false }: {
  steps: TimelineStep[];
  currentId: number | null;
  /** 단계 창 열기(steps 배열의 순번) */
  onStep: (index: number) => void;
  /** 그날 할 일 창 열기(로그인 전엔 없음) */
  onDay?: (date: string) => void;
  /** 콘텐츠의 날수가 이미 정해진 날에서 센 값이면 그 날(예: 지산 2026-09-01) */
  fixedDay0?: string;
  /** 고정 일정에 더할 표시(예: 지산 만기) */
  marks?: Pin[];
  /** 로그인 전: 현황 없이 공개 일정만 */
  guest?: boolean;
}) {
  const progress = useProgress();
  const doc = guest ? PUBLIC_DOC : progress.doc;
  const [today] = useState(todayStr);
  const [picked, setPicked] = useState<string | null>(null);
  // 이 컴포넌트는 브라우저에서만 그려진다(GuideSection 이 현황을 확인한 뒤) — 처음 값을 바로 localStorage 에서 읽어도 화면이 어긋나지 않는다
  const [view, setView] = useState<View>(() => recall(VIEW_KEY, isView, 'steps'));
  const [types, setTypes] = useState<TimelineType[]>(() => recall(TYPES_KEY, isTypes, []));
  if (!doc) return null;

  const pickView = (v: View) => { setView(v); remember(VIEW_KEY, v); };
  const pickTypes = (v: TimelineType[]) => { setTypes(v); remember(TYPES_KEY, v); };
  const openDay = onDay && !guest ? (d: string) => { setPicked(d); onDay(d); } : undefined;
  const { pins, lateCount } = axisOf(steps, doc, today, { fixedDay0, marks, types });
  const shared = { steps, doc, today, types, picked, onPick: openDay, fixedDay0, marks, guest };

  return (
    <div className="flex flex-col gap-3">
      <Segmented label="보는 방식 고르기" value={view} onChange={pickView} options={[{ value: 'steps', label: '단계' }, { value: 'month', label: '달력' }]} />
      <Card>
        <div className="border-b border-line px-2">
          <ToggleChips label="단계 종류로 걸러 보기" values={types} onChange={pickTypes}
            options={TYPE_ORDER.map((t) => ({ value: t, label: TYPE_LABEL[t], dot: TYPE_DOT[t] }))} />
        </div>
        {pins.length > 0 && (
          <div className="flex items-center gap-x-4 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="고정 일정">
            <span className="flex min-h-11 shrink-0 items-center whitespace-nowrap text-sm font-normal text-ink-soft"><i className="fas fa-thumbtack mr-1.5" aria-hidden />고정 일정</span>
            {pins.map((p) => openDay
              ? (
                <button key={`${p.date}${p.label}`} type="button" onClick={() => openDay(p.date)}
                  className="inline-flex min-h-11 shrink-0 items-center gap-x-1.5 whitespace-nowrap text-sm text-ink-soft hover:underline">
                  <span className="font-bold">{shortDate(p.date)}</span><span className="font-normal">{p.label}</span>
                </button>
              )
              : (
                <span key={`${p.date}${p.label}`} className="inline-flex min-h-11 shrink-0 items-center gap-x-1.5 whitespace-nowrap text-sm text-ink-soft">
                  <span className="font-bold">{shortDate(p.date)}</span><span className="font-normal">{p.label}</span>
                </span>
              ))}
          </div>
        )}

        {view === 'steps'
          ? <StepBars {...shared} currentId={currentId} onStep={onStep} />
          : <MonthCalendar {...shared} />}

        {lateCount > 0 && openDay && (
          <button type="button" onClick={() => openDay(today)}
            className="flex min-h-11 w-full items-center gap-2 border-t border-line px-4 text-left text-base font-semibold text-danger-ink transition-colors hover:bg-sunken">
            <span className="min-w-0 flex-1">기한 지남<span className="ml-1.5 font-normal">{lateCount}개</span></span>
            <i className="fas fa-chevron-right text-xs text-muted" aria-hidden />
          </button>
        )}
      </Card>
    </div>
  );
}
