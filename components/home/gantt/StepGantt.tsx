'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { shortDate } from '@/lib/client/format';
import { useProgress } from '@/components/progress/ProgressProvider';
import { Segmented } from '@/components/ui/Segmented';
import { ToggleChips } from '@/components/ui/ToggleChips';
import { TYPE_DOT, TYPE_LABEL, TYPE_ORDER } from '@/components/TimelineChart';
import { taskErrorMessage } from '@/components/tasks/task-errors';
import { clipLabel } from '@/components/progress/bits';
import type { TimelineType } from '@/lib/timeline';
import { addDays, diffDays, stepRanges, toDate, type DocLike, type TimelineStep } from '../step-dates';
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
// │   달 이름은 보이는 맨 왼쪽 날의 달이 윗줄 왼쪽에 붙어 따라온다(그달 칸 안 sticky — 머리를 본문과 같은 scrollLeft 로 넘겨야 붙는다)
// │   날짜 숫자 = 고르기 단추: 누르면 그 숫자에 고른 표시(검정 2px 고리 — 그날 창 날짜 띠 · 달력의 고른 날과 같음) +
// │   그 칸이 머리부터 맨 아래 줄까지 옅은 면 하나(막대 · 글자 뒤). 다시 누르면 풀림. 주 · 달 단위는 월요일부터 7일. 단위를 바꾸면 풀림
// │   (줄 이름 칸은 면이 불투명해 같은 옅은 면을 배경 그림으로 겹쳐 그린다 — 가로로 넘길 때 sync 가 --pa · --pb 를 옮긴다)
// │ 「끝난 단계 n개」(접음) → 단계 머리 띠 → 할 일 → 세부 항목 → 「＋ 할 일」 …(gantt-model.ts)
// │ 그림 읽는 법(범례)
// └───────────────────────────────────────────────
// 시간 단위: 일 · 주 · 달(기본 = 로그인 주 · 로그인 전 달, 고른 단위는 이 브라우저에 기억). 처음 · 단위를 바꿀 때 · 「오늘」 = 오늘을 보이는 폭 30% 자리에.
// 누르기: 단계 머리 = 단계 창(왼쪽 꺾쇠만 접기 · 펴기), 할 일 줄 = 바로 밑에 내용만 펼치기 · 접기(TaskDetail — 메모 · 전화 · 사진 · 도움말,
//   연필 = 그 자리 편집 폼, 휴지통 = 바로 지우고 8초 되돌리기), 동그라미 = 끝냄 켜고 끄기, 「세부 1/4」 = 세부 항목 접기 · 펴기.
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
  // 내용을 펼친 할 일 · 세부 항목(누르면 먼저 보기 — TaskDetail)
  const [reading, setReading] = useState<Set<string>>(() => new Set());
  const [viewW, setViewW] = useState(0);
  // 고른 날(일 단위 = 그날, 주 · 달 단위 = 그 월요일). 이 화면에서만 — 새로고침하면 풀린다
  const [pick, setPick] = useState<string | null>(null);
  const secRef = useRef<HTMLElement>(null);
  const gxRef = useRef<HTMLDivElement>(null);
  // 날짜 머리(가로 넘김 상자 — 본문 scrollLeft 를 그대로 받는다)
  const axisRef = useRef<HTMLDivElement>(null);
  // 머리를 마지막으로 옮긴 자리(머리 스스로 넘어간 것 — 키보드로 숫자 단추에 갔을 때 — 만 본문을 따라 옮기려고)
  const axisSl = useRef(0);
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
  const pickX = pick ? geo.x(pick) : null;
  const pickW = zoom === 'day' ? dw : dw * 7;

  // 보이는 폭 재기
  useLayoutEffect(() => {
    const el = gxRef.current;
    if (!el) return;
    setViewW(el.clientWidth);
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 가로로 넘길 때: 날짜 머리를 같이 넘기고(transform 이 아니라 scrollLeft — 달 이름 sticky 가 붙으려면),
  // 고른 날 면을 줄 이름 칸에서도 같은 자리로, 화면 밖으로 나간 막대는 가장자리 조각으로(그리기 없이 바로 — 줄이 많아도 매끄럽게)
  const sync = () => {
    const el = gxRef.current;
    if (!el) return;
    const sl = el.scrollLeft;
    const head = axisRef.current;
    if (head && head.scrollLeft !== sl) { head.scrollLeft = sl; axisSl.current = head.scrollLeft; }
    if (pickX != null) {
      secRef.current?.style.setProperty('--pa', `${pickX - sl}px`);
      secRef.current?.style.setProperty('--pb', `${pickX + pickW - sl}px`);
    }
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

  // 단위를 바꾸면 고른 날은 푼다(일 단위 하루 ↔ 주 · 달 단위 한 주 — 뜻이 달라진다)
  const pickZoom = (z: Zoom) => { setZoom(z); rememberZoom(z); setPick(null); };
  const togglePick = (iso: string) => setPick((p) => (p === iso ? null : iso));
  // 머리가 스스로 넘어갔을 때만(키보드로 화면 밖 숫자 단추에 갔을 때) 본문을 따라 옮긴다 — 본문이 옮긴 것(sync)은 그냥 둔다
  const onAxisScroll = () => {
    const head = axisRef.current;
    const el = gxRef.current;
    if (!head || !el || Math.abs(head.scrollLeft - axisSl.current) < 1) return;
    axisSl.current = head.scrollLeft;
    el.scrollLeft = head.scrollLeft;
  };
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
  // 줄 누르기: 그 줄의 편집 폼이 열려 있으면 닫고(쓰던 글 확인), 아니면 내용 펼치기 · 접기
  const toggleRead = (id: string) => {
    if (editing?.kind === 'edit' && editing.id === id) { void switchEdit(null); return; }
    setReading((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  // 연필: 펼친 내용을 접고 그 자리 편집 폼
  const startEdit = (id: string) => {
    setReading((o) => { const n = new Set(o); n.delete(id); return n; });
    void switchEdit({ kind: 'edit', id });
  };
  // 휴지통: 확인 없이 지우고 8초 「되돌리기」(세부 항목이 있으면 같이 지워지고 같이 돌아온다)
  const quickDelete = async (id: string, kidCount: number) => {
    const r = await progress.send({ op: 'task.delete', id });
    if (r.ok) progress.toast(kidCount ? `할 일 1개와 세부 항목 ${kidCount}개를 삭제했어요.` : '할 일을 삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void progress.send({ op: 'task.restore', id }) } });
  };
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
    <section ref={secRef} className={`${s.gantt} ${pick ? s.picking : ''} overflow-clip rounded-panel border border-line bg-surface`} style={{ '--vw': `${vw}px` } as CSSProperties} aria-label="단계별 일정">
      <div className={s.tools}>
        <div className={s.zoom}>
          {/* 고르개는 사이트 한 모양(Segmented — 굵은 글자 + 아래 2px 선, 바로 위 「요약 · 단계 · 달력」과 같음) */}
          <Segmented label="시간 단위" value={zoom} onChange={pickZoom} options={ZOOMS.map((z) => ({ value: z, label: ZOOM_LABEL[z] }))} />
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

      <div ref={axisRef} className={s.axisWrap} onScroll={onAxisScroll}>
        <div className={s.axis} style={{ width: W }} role="group" aria-label={zoom === 'day' ? '날짜 고르기' : '주 고르기'}>
          {pickX != null && <i className={s.pick} style={{ left: pickX, width: pickW }} aria-hidden />}
          {ax.lines.map((l) => <i key={`l${l.x}`} className={`${s.gl} ${l.kind === 'month' ? s.m : l.kind === 'faint' ? s.faint : ''}`} style={{ left: l.x }} aria-hidden />)}
          {/* 달 이름: 그달 칸(달이 바뀌는 선 ~ 다음 선) 안에서 왼쪽에 붙는다 — 1일이 화면 밖으로 나가도 맨 왼쪽에 남고, 다음 달 이름이 밀어낸다 */}
          {ax.months.map((m) => <span key={`m${m.x}`} className={s.axMs} style={{ left: m.x, width: m.w }} aria-hidden><span className={s.axM}>{m.text}</span></span>)}
          {/* 날짜 숫자 = 고르기 단추(누르는 칸 높이 44 · 폭 = 일 칸, 주 · 달 단위는 그 주 7일 폭). 일 단위 오늘 숫자도 단추(모양만 오늘 색) */}
          {ax.days.map((d) => {
            const dt = toDate(d.iso);
            const on = d.iso === pick;
            return (
              <button key={d.iso} type="button" aria-pressed={on} onClick={() => togglePick(d.iso)}
                aria-label={`${dt.getMonth() + 1}월 ${dt.getDate()}일${d.today ? ' 오늘' : ''}${zoom === 'day' ? '' : '부터 한 주'} 고르기`}
                className={`${s.axB} ${zoom === 'day' ? '' : s.wk} ${d.today ? s.axTodayD : ''} ${d.hidden ? s.axHid : ''}`}
                style={{ left: zoom === 'day' ? d.x - dw / 2 : d.x, width: pickW }}>
                <span className={s.axN}>{d.text}</span>
              </button>
            );
          })}
          {/* 「오늘 27」 글자는 축 첫머리에서 잘리지 않게(오늘이 첫 칸 근처면 글자만 조금 안쪽으로) */}
          {ax.todayX != null && zoom !== 'day' && <span className={s.axToday} style={{ left: ax.labelX ?? ax.todayX }} aria-hidden>{ax.todayText}</span>}
        </div>
      </div>

      <div ref={gxRef} className={s.gx} onScroll={onScroll} {...dragScroll}>
        <div ref={canvasRef} className={s.canvas} style={{ width: W }}>
          <div className={s.grid} aria-hidden>
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
                    reading={reading.has(r.t.id)} onRead={() => toggleRead(r.t.id)} onEdit={() => startEdit(r.t.id)}
                    onDelete={() => void quickDelete(r.t.id, r.k === 'task' ? r.kids.length : 0)}
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
          {/* 고른 날 면(오늘 선 · 막대 아래, 칸 선 위 — 옅어서 칸 선이 비친다) */}
          {pickX != null && <i className={s.pick} style={{ left: pickX, width: pickW }} aria-hidden />}
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
