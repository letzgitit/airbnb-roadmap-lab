'use client';

import { useId, useState } from 'react';
import { TASK_KINDS, type StepStatus, type TaskKind } from '@/lib/core/types';
import { dateCls } from '@/components/ui/buttonCls';
import { dueLabel, shortDate, todayStr } from '@/lib/client/format';
import { useProgress } from '@/components/progress/ProgressProvider';
import { Card, cardRowCls } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';

// 홈 「단계」의 날짜순 보기(로그인했을 때만 그린다 — 실제 날짜는 /api/progress 로 받은 현황에만 있다).
// 단계 목표일(steps[n].targetDate)과 할 일 마감(tasks[*].due)을 한 줄로 세워 주(월~일)로 묶는다.
//   지난 주들 → 「지난 일정 n개」 한 줄로 접음 / 「기한 지남」(지난 주의 안 끝난 할 일 · 단계, 늘 펼침) / 이번 주(늘 보임, 「지금」 면 + 「오늘」 선)
//   / 다음 주 / n주 뒤 … / 「날짜 없음 n개」(접음)
// 줄을 누르면 그 단계 창이 열린다(할 일 체크 · 고치기는 「할 일」 구역과 단계 창에서만 — 같은 일을 하는 길을 둘 두지 않는다).
// 할 일 줄 보조 줄에 종류(있으면)를 붙이고, 위의 「종류」 고르기로 그 종류의 할 일만 본다(고르면 단계 목표일 줄은 빠진다).
//   종류가 8가지라 칸 묶음(Segmented, 5칸까지) 대신 <select>(DESIGN.md 8장).
// 줄 앞 44px: 단계 목표일 = 깃발, 끝낸 것 = 체크, 안 끝난 할 일 = 빈 칸(체크 칸으로 오해하지 않게 모양을 넣지 않는다).
// 안 끝났는데 날짜가 지난 것 = 「n일 지남」 빨강(여러 줄 사이에 섞여 보이므로). 「기한 지남」 묶음 안에서는 묶음 이름만 빨강이고 줄은 muted.
export interface DateStep { id: number; title: string }

type Item =
  | { kind: 'step'; key: string; date: string | null; stepId: number; index: number; title: string; done: boolean }
  | { kind: 'task'; key: string; date: string | null; stepId: number; index: number; title: string; done: boolean; stepTitle: string; taskKind: TaskKind | null };

const MS_DAY = 86400000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00`);
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** 그 날짜가 든 주의 월요일 */
function mondayOf(iso: string): string {
  const d = toDate(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoOf(d);
}
const addDays = (iso: string, n: number) => { const d = toDate(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const weeksBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / (7 * MS_DAY));

function weekName(diff: number): string {
  if (diff === 0) return '이번 주';
  if (diff === 1) return '다음 주';
  if (diff === -1) return '지난주';
  return diff > 0 ? `${diff}주 뒤` : `${-diff}주 전`;
}

// 같은 날이면 단계 목표가 먼저, 그다음 단계 번호 → 만든 순(목록에 들어온 순)
const byDate = (a: Item, b: Item) =>
  (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.kind === b.kind ? 0 : a.kind === 'step' ? -1 : 1) || a.stepId - b.stepId;

export function DateTimeline({ steps, statuses, onStep }: {
  steps: DateStep[];
  statuses: Record<number, StepStatus | undefined>;
  onStep: (index: number) => void;
}) {
  const { doc } = useProgress();
  const uid = useId();
  const [showPast, setShowPast] = useState(false);
  const [showNoDate, setShowNoDate] = useState(false);
  const [filter, setFilter] = useState<TaskKind | ''>('');
  if (!doc) return null;

  const today = todayStr();
  const thisMonday = mondayOf(today);
  const indexOf = new Map(steps.map((s, i) => [s.id, i]));
  const titleOf = new Map(steps.map((s) => [s.id, s.title]));

  const items: Item[] = [];
  if (!filter) steps.forEach((s, i) => {
    items.push({ kind: 'step', key: `s${s.id}`, date: doc.steps[String(s.id)]?.targetDate ?? null, stepId: s.id, index: i,
      title: `${s.id}. ${s.title}`, done: statuses[s.id] === 'done' });
  });
  Object.values(doc.tasks).forEach((t) => {
    if (t.deletedAt) return;
    if (filter && t.kind !== filter) return;
    const index = indexOf.get(t.stepId);
    if (index == null) return;
    items.push({ kind: 'task', key: `t${t.id}`, date: t.due, stepId: t.stepId, index, title: t.text, done: t.done,
      stepTitle: `${t.stepId}단계 ${titleOf.get(t.stepId) ?? ''}`.trim(), taskKind: t.kind ?? null });
  });
  items.sort(byDate);

  const noDate = items.filter((x) => !x.date);
  // 주 묶음: 월요일 날짜 → 줄들. 이번 주는 비어 있어도 만든다(「오늘」 선이 늘 보이게).
  const weeks = new Map<string, Item[]>([[thisMonday, []]]);
  items.forEach((x) => {
    if (!x.date) return;
    const m = mondayOf(x.date);
    if (!weeks.has(m)) weeks.set(m, []);
    weeks.get(m)!.push(x);
  });
  const ordered = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));
  // 지난 주의 안 끝난 할 일 · 단계 목표일은 접지 않고 「기한 지남」 묶음으로 뺀다(지난 일정 개수에서도 뺀다)
  const isLateTask = (x: Item) => !x.done;
  const lateTasks = ordered.filter(([m]) => m < thisMonday).flatMap(([, xs]) => xs.filter(isLateTask));
  const past = ordered.filter(([m]) => m < thisMonday)
    .map(([m, xs]) => [m, xs.filter((x) => !isLateTask(x))] as [string, Item[]])
    .filter(([, xs]) => xs.length > 0);
  const coming = ordered.filter(([m]) => m >= thisMonday);
  const pastCount = past.reduce((n, [, xs]) => n + xs.length, 0);

  const row = (x: Item, quietLate = false) => {
    const dl = x.date ? dueLabel(x.date, today) : null;
    const late = !!dl?.late && !x.done && !quietLate;
    const icon = x.done ? 'fas fa-check' : x.kind === 'step' ? 'fas fa-flag' : null;
    return (
      <li key={x.key} className={cardRowCls}>
        <button type="button" onClick={() => onStep(x.index)}
          className="flex min-h-11 w-full items-start text-left transition-colors hover:bg-sunken active:bg-sunken focus-visible:-outline-offset-2">
          <span className="flex size-11 shrink-0 items-center justify-center text-sm text-muted" aria-hidden>{icon && <i className={icon} />}</span>
          <span className="min-w-0 flex-1 py-3 pr-4">
            <span className={`block text-base font-semibold ${x.done ? 'text-muted' : 'text-ink'}`}>
              {x.title}
              {x.done && <span className="sr-only"> (완료)</span>}
            </span>
            {/* 보조 줄은 한 줄로 고정(할 일 줄 TaskRow 와 같은 모양): 날짜 · 남은 날 · 종류는 줄지 않고, 단계 이름만 말줄임. 항목 사이 12px */}
            <span className="mt-0.5 flex min-w-0 items-center gap-x-3 text-sm font-normal text-muted empty:hidden">
              {dl && <span className={`shrink-0 whitespace-nowrap ${x.done || quietLate ? '' : 'text-ink-soft'}`}>{dl.date}</span>}
              {dl && !x.done && <span className={`shrink-0 whitespace-nowrap ${late ? 'text-danger-ink' : ''}`}>{dl.rel}</span>}
              {x.kind === 'task' && x.taskKind && <span className="shrink-0 whitespace-nowrap">{x.taskKind}</span>}
              {x.kind === 'task' && <span className="min-w-0 truncate">{x.stepTitle}</span>}
            </span>
          </span>
        </button>
      </li>
    );
  };

  // 이번 주 안에서 「오늘」 선은 오늘보다 앞선 날짜의 줄 다음에 둔다(오늘 날짜의 줄은 선 아래)
  const todayLine = (
    <li key="today" className={`${cardRowCls} flex items-center gap-3 px-4 py-2`} aria-label={`오늘 ${shortDate(today)}`}>
      <span className="text-sm font-bold text-accent-ink">오늘 {shortDate(today)}</span>
      <span className="h-px flex-1 bg-accent-ink" aria-hidden />
    </li>
  );

  const week = ([monday, xs]: [string, Item[]]) => {
    const diff = weeksBetween(thisMonday, monday);
    const isThis = diff === 0;
    const before = isThis ? xs.filter((x) => x.date! < today) : [];
    const after = isThis ? xs.filter((x) => x.date! >= today) : xs;
    const hid = `${uid}-w${monday}`;
    return (
      <section key={monday} aria-labelledby={hid} className={`${cardRowCls} ${isThis ? 'bg-accent-soft' : ''}`}>
        <h3 id={hid} className="flex flex-wrap items-baseline gap-x-3 px-4 pt-3 pb-1 text-sm">
          <span className={`font-bold ${isThis ? 'text-ink' : 'text-ink-soft'}`}>{weekName(diff)}</span>
          <span className="font-normal text-muted">{shortDate(monday)}~{shortDate(addDays(monday, 6))}</span>
        </h3>
        <ul>
          {before.map((x) => row(x))}
          {isThis && todayLine}
          {after.map((x) => row(x))}
        </ul>
      </section>
    );
  };

  // 종류별 개수(지운 할 일 빼고). 고르기 칸에 「연락 3」처럼 붙인다.
  const kindCount = new Map<TaskKind, number>();
  Object.values(doc.tasks).forEach((t) => { if (!t.deletedAt && t.kind) kindCount.set(t.kind, (kindCount.get(t.kind) ?? 0) + 1); });

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm font-normal text-ink-soft">종류
        <select className={dateCls} value={filter} onChange={(e) => setFilter(e.target.value as TaskKind | '')} aria-label="종류로 걸러 보기">
          <option value="">전체</option>
          {/* 0개인 종류는 고를 수 없게(빈 목록만 나오므로) */}
          {TASK_KINDS.map((k) => { const n = kindCount.get(k) ?? 0; return <option key={k} value={k} disabled={n === 0}>{n ? `${k} ${n}` : k}</option>; })}
        </select>
      </label>
      <Card aria-label="날짜순 일정">
        {filter && items.length === 0 && <p className={`${cardRowCls} px-4 py-3 text-base text-muted`}>「{filter}」 할 일이 없어요.</p>}
        {past.length > 0 && (
          <div className={cardRowCls}>
            <FoldRow label="지난 일정" count={pastCount} open={showPast}
              onToggle={() => setShowPast((v) => !v)} controls={`${uid}-past`} />
            {showPast && <div id={`${uid}-past`} className="border-t border-line">{past.map(week)}</div>}
          </div>
        )}
        {lateTasks.length > 0 && (
          <section aria-labelledby={`${uid}-late`} className={cardRowCls}>
            <h3 id={`${uid}-late`} className="px-4 pt-3 pb-1 text-sm font-bold text-danger-ink">기한 지남</h3>
            <ul>{lateTasks.map((x) => row(x, true))}</ul>
          </section>
        )}
        {coming.map(week)}
        {noDate.length > 0 && (
          <div className={cardRowCls}>
            <FoldRow label="날짜 없음" count={noDate.length} open={showNoDate} onToggle={() => setShowNoDate((v) => !v)} controls={`${uid}-nodate`} />
            {showNoDate && <ul id={`${uid}-nodate`} className="border-t border-line">{noDate.map((x) => row(x))}</ul>}
          </div>
        )}
      </Card>
    </div>
  );
}
