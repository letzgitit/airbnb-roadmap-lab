'use client';

import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { dayRangeLabel, shortDate } from '@/lib/client/format';
import { addDays, diffDays } from '../step-dates';
import { isLate, taskRange, type GTask, type Phase, type Row } from './gantt-model';
import { daysFromPx } from './gantt-scale';
import s from './gantt.module.css';
import { Check, Chev, Plus } from './icons';

// 간트 한 줄씩(단계 머리 · 할 일 · 세부 항목 · 할 일 추가 · 끝난 단계 접기 · 묶음 사이 · 편집 폼 자리).
// 줄 = 이름 줄(nl, 보이는 폭만큼 왼쪽에 붙음) + 막대 줄(bl, 날짜 배율로 가로로 넘어감).
// 트리 선 자리(px): 단계 번호 원 가운데 R1 · 할 일 동그라미 가운데 R2 · 세부 항목 동그라미 가운데 R3.
const R1 = 43, R2 = 66, R3 = 92;

export interface Geo { x: (iso: string) => number; cx: (iso: string) => number; dw: number }
export type DragMode = 'move' | 'start' | 'end';

const cls = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
export const typeVars = (type: string) => ({ '--c': `var(--type-${type})`, '--cs': `var(--type-${type}-soft)`, '--ci': `var(--type-${type}-ink)` }) as CSSProperties;
const px = (v: Record<string, number | string>) => v as CSSProperties;

type Railed = { k: string; more1: boolean; more2: boolean; lv?: 1 | 2 };

/** 이름 줄의 트리 선: 높이 h, 동그라미 가운데 높이 mid */
function RailsName({ r, h, mid }: { r: Railed; h: number; mid: number }) {
  const out: ReactNode[] = [];
  if (r.k === 'phase' && r.more1) out.push(<i key="p" className={cls(s.rail, s.L1)} style={{ left: R1, top: mid, height: h - mid }} />);
  if (r.lv === 1) {
    const nodeL = R2 - 10;
    if (r.more1) {
      out.push(<i key="r1" className={cls(s.rail, s.L1)} style={{ left: R1, top: 0, height: h }} />);
      out.push(<i key="t1" className={cls(s.tick, s.L1)} style={{ left: R1, top: mid, width: nodeL - R1 }} />);
    } else out.push(<i key="e1" className={cls(s.elbow, s.L1)} style={{ left: R1, height: mid + 1, width: nodeL - R1 + 1 }} />);
    if (r.k === 'task' && r.more2) out.push(<i key="r2" className={cls(s.rail, s.L2)} style={{ left: R2, top: mid, height: h - mid }} />);
  }
  if (r.lv === 2) {
    const nodeL = R3 - 6;
    if (r.more1) out.push(<i key="r1" className={cls(s.rail, s.L1)} style={{ left: R1, top: 0, height: h }} />);
    if (r.more2) {
      out.push(<i key="r2" className={cls(s.rail, s.L2)} style={{ left: R2, top: 0, height: h }} />);
      out.push(<i key="t2" className={cls(s.tick, s.L2)} style={{ left: R2, top: mid, width: nodeL - R2 }} />);
    } else out.push(<i key="e2" className={cls(s.elbow, s.L2)} style={{ left: R2, height: mid + 1, width: nodeL - R2 + 1 }} />);
  }
  return <>{out}</>;
}

/** 막대 줄 왼쪽 끝(붙음): 이어지는 트리 선 + 화면 밖 왼쪽 조각 */
function Gut({ r }: { r: Railed }) {
  return (
    <div className={s.gut} aria-hidden>
      {r.more1 && <i className={cls(s.rail, s.L1)} style={{ left: R1, top: 0, bottom: 0 }} />}
      {r.more2 && <i className={cls(s.rail, s.L2)} style={{ left: R2, top: 0, bottom: 0 }} />}
      <i className={s.stub} />
    </div>
  );
}
const GutR = () => <span className={s.gutR} aria-hidden><i className={s.stub} /></span>;

export function SepRow({ gap }: { gap: boolean }) {
  return <div className={gap ? s.rGap : s.rSep} aria-hidden />;
}

export function FoldRow({ n, open, onToggle }: { n: number; open: boolean; onToggle: () => void }) {
  return (
    <div className={cls(s.r, s.rFold, open && s.foldOn)}>
      <div className={s.nl}>
        <button type="button" className={s.foldBtn} aria-expanded={open} onClick={onToggle}>
          <b>끝난 단계</b><span>{n}개</span>
          <span className={s.chev2}><Chev /></span>
        </button>
      </div>
    </div>
  );
}

export function PhaseRow({ r, geo, open, guest, onToggle, onStep }: {
  r: Extract<Row, { k: 'phase' }>; geo: Geo; open: boolean; guest: boolean;
  onToggle: () => void; onStep: () => void;
}) {
  const p = r.p;
  const left = geo.x(p.from);
  const w = (diffDays(p.from, p.to) + 1) * geo.dw;
  const tx = p.target ? geo.cx(p.target) : null;
  const period = guest ? dayRangeLabel(p.start, p.end) : `~${shortDate(p.target ?? p.to)}`;
  return (
    <div className={cls(s.r, s.rPhase, !open && !guest && s.shut, p.done && s.done, guest && s.guest)} style={typeVars(p.type)} onClick={onStep}>
      <div className={s.nl}>
        {!guest && <RailsName r={r} h={62} mid={21} />}
        {!guest && (
          <button type="button" className={s.chevBtn} aria-expanded={open} aria-label={`${p.id}단계 할 일 ${open ? '접기' : '펴기'}`}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}>
            <Chev />
          </button>
        )}
        <span className={cls(s.badge, !p.done && !p.started && s.todo)} aria-hidden>{p.done ? <Check /> : p.id}</span>
        <div className={s.pTop}>
          <button type="button" className={s.pName}
            aria-label={`${p.id}단계 ${p.title}, ${guest ? period : `목표 ${shortDate(p.target ?? p.to)}, 할 일 ${p.leafTotal}개 중 ${p.leafDone}개 끝남`}${p.current ? ', 지금' : ''}${p.done ? ', 끝난 단계' : ''}. 자세히 보기`}>
            {p.title}
          </button>
          {p.current && <span className={s.now}>지금</span>}
        </div>
        <div className={s.pSub} aria-hidden>
          <span>{period}</span>
          {!guest && <span>할 일 <b>{p.leafDone}</b>/{p.leafTotal}</span>}
        </div>
      </div>
      <div className={s.bl} data-a={left} data-b={Math.max(left + w, tx != null ? tx + 76 : 0)} aria-hidden>
        <Gut r={r} />
        <div className={s.sb} style={{ left, width: w }}><i style={{ width: `${p.pct}%` }} /></div>
        {tx != null && <><i className={s.dia} style={{ left: tx }} /><span className={s.diaL} style={{ left: tx }}>목표 {shortDate(p.target!)}</span></>}
        <GutR />
      </div>
    </div>
  );
}

/** 날짜 글자: 늦음 「n일 지남」(빨강, 한 번만) · 오늘 마감 「오늘까지」 · 기간 「10/28~10/30」(폰은 「~10/30」) · 하루 「11/9」 */
function dateText(t: GTask, today: string, phone: boolean): { text: string; tone: 'late' | 'today' | '' } {
  if (isLate(t, today)) return { text: `${diffDays(t.due!, today)}일 지남`, tone: 'late' };
  if (!t.done && t.due === today) return { text: '오늘까지', tone: 'today' };
  if (t.start && t.due && t.start !== t.due) return { text: phone ? `~${shortDate(t.due)}` : `${shortDate(t.start)}~${shortDate(t.due)}`, tone: '' };
  if (t.due) return { text: shortDate(t.due), tone: '' };
  if (t.start) return { text: `${shortDate(t.start)}~`, tone: '' };
  return { text: '', tone: '' };
}

export function TaskRow({ r, geo, today, phone, kidsOpen, canDrag, onEdit, onToggleDone, onToggleKids, onDrag }: {
  r: Extract<Row, { k: 'task' | 'sub' }>; geo: Geo; today: string; phone: boolean; kidsOpen: boolean; canDrag: boolean;
  onEdit: () => void; onToggleDone: () => void; onToggleKids: () => void;
  onDrag: (mode: DragMode, days: number) => void;
}) {
  const t = r.t;
  const sub = r.k === 'sub';
  const kids = r.k === 'task' ? r.kids : [];
  const nh = sub ? 26 : kids.length ? 58 : 32;
  const my = sub ? 15 : 19;
  const nx = sub ? R3 : R2;
  const range = taskRange(t, kids);
  const kd = kids.filter((k) => k.done).length;
  const dt = dateText(t, today, phone);
  return (
    <div className={cls(s.r, sub ? s.rSub : s.rTask, t.done && s.done, kids.length > 0 && s.hasKids)} style={typeVars(r.p.type)} onClick={onEdit}>
      <div className={s.nl} style={px({ '--my': `${my}px` })}>
        <RailsName r={r} h={nh} mid={my} />
        <button type="button" className={s.nodeBtn} style={{ left: nx }} aria-pressed={t.done}
          aria-label={`${t.text} 끝냄`} onClick={(e) => { e.stopPropagation(); onToggleDone(); }} />
        <i className={cls(s.node, t.done && s.nDone)} style={{ left: nx }} aria-hidden>{t.done && !sub ? <Check /> : null}</i>
        <div className={s.tLine}>
          <button type="button" className={s.tName} aria-label={`${t.text}${dt.text ? `, ${dt.text}` : ''}${t.owner ? `, ${t.owner}` : ''}. 고치기`}>{t.text}</button>
          <span className={s.tMeta} aria-hidden>
            {dt.text && <span className={cls(s.dt, dt.tone === 'late' && s.lw, dt.tone === 'today' && s.tw)}>{dt.text}</span>}
            {t.owner && <span className={s.who}>{t.owner}</span>}
          </span>
        </div>
        {kids.length > 0 && (
          <div className={s.kLine}>
            <button type="button" className={cls(s.kids, !kidsOpen && s.kShut)} aria-expanded={kidsOpen}
              aria-label={`세부 항목 ${kids.length}개 중 ${kd}개 끝남, ${kidsOpen ? '접기' : '펴기'}`}
              onClick={(e) => { e.stopPropagation(); onToggleKids(); }}>
              <b>세부</b>{kd}/{kids.length}<Chev />
            </button>
          </div>
        )}
      </div>
      <Bar key={`${range?.from}${range?.to}`} r={r} geo={geo} range={range} point={!!range && range.from === range.to && !kids.length}
        fill={kids.length && !t.done ? Math.round((kd / kids.length) * 100) : null}
        canDrag={canDrag && !!range && !range.derived} onDrag={onDrag} />
    </div>
  );
}

function Bar({ r, geo, range, point, fill, canDrag, onDrag }: {
  r: Extract<Row, { k: 'task' | 'sub' }>; geo: Geo; range: { from: string; to: string } | null; point: boolean; fill: number | null;
  canDrag: boolean; onDrag: (mode: DragMode, days: number) => void;
}) {
  const [drag, setDrag] = useState<{ mode: DragMode; x0: number; d: number } | null>(null);
  const moved = useRef(false);
  if (!range) return <div className={s.bl} aria-hidden><Gut r={r} /></div>;
  let { from, to } = range;
  if (drag) {
    if (drag.mode === 'move') { from = addDays(from, drag.d); to = addDays(to, drag.d); }
    if (drag.mode === 'start') { const n = addDays(from, drag.d); from = n > to ? to : n; }
    if (drag.mode === 'end') { const n = addDays(to, drag.d); to = n < from ? from : n; }
  }
  const pt = point && from === to;
  const a = pt ? geo.cx(to) - 8 : geo.x(from);
  const b = pt ? geo.cx(to) + 8 : geo.x(from) + (diffDays(from, to) + 1) * geo.dw;
  const style = pt ? { left: geo.cx(to) } : { left: geo.x(from) + 1, width: (diffDays(from, to) + 1) * geo.dw - 2 };
  const t = r.t;

  const down = (e: PointerEvent<HTMLElement>) => {
    if (!canDrag || e.pointerType !== 'mouse' || e.button !== 0) return;
    e.stopPropagation(); // 상자 끌어 넘기기와 겹치지 않게
    e.preventDefault();
    const h = (e.target as HTMLElement).dataset.h;
    const mode: DragMode = h === 'start' ? 'start' : h === 'end' ? 'end' : 'move';
    e.currentTarget.setPointerCapture(e.pointerId);
    moved.current = false;
    setDrag({ mode, x0: e.clientX, d: 0 });
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x0) > 4) moved.current = true;
    const d = daysFromPx(e.clientX - drag.x0, geo.dw);
    if (d !== drag.d) setDrag({ ...drag, d });
  };
  const up = () => {
    if (!drag) return;
    const { mode, d } = drag;
    setDrag(null);
    if (d !== 0) onDrag(mode, d);
  };
  const click = (e: MouseEvent) => { if (moved.current) { e.stopPropagation(); moved.current = false; } };

  return (
    <div className={s.bl} data-a={a} data-b={b}>
      <Gut r={r} />
      <i className={cls(s.tb, pt && s.pt, t.done ? s.bDone : fill != null && s.part, canDrag && s.drag, drag && s.dragging)} style={style}
        onPointerDown={canDrag ? down : undefined} onPointerMove={canDrag ? move : undefined} onPointerUp={canDrag ? up : undefined} onPointerCancel={canDrag ? () => setDrag(null) : undefined}
        onClick={canDrag ? click : undefined}
        title={canDrag ? '끌면 날짜가 옮겨져요. 왼쪽 끝을 끌면 시작일만, 오른쪽 끝을 끌면 마감일만 바뀌어요.' : undefined} aria-hidden>
        {fill != null && !t.done && <i className={s.fill} style={{ width: `${fill}%` }} />}
        {canDrag && !pt && <><i className={cls(s.hd, s.hs)} data-h="start" /><i className={cls(s.hd, s.he)} data-h="end" /></>}
      </i>
      {drag && drag.d !== 0 && (
        <span className={s.dragTip} style={{ left: (a + b) / 2 }}>{from === to ? shortDate(to) : `${shortDate(from)}~${shortDate(to)}`}</span>
      )}
      <GutR />
    </div>
  );
}

export function AddRow({ r, onNew }: { r: Extract<Row, { k: 'add' }>; onNew: () => void }) {
  return (
    <div className={cls(s.r, s.rAdd)} style={typeVars(r.p.type)}>
      <div className={s.nl} style={px({ '--my': '22px' })}>
        <RailsName r={r} h={44} mid={22} />
        <i className={s.plus} style={{ left: R2 }} aria-hidden><Plus /></i>
        <button type="button" className={s.addBtn} onClick={onNew}>할 일 추가</button>
      </div>
    </div>
  );
}

/** 편집 폼 자리(폼은 StepGantt 가 넣는다). 이어지는 트리 선만 그린다 */
export function FormRow({ r, children }: { r: Extract<Row, { k: 'form' }>; children: ReactNode }) {
  return (
    <div className={s.r} style={typeVars(r.p.type)} onClick={(e) => e.stopPropagation()}>
      <div className={s.fwrap} style={{ paddingLeft: (r.lv === 2 ? R3 : R2) - 14 }}>
        {r.rail1 && <i className={cls(s.rail, s.L1)} style={{ left: R1, top: 0, bottom: 0 }} aria-hidden />}
        {r.rail2 && r.lv === 2 && <i className={cls(s.rail, s.L2)} style={{ left: R2, top: 0, bottom: 0 }} aria-hidden />}
        {children}
      </div>
    </div>
  );
}

export type { Phase };
