'use client';

import { useEffect, useRef } from 'react';
import { BarController, BarElement, CategoryScale, Chart, LinearScale, type Plugin } from 'chart.js';
import { DEFAULT_RANGE, TIMELINE, type TimelineType } from '@/lib/timeline';
import type { StepStatus } from '@/lib/core/types';

Chart.register(BarController, BarElement, CategoryScale, LinearScale);

export interface ChartStep { id: number; label: string }

const GRADIENTS: Record<TimelineType, [string, string]> = {
  prep: ['#94a3b8', '#64748b'], milestone: ['#f87171', '#ef4444'], critical: ['#fb923c', '#f97316'],
  setup: ['#60a5fa', '#3b82f6'], admin: ['#c084fc', '#a855f7'], open: ['#34d399', '#10b981'],
};

function gradient(ctx: CanvasRenderingContext2D, type: TimelineType) {
  const g = ctx.createLinearGradient(0, 0, 500, 0);
  const [a, b] = GRADIENTS[type];
  g.addColorStop(0, a); g.addColorStop(1, b);
  return g;
}

export function TimelineChart({ steps, statuses, onSelect, counts }: {
  steps: ChartStep[];
  statuses: Record<number, StepStatus | undefined> | null;
  counts: Record<number, { done: number; total: number }> | null;
  onSelect: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const statusRef = useRef(statuses);
  const selectRef = useRef(onSelect);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  useEffect(() => {
    statusRef.current = statuses;
    chartRef.current?.update('none');
  }, [statuses]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const range = (id: number) => TIMELINE[id] ?? DEFAULT_RANGE;

    // 로그인했을 때만: 막대 끝에 상태 표시(완료=초록 체크, 진행 중=파랑 점)
    const marks: Plugin<'bar'> = {
      id: 'statusMarks',
      afterDatasetsDraw(chart) {
        const st = statusRef.current;
        if (!st) return;
        const c = chart.ctx;
        chart.getDatasetMeta(0).data.forEach((el, i) => {
          const s = st[steps[i].id];
          if (s !== 'done' && s !== 'doing') return;
          const x = el.x + 14, y = el.y;
          c.save();
          c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2);
          c.fillStyle = s === 'done' ? '#10b981' : '#2563eb'; c.fill();
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
          backgroundColor: steps.map((s) => gradient(ctx, range(s.id).type)),
          borderRadius: 8, borderSkipped: false, barPercentage: 0.65, categoryPercentage: 1.0,
          hoverBorderColor: '#fff', hoverBorderWidth: 2,
          hoverBackgroundColor: steps.map((s) => gradient(ctx, range(s.id).type)),
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
              const a = document.createElement('div'); a.className = 'font-black text-sm mb-1'; a.textContent = s.label;
              const b = document.createElement('div'); b.className = 'text-blue-300 font-bold'; b.textContent = `진행 기간: Day ${r.start} ~ ${r.end}`;
              el.append(a, b);
              el.style.opacity = '1';
              el.style.left = `${tooltip.caretX + 170}px`;
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
    const d = document.createElement('div'); d.className = 'font-black text-sm text-slate-100'; d.textContent = text;
    el.append(d);
    el.style.opacity = '1';
  };

  return (
    <div className="relative border border-slate-100 rounded-3xl overflow-hidden bg-white" style={{ height: 750 }}>
      <div className="chart-scroll-area h-full flex overflow-x-auto overflow-y-hidden relative w-full">
        <div className="sticky left-0 z-20 bg-white/95 backdrop-blur-sm border-r border-slate-100 flex-none w-[160px] flex flex-col shadow-[4px_0_12px_-4px_rgba(0,0,0,0.05)]" style={{ height: 750 }}>
          <div className="h-[40px] border-b border-slate-100 bg-slate-50/50 flex items-center justify-center shrink-0">
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Process Step</span>
          </div>
          {steps.map((s, i) => {
            const st = statuses?.[s.id];
            const c = counts?.[s.id];
            return (
              <div key={s.id} role="button" tabIndex={0}
                className="flex items-center pl-4 pr-3 cursor-pointer border-b border-slate-50 hover:bg-blue-50 transition-colors h-[50px] group shrink-0"
                onClick={() => onSelect(i)} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(i); }}
                onMouseEnter={(e) => showTip(s.label, e)} onMouseMove={(e) => showTip(s.label, e)} onMouseLeave={() => showTip(null)}>
                <span className="text-[12px] font-bold text-slate-500 group-hover:text-blue-700 truncate transition-colors">{s.label}</span>
                {statuses && (st === 'done' || st === 'doing' || (c && c.total > 0)) && (
                  <span className={`ml-auto pl-1 shrink-0 text-[10px] font-black ${st === 'done' ? 'text-emerald-500' : st === 'doing' ? 'text-blue-600' : 'text-slate-400'}`}>
                    {st === 'done' ? <i className="fas fa-circle-check" /> : st === 'doing' ? <i className="fas fa-circle-dot" /> : null}
                    {c && c.total > 0 ? <span className="ml-0.5">{c.done}/{c.total}</span> : null}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex-grow flex flex-col relative min-w-[800px]">
          <div className="h-[40px] flex items-center border-b border-slate-100 bg-slate-50/50 relative shrink-0">
            <div className="absolute left-0 text-[10px] text-slate-400 font-bold pl-4">START (DAY 0)</div>
            <div className="absolute right-0 text-[10px] text-slate-400 font-bold pr-4">LAUNCH (DAY 45)</div>
          </div>
          <div className="chart-content relative w-full" style={{ height: 710 }}>
            <div className="absolute inset-0 w-full flex flex-col z-0">
              {steps.map((s) => <div key={s.id} className="w-full border-b border-slate-50 h-[50px]" />)}
            </div>
            <canvas ref={canvasRef} className="relative z-10" aria-label="타임라인 차트" />
          </div>
        </div>
      </div>
      <div ref={tipRef} className="absolute bg-slate-900/90 backdrop-blur-md text-white text-xs rounded-xl px-4 py-3 pointer-events-none opacity-0 z-50 transition-opacity shadow-xl border border-white/20" />
    </div>
  );
}
