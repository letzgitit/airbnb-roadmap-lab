'use client';

import { useEffect, useRef } from 'react';
import { BarController, BarElement, CategoryScale, Chart, LinearScale, type Plugin } from 'chart.js';
import { DEFAULT_RANGE, TIMELINE, type TimelineType } from '@/lib/timeline';
import type { StepStatus } from '@/lib/core/types';
import { onActivate } from '@/lib/client/a11y';

Chart.register(BarController, BarElement, CategoryScale, LinearScale);

export interface ChartStep { id: number; label: string }
/** 단계별 할 일 개수: 끝낸 것 / 전체, 그리고 안 끝난 것 중 마감이 오늘인 것 · 이미 지난 것 */
export interface StepCounts { done: number; total: number; today: number; late: number }

// 단계 종류별 색(한 가지 색, 번짐 없음). 빨강은 「주의」, 파랑은 「누르는 것」과 「지금」에만 쓰므로
// 계약은 짙은 슬레이트, 설비는 노랑.
export const TYPE_COLOR: Record<TimelineType, string> = {
  prep: '#94a3b8', milestone: '#1e293b', critical: '#f97316', setup: '#eab308', admin: '#a855f7', open: '#10b981',
};
export const TYPE_DOT: Record<TimelineType, string> = {
  prep: 'bg-slate-400', milestone: 'bg-slate-800', critical: 'bg-orange-500', setup: 'bg-yellow-500', admin: 'bg-purple-500', open: 'bg-emerald-500',
};
export const TYPE_LABEL: Record<TimelineType, string> = {
  prep: '준비', milestone: '계약', critical: '중요', setup: '설비', admin: '행정', open: '운영',
};
export const TYPE_ORDER: TimelineType[] = ['prep', 'milestone', 'critical', 'setup', 'admin', 'open'];

const rangeOf = (id: number) => TIMELINE[id] ?? DEFAULT_RANGE;
const LABEL_W = 260; // 데스크톱 왼쪽 단계 이름 칸 너비(px) — 오른쪽에 「지금 · 할 일 n/m」과 「오늘 · 기한 지남」 개수가 들어가도 이름이 두 줄 안에 들어오게
const PERIOD_DAYS = 45; // 전체 일정 길이(Day 0~45)
const NOW_BG = 'bg-[#EFF6FF] hover:bg-[#EFF6FF]';

function titleCls(cur: boolean, done: boolean) {
  return cur ? 'font-bold text-slate-900' : done ? 'font-semibold text-slate-400' : 'font-semibold text-slate-700';
}

export function TimelineChart({ steps, statuses, onSelect, counts, currentId }: {
  steps: ChartStep[];
  statuses: Record<number, StepStatus | undefined> | null;
  counts: Record<number, StepCounts> | null;
  onSelect: (index: number) => void;
  /** 지금 하는 단계(진행 중인 첫 단계, 없으면 시작 안 한 첫 단계). 로그인 전엔 null */
  currentId: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const statusRef = useRef(statuses);
  const currentRef = useRef(currentId);
  const selectRef = useRef(onSelect);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  useEffect(() => {
    statusRef.current = statuses;
    currentRef.current = currentId;
    chartRef.current?.update('none');
  }, [statuses, currentId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const range = rangeOf;

    // 로그인했을 때만: 막대 끝에 표시(완료 = 슬레이트 체크, 지금 하는 단계 = 파랑 점)
    const marks: Plugin<'bar'> = {
      id: 'statusMarks',
      afterDatasetsDraw(chart) {
        const st = statusRef.current;
        if (!st) return;
        const c = chart.ctx;
        chart.getDatasetMeta(0).data.forEach((el, i) => {
          const id = steps[i].id;
          const s = st[id];
          const isNow = id === currentRef.current;
          if (s !== 'done' && !isNow) return;
          const x = el.x + 14, y = el.y;
          c.save();
          c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2);
          c.fillStyle = s === 'done' ? '#475569' : '#2563eb'; c.fill();
          c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
          if (s === 'done') {
            c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x - 1, y + 3); c.lineTo(x + 4, y - 3);
            c.strokeStyle = '#fff'; c.lineWidth = 2; c.lineCap = 'round'; c.stroke();
          } else { c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
          c.restore();
        });
      },
    };

    const chart = new Chart(ctx, {
      type: 'bar',
      plugins: [marks],
      data: {
        labels: steps.map((s) => s.label),
        datasets: [{
          data: steps.map((s) => [range(s.id).start, range(s.id).end]),
          backgroundColor: steps.map((s) => TYPE_COLOR[range(s.id).type]),
          borderRadius: 6, borderSkipped: false, barPercentage: 0.65, categoryPercentage: 1.0,
          hoverBorderColor: '#fff', hoverBorderWidth: 2,
          hoverBackgroundColor: steps.map((s) => TYPE_COLOR[range(s.id).type]),
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: 24 } },
        onHover: (event, el) => { const t = event.native?.target as HTMLElement | undefined; if (t) t.style.cursor = el[0] ? 'pointer' : 'default'; },
        onClick: (e) => {
          const pts = chart.getElementsAtEventForMode(e as unknown as Event, 'nearest', { intersect: true }, true);
          if (pts.length) selectRef.current(pts[0].index);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: ({ tooltip }) => {
              const el = tipRef.current;
              if (!el) return;
              if (tooltip.opacity === 0) { el.style.opacity = '0'; return; }
              const s = steps[tooltip.dataPoints[0].dataIndex];
              const r = range(s.id);
              el.innerHTML = '';
              const a = document.createElement('div'); a.className = 'font-bold text-[15px] mb-1'; a.textContent = s.label;
              const b = document.createElement('div'); b.className = 'text-slate-300 font-semibold'; b.textContent = `진행 기간: Day ${r.start} ~ ${r.end}`;
              el.append(a, b);
              el.style.opacity = '1';
              el.style.left = `${tooltip.caretX + LABEL_W + 10}px`;
              el.style.top = `${tooltip.caretY + 20}px`;
            },
          },
        },
        scales: { x: { min: 0, max: 48, display: false }, y: { display: false } },
      },
    });
    chartRef.current = chart;
    return () => { chart.destroy(); chartRef.current = null; };
  }, [steps]);

  const showTip = (text: string | null, e?: React.MouseEvent) => {
    const el = tipRef.current;
    if (!el) return;
    if (text === null) { el.style.opacity = '0'; return; }
    if (e) {
      const rect = (el.offsetParent as HTMLElement).getBoundingClientRect();
      el.style.left = `${e.clientX - rect.left + 20}px`;
      el.style.top = `${e.clientY - rect.top}px`;
    }
    el.innerHTML = '';
    const d = document.createElement('div'); d.className = 'font-bold text-[15px] text-slate-100'; d.textContent = text;
    el.append(d);
    el.style.opacity = '1';
  };

  return (
    <>
    {/* 폰(768px 미만): 단계 목록 + 줄마다 기간 막대(전체 45일 중 어디인지, 종류 색). 지금 하는 단계는 연한 파랑 바탕 + 「지금」, 끝낸 단계는 흐린 글씨 + 체크 + 옅은 막대 */}
    <ol className="md:hidden overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100" aria-label="단계별 기간">
      {steps.map((s, i) => {
        const r = rangeOf(s.id);
        const st = statuses?.[s.id];
        const cur = currentId === s.id;
        const done = st === 'done';
        const c = counts?.[s.id];
        return (
          <li key={s.id}>
            <button type="button" onClick={() => onSelect(i)} aria-current={cur ? 'step' : undefined}
              className={`flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 ${cur ? NOW_BG : ''}`}>
              <span className="min-w-0 flex-1">
                <span className={`block text-[15px] leading-snug ${titleCls(cur, done)}`}>{s.label}</span>
                <span className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] font-semibold text-slate-500">
                  <span>Day {r.start}~{r.end}</span>
                  {c && c.total > 0 && <span>할 일 {c.done}/{c.total}</span>}
                  {c && c.today > 0 && <span className="font-bold text-slate-900">오늘 {c.today}</span>}
                  {c && c.late > 0 && <span className="font-bold text-red-600">기한 지남 {c.late}</span>}
                </span>
                <span className="relative mt-2 block h-1.5 w-full rounded-[3px] bg-[#f1f5f9]" aria-hidden>
                  <span className="absolute inset-y-0 block rounded-[3px]"
                    style={{ left: `${(r.start / PERIOD_DAYS) * 100}%`, width: `${Math.max(((r.end - r.start) / PERIOD_DAYS) * 100, 2)}%`, backgroundColor: TYPE_COLOR[r.type], opacity: done ? 0.4 : 1 }} />
                </span>
              </span>
              {cur
                ? <span className="shrink-0 text-[12px] font-bold text-blue-700">지금</span>
                : done
                  ? <i className="fas fa-check shrink-0 text-slate-400" aria-label="완료" />
                  : st === 'doing' ? <span className="shrink-0 text-[12px] font-bold text-slate-500">진행 중</span> : null}
            </button>
          </li>
        );
      })}
    </ol>
    <div className="hidden md:block relative overflow-hidden rounded-2xl border border-slate-200 bg-white" style={{ height: 750 }}>
      <div className="h-full flex overflow-x-auto overflow-y-hidden relative w-full">
        <div className="sticky left-0 z-20 flex-none flex flex-col border-r border-slate-200 bg-white" style={{ height: 750, width: LABEL_W }}>
          <div className="flex h-[40px] shrink-0 items-center border-b border-slate-200 bg-slate-50 px-4">
            <span className="text-[12px] font-semibold text-slate-500">단계</span>
          </div>
          {steps.map((s, i) => {
            const st = statuses?.[s.id];
            const cur = currentId === s.id;
            const done = st === 'done';
            const c = counts?.[s.id];
            return (
              <div key={s.id} role="button" tabIndex={0} aria-current={cur ? 'step' : undefined}
                className={`group flex h-[50px] shrink-0 cursor-pointer items-center gap-2 border-b border-slate-100 pl-4 pr-3 transition-colors hover:bg-slate-50 ${cur ? NOW_BG : ''}`}
                onClick={() => onSelect(i)} onKeyDown={onActivate(() => onSelect(i))}
                onMouseEnter={(e) => showTip(s.label, e)} onMouseMove={(e) => showTip(s.label, e)} onMouseLeave={() => showTip(null)}>
                <span title={s.label} className={`min-w-0 flex-1 text-[13px] leading-tight line-clamp-2 ${titleCls(cur, done)}`}>{s.label}</span>
                {/* 오른쪽 두 줄: 위 = 지금 · 완료 표시 + 할 일 n/m, 아래 = 오늘 n · 기한 지남 n(0이면 안 보임) */}
                <span className="shrink-0 text-right text-[12px] leading-tight">
                  {(cur || done || (c && c.total > 0)) && (
                    <span className="flex items-center justify-end gap-x-2">
                      {cur && <span className="font-bold text-blue-700">지금</span>}
                      {done && <i className="fas fa-check text-slate-400" aria-label="완료" />}
                      {c && c.total > 0 && <span className="font-semibold text-slate-500">할 일 {c.done}/{c.total}</span>}
                    </span>
                  )}
                  {c && (c.today > 0 || c.late > 0) && (
                    <span className="mt-0.5 flex items-center justify-end gap-x-2">
                      {c.today > 0 && <span className="font-bold text-slate-900">오늘 {c.today}</span>}
                      {c.late > 0 && <span className="font-bold text-red-600">기한 지남 {c.late}</span>}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex-grow flex flex-col relative min-w-[800px]">
          <div className="relative flex h-[40px] shrink-0 items-center border-b border-slate-200 bg-slate-50">
            <div className="absolute left-0 pl-4 text-[12px] font-semibold text-slate-500">시작</div>
            <div className="absolute right-0 pr-4 text-[12px] font-semibold text-slate-500">오픈(45일)</div>
          </div>
          <div className="chart-content relative w-full" style={{ height: 710 }}>
            <div className="absolute inset-0 w-full flex flex-col z-0">
              {steps.map((s) => <div key={s.id} className="w-full border-b border-slate-100 h-[50px]" />)}
            </div>
            <canvas ref={canvasRef} className="relative z-10" aria-label="타임라인 차트" />
          </div>
        </div>
      </div>
      <div ref={tipRef} className="pointer-events-none absolute z-50 rounded-xl bg-slate-900 px-4 py-3 text-xs text-white opacity-0 transition-opacity" />
    </div>
    </>
  );
}
