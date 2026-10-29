'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { shortDate } from '@/lib/client/format';
import { useProgress } from '@/components/progress/ProgressProvider';
import { ToggleChips } from '@/components/ui/ToggleChips';
import { TYPE_DOT, TYPE_LABEL, TYPE_ORDER } from '@/components/TimelineChart';
import { taskErrorMessage } from '@/components/tasks/task-errors';
import { clipLabel } from '@/components/progress/bits';
import type { TimelineType } from '@/lib/timeline';
import { addDays, diffDays, stepRanges, type DocLike, type TimelineStep } from '../step-dates';
import { useDragScroll, useMedia } from '../use-drag-scroll';
import { ganttRows, initialOpen, phasesOf, spanOf, tasksOf, type Editing, type Phase } from './gantt-model';
import { axisOf, cxOf, dayWidth, isZoom, todayScroll, xOf, ZOOM_LABEL, ZOOMS, type Zoom } from './gantt-scale';
import { GanttForm } from './GanttForm';
import { AddRow, FoldRow, FormRow, PhaseRow, SepRow, TaskRow, type DragMode, type Geo } from './GanttRow';
import s from './gantt.module.css';
import { FoldAll, OpenAll } from './icons';

// 홈 「단계」 탭 = 트리 간트(시안 gantt-v2/mock.html). 로그인 전후 같은 틀이고 내용만 다르다.
// ┌ 상자 ─────────────────────────────────────────────
// │ [일 | 주 | 달]            「오늘」 「모두 접기」(펼친 단계가 없으면 「모두 펴기」)
// │ 단계 종류 거르기 칩(준비 · 계약 …, 달력 탭과 같이 적용)
// │ 날짜 머리(머리글 띠 바로 밑에 붙음): 달 이름 · 날짜 숫자 · 「오늘 27」 — 고정 일정은 간트에 그리지 않는다(날짜 띠 · 그날 창 · 달력 · 요약이 보여 준다)
// │   본문과 같은 세로 칸 선을 머리까지 이어 그어 숫자가 어느 칸인지 보인다(주말 면은 머리에 넣지 않는다)
// │ 「끝난 단계 n개」(접음) → 단계 머리 띠 → 할 일 → 세부 항목 → 「＋ 할 일 추가」 …(gantt-model.ts)
// │ 그림 읽는 법(범례)
// └───────────────────────────────────────────────
// 시간 단위: 일 · 주 · 달(기본 = 로그인 주 · 로그인 전 달, 고른 단위는 이 브라우저에 기억). 처음 · 단위를 바꿀 때 · 「오늘」 = 오늘을 보이는 폭 30% 자리에.
// 누르기: 단계 머리 = 단계 창(왼쪽 꺾쇠만 접기 · 펴기), 할 일 줄 = 그 자리 편집 폼, 동그라미 = 끝냄 켜고 끄기, 「세부 1/4」 = 세부 항목 접기 · 펴기.
// PC(마우스)에서만 막대를 끌어 날짜를 바꾼다(가운데 = 통째로, 양 끝 = 시작일 · 마감일만). 폰은 끌기 없음(가로 넘기기와 겹친다).
// 로그인 전(guest): 단계 14줄만(할 일 · 목표일 없음), 기간 글자 「1~12일째」, 펼치기 · 편집 없음.
const ZOOM_KEY = 'home:gantt-zoom';
const EPOCH = '2026-01-01';
// 처음 단위: 로그인 = 주, 로그인 전 = 달(공개 일정 약 45일이 한 화면에 — 날짜보다 순서와 길이를 보는 화면)
const recallZoom = (fallback: Zoom): Zoom => { try { const v = JSON.parse(localStorage.getItem(ZOOM_KEY) ?? 'null'); return isZoom(v) ? v : fallback; } catch { return fallback; } };
const rememberZoom = (z: Zoom) => { try { localStorage.setItem(ZOOM_KEY, JSON.stringify(z)); } catch { /* 기억 못 해도 화면은 그대로 */ } };

export function StepGantt({ steps, doc, today, types, onTypes, currentId, onStep, fixedDay0, guest }: {
  steps: TimelineStep[]; doc: DocLike; today: string;
  types: TimelineType[]; onTypes: (v: TimelineType[]) => void;
  currentId: number | null;
  /** 단계 창 열기(steps 배열의 순번) */
  onStep: (index: number) => void;
  fixedDay0?: string; guest: boolean;
}) {
  const progress = useProgress();
  // 늘 최신 현황: 끌기 뒤 알림의 「되돌리기」는 몇 초 뒤에 눌리므로, 끌 때 붙잡은 현황(옛 version)이 아니라 누르는 때의 version 을 보낸다(옛 값이면 409)
  const docRef = useRef(progress.doc);
  useEffect(() => { docRef.current = progress.doc; }, [progress.doc]);
  const phone = useMedia('(max-width: 767.98px)');
  const mouse = useMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)');
  const canDrag = mouse && !guest;
  const dragScroll = useDragScroll();
  const [zoom, setZoom] = useState<Zoom>(() => recallZoom(guest ? 'month' : 'week'));
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [viewW, setViewW] = useState(0);
  const gxRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dayPos = useRef<number | null>(null);
  const lastZoom = useRef<Zoom | null>(null);

  const tasks = useMemo(() => (guest ? [] : tasksOf(doc)), [doc, guest]);
  const phases: Phase[] = useMemo(() => phasesOf(stepRanges(steps, doc, today, fixedDay0).map((r) => {
    const st = doc.steps[String(r.id)];
    return { ...r, target: guest ? null : st?.targetDate ?? null, current: !guest && r.id === currentId, doing: st?.status === 'doing' };
  }), tasks, today), [steps, doc, today, fixedDay0, tasks, currentId, guest]);
  const [openState, setOpenState] = useState(() => initialOpen(phases, today));
  const { open, openTask } = openState;
  const { first, last } = spanOf(phases, today, { showDone, types });
  const days = diffDays(first, last) + 1;
  const vw = viewW || 360;
  const dw = dayWidth(zoom, phone, vw, days);
  const W = days * dw + 80; // 끝 여백: 마지막 칸의 ◆ 자리
  const ax = axisOf(first, last, dw, zoom, today);
  const geo: Geo = { x: xOf(first, dw), cx: cxOf(first, dw), dw };
  const rows = ganttRows(phases, { open, openTask, showDone, types, editing, guest });
  const anyOpen = phases.some((p) => !p.done && open.has(p.id));

  // 보이는 폭 재기
  useLayoutEffect(() => {
    const el = gxRef.current;
    if (!el) return;
    setViewW(el.clientWidth);
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 가로로 넘길 때: 날짜 머리를 같이 옮기고, 화면 밖으로 나간 막대는 가장자리 조각으로(그리기 없이 바로 — 줄이 많아도 매끄럽게)
  const sync = () => {
    const el = gxRef.current;
    if (!el) return;
    const sl = el.scrollLeft;
    if (axisRef.current) axisRef.current.style.transform = `translateX(${-sl}px)`;
    canvasRef.current?.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => {
      b.classList.toggle(s.offL, Number(b.dataset.b) < sl + 4);
      b.classList.toggle(s.offR, Number(b.dataset.a) > sl + el.clientWidth - 4);
    });
  };
  const onScroll = () => {
    const el = gxRef.current;
    if (el) dayPos.current = el.scrollLeft / dw + diffDays(EPOCH, first);
    sync();
  };
  // 처음 · 단위를 바꾸면 오늘 자리로, 그 밖에 축이 바뀌면(거르기 · 끝난 단계 펼치기 · 화면 폭) 보던 날짜를 그대로
  useLayoutEffect(() => {
    const el = gxRef.current;
    if (!el || !viewW) return;
    if (lastZoom.current !== zoom) { el.scrollLeft = todayScroll(first, dw, today, viewW); lastZoom.current = zoom; }
    else if (dayPos.current != null) el.scrollLeft = Math.max(0, (dayPos.current - diffDays(EPOCH, first)) * dw);
    dayPos.current = el.scrollLeft / dw + diffDays(EPOCH, first);
  }, [zoom, first, dw, viewW, today]);
  useLayoutEffect(sync);

  const pickZoom = (z: Zoom) => { setZoom(z); rememberZoom(z); };
  const goToday = () => gxRef.current?.scrollTo({ left: todayScroll(first, dw, today, vw), behavior: 'smooth' });
  const toggleAll = () => {
    setOpenState((o) => ({ ...o, open: anyOpen ? new Set() : new Set(phases.filter((p) => !p.done).map((p) => p.id)) }));
    setEditing(null);
  };
  const togglePhase = (id: number) => {
    const closing = open.has(id);
    setOpenState((o) => { const n = new Set(o.open); if (closing) n.delete(id); else n.add(id); return { ...o, open: n }; });
    if (closing && editing && rows.some((r) => r.k === 'form' && r.p.id === id)) setEditing(null);
  };
  const toggleKids = (id: string) => setOpenState((o) => { const n = new Set(o.openTask); if (n.has(id)) n.delete(id); else n.add(id); return { ...o, openTask: n }; });
  // 다른 폼으로 바꿀 때 쓰던 글이 있으면 확인
  const switchEdit = async (next: Editing | null) => {
    if (editing && progress.hasDirty('page') && !(await progress.confirmDiscard())) return;
    setEditing(next);
  };
  const sameEdit = (a: Editing | null, b: Editing) => !!a && a.kind === b.kind && JSON.stringify(a) === JSON.stringify(b);
  const toggleDone = (id: string) => {
    const t = progress.doc?.tasks[id];
    if (t) void progress.send({ op: 'task.update', id, patch: { done: !t.done } });
  };
  // 막대 끌기 → 시작일 · 마감일 저장(되돌리기 알림)
  const commitDrag = async (id: string, mode: DragMode, d: number) => {
    const t = progress.doc?.tasks[id];
    if (!t) return;
    const from = t.start ?? t.due;
    const to = t.due ?? t.start;
    if (!from || !to) return;
    let patch: { start?: string | null; due?: string | null };
    if (mode === 'move') patch = { ...(t.start ? { start: addDays(t.start, d) } : {}), ...(t.due ? { due: addDays(t.due, d) } : {}) };
    else if (mode === 'start') { const n = addDays(from, d) > to ? to : addDays(from, d); patch = { start: n === to ? null : n }; }
    else { const n = addDays(to, d) < from ? from : addDays(to, d); patch = { due: n, ...(t.start ? {} : { start: from }) }; }
    const back = { ...('start' in patch ? { start: t.start ?? null } : {}), ...('due' in patch ? { due: t.due } : {}) };
    const r = await progress.send({ op: 'task.update', id, baseVersion: t.version, patch }, { quiet: true });
    if (!r.ok) { const msg = taskErrorMessage(r); if (msg) progress.toast(msg, { kind: 'error' }); return; }
    // 알림 글자의 새 기간: 시작일을 안 건드렸으면 원래 시작일, 시작일이 없던 하루짜리를 통째로 옮겼으면 새 마감일 하루
    const nt = patch.due ?? to;
    const nf = patch.start !== undefined ? patch.start ?? nt : t.start ? from : nt;
    progress.toast(`‘${clipLabel(t.text)}’ 날짜를 바꿨어요(${nf && nf !== nt ? `${shortDate(nf)}~${shortDate(nt)}` : shortDate(nt)}).`, {
      ms: 8000,
      action: { label: '되돌리기', run: () => { const c = docRef.current?.tasks[id]; if (c) void progress.send({ op: 'task.update', id, baseVersion: c.version, patch: back }); } },
    });
  };

  return (
    <section className={`${s.gantt} overflow-clip rounded-panel border border-line bg-surface`} style={{ '--vw': `${vw}px` } as CSSProperties} aria-label="단계별 일정">
      <div className={s.tools}>
        <div className={s.zoom}>
          <div role="group" aria-label="시간 단위" className="flex gap-1 rounded-control bg-sunken p-1">
            {ZOOMS.map((z) => (
              <button key={z} type="button" aria-pressed={zoom === z} onClick={() => pickZoom(z)}
                className={`flex min-h-11 flex-1 items-center justify-center rounded-control text-base transition-colors ${zoom === z ? 'bg-raised font-bold text-ink shadow-sm dark:shadow-none' : 'font-semibold text-muted hover:text-ink'}`}>
                {ZOOM_LABEL[z]}
              </button>
            ))}
          </div>
        </div>
        <span className={s.sp} />
        <button type="button" className={s.tbtn} onClick={goToday}>오늘</button>
        {!guest && (
          <button type="button" className={s.tbtn} onClick={toggleAll}>{anyOpen ? <><FoldAll />모두 접기</> : <><OpenAll />모두 펴기</>}</button>
        )}
      </div>
      <div className={s.chips}>
        <ToggleChips fill label="단계 종류로 걸러 보기" values={types} onChange={onTypes}
          options={TYPE_ORDER.map((t) => ({ value: t, label: TYPE_LABEL[t], dot: TYPE_DOT[t] }))} />
      </div>

      <div className={s.axisWrap}>
        <div ref={axisRef} className={s.axis} style={{ width: W }}>
          {ax.lines.map((l) => <i key={`l${l.x}`} className={`${s.gl} ${l.kind === 'month' ? s.m : l.kind === 'faint' ? s.faint : ''}`} style={{ left: l.x }} aria-hidden />)}
          {ax.months.map((m) => <span key={`m${m.x}`} className={s.axM} style={{ left: m.x }} aria-hidden>{m.text}</span>)}
          {ax.days.map((d) => <span key={`d${d.x}`} className={`${s.axD} ${zoom === 'day' ? '' : s.wk}`} style={{ left: d.x }} aria-hidden>{d.text}</span>)}
          {/* 「오늘 27」 글자는 축 첫머리에서 잘리지 않게(오늘이 첫 칸 근처면 글자만 조금 안쪽으로) */}
          {ax.todayX != null && <span className={s.axToday} style={{ left: ax.labelX ?? ax.todayX }}>{ax.todayText}</span>}
        </div>
      </div>

      <div ref={gxRef} className={s.gx} onScroll={onScroll} {...dragScroll}>
        <div ref={canvasRef} className={s.canvas} style={{ width: W }}>
          <div className={s.grid} aria-hidden>
            {ax.weekends.map((x) => <i key={`w${x}`} className={s.wkend} style={{ left: x, width: dw }} />)}
            {ax.lines.map((l) => <i key={`l${l.x}`} className={`${s.gl} ${l.kind === 'month' ? s.m : l.kind === 'faint' ? s.faint : ''}`} style={{ left: l.x }} />)}
          </div>
          {rows.some((r) => r.k === 'phase')
            ? rows.map((r, i) => {
              switch (r.k) {
                case 'fold': return <FoldRow key="fold" n={r.n} open={showDone} onToggle={() => setShowDone((v) => !v)} />;
                case 'sep': case 'gap': return <SepRow key={`g${i}`} gap={r.k === 'gap'} />;
                case 'phase': return (
                  <PhaseRow key={`p${r.p.id}`} r={r} geo={geo} open={open.has(r.p.id)} guest={guest}
                    onToggle={() => togglePhase(r.p.id)} onStep={() => onStep(steps.findIndex((x) => x.id === r.p.id))} />
                );
                case 'task': case 'sub': return (
                  <TaskRow key={r.t.id} r={r} geo={geo} today={today} phone={phone} kidsOpen={openTask.has(r.t.id)} canDrag={canDrag}
                    onEdit={() => { const e: Editing = { kind: 'edit', id: r.t.id }; void switchEdit(sameEdit(editing, e) ? null : e); }}
                    onToggleDone={() => toggleDone(r.t.id)} onToggleKids={() => toggleKids(r.t.id)}
                    onDrag={(mode, d) => void commitDrag(r.t.id, mode, d)} />
                );
                case 'add': return <AddRow key={`a${r.p.id}`} r={r} onNew={() => void switchEdit({ kind: 'new', stepId: r.p.id })} />;
                case 'form': return (
                  <FormRow key={`f${JSON.stringify(r.ed)}`} r={r}>
                    <GanttForm key={JSON.stringify(r.ed)} ed={r.ed} phase={r.p} steps={steps} onClose={() => setEditing(null)}
                      onAddSub={(pid) => { setOpenState((o) => ({ ...o, openTask: new Set(o.openTask).add(pid) })); void switchEdit({ kind: 'newsub', parentId: pid }); }} />
                  </FormRow>
                );
                default: return null;
              }
            })
            : <p className={s.empty} style={{ width: vw, position: 'sticky', left: 0 }}>고른 종류의 단계가 없어요. 다른 종류를 켜 보세요.</p>}
          {ax.todayX != null && <i className={s.today} style={{ left: ax.todayX }} aria-hidden />}
        </div>
      </div>

      <div className={s.legend} aria-label="그림 읽는 법">
        <span><i className={s.lgSb} />단계(진한 부분이 끝낸 만큼)</span>
        {!guest && <span><i className={s.lgTb} />할 일</span>}
        {!guest && <span><i className={s.lgSt} />세부 항목</span>}
        {!guest && <span><i className={s.lgDia} />단계 목표일</span>}
      </div>
    </section>
  );
}
