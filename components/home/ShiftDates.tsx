'use client';

import { useState } from 'react';
import { shortDate } from '@/lib/client/format';
import type { ProgressDoc } from '@/lib/core/types';
import { useProgress } from '@/components/progress/ProgressProvider';
import { btnGhost, btnPrimary, composerCls, dateCls } from '@/components/ui/buttonCls';
import { Segmented } from '@/components/ui/Segmented';

// 「이 날 이후 일정 밀기 · 당기기」: 고른 날(from) 이후의 안 끝난 할 일 마감일과 안 끝난 단계 목표일을 같은 날수만큼 옮긴다.
// 미리 보기(무엇이 몇 개, 어떻게 바뀌나) → 「n개 옮기기」 → 기존 연산(task.update · step.update)으로 하나씩 저장.
// 저장 뒤 알림의 「되돌리기」는 같은 것들을 같은 날수만큼 반대로 옮긴다(그 사이 누가 고쳤으면 충돌 창이 뜬다).
const toDate = (iso: string) => new Date(`${iso}T00:00:00`);
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso: string, n: number) => { const d = toDate(iso); d.setDate(d.getDate() + n); return isoOf(d); };

interface Move { kind: 'task' | 'step'; id: string; stepId: number; label: string; date: string }

function targets(doc: ProgressDoc, from: string, titleOf: (id: number) => string): Move[] {
  const out: Move[] = [];
  Object.entries(doc.steps).forEach(([k, s]) => {
    if (s.status !== 'done' && s.targetDate && s.targetDate >= from) out.push({ kind: 'step', id: k, stepId: Number(k), label: `${k}단계 ${titleOf(Number(k))} 목표일`, date: s.targetDate });
  });
  Object.values(doc.tasks).forEach((t) => {
    if (!t.deletedAt && !t.done && t.due && t.due >= from) out.push({ kind: 'task', id: t.id, stepId: t.stepId, label: t.text, date: t.due });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.stepId - b.stepId);
}

/** getDoc: 늘 최신 현황(하나씩 보내는 동안 · 되돌리기 때 바뀐 version 을 쓴다). 이 창이 닫혀도 살아 있는 부모가 들고 있다. */
export function ShiftDates({ from, titleOf, onClose, getDoc }: {
  from: string; titleOf: (id: number) => string; onClose: () => void; getDoc: () => ProgressDoc | null;
}) {
  const { doc, send, toast } = useProgress();
  const [dir, setDir] = useState<'later' | 'earlier'>('later');
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);
  if (!doc) return null;

  const n = Math.trunc(Number(days));
  const valid = Number.isFinite(n) && n >= 1 && n <= 365;
  const delta = dir === 'later' ? n : -n;
  const list = targets(doc, from, titleOf);
  const taskN = list.filter((m) => m.kind === 'task').length;
  const stepN = list.length - taskN;

  // 지금 문서의 version 으로 하나씩 보낸다(되돌리기도 같은 함수)
  const apply = async (moves: Move[], d: number) => {
    let ok = 0;
    for (const m of moves) {
      const cur = getDoc();
      if (!cur) break;
      if (m.kind === 'task') {
        const t = cur.tasks[m.id];
        if (!t?.due) continue;
        const r = await send({ op: 'task.update', id: t.id, baseVersion: t.version, patch: { due: addDays(t.due, d) } }, { quiet: true });
        if (r.ok) ok += 1;
      } else {
        const s = cur.steps[m.id];
        if (!s?.targetDate) continue;
        const r = await send({ op: 'step.update', stepId: m.stepId, baseVersion: s.version ?? 0, patch: { targetDate: addDays(s.targetDate, d) } }, { quiet: true });
        if (r.ok) ok += 1;
      }
    }
    return ok;
  };

  const run = async () => {
    if (!valid || list.length === 0) return;
    setBusy(true);
    const ok = await apply(list, delta);
    setBusy(false);
    onClose();
    const word = delta > 0 ? '밀었어요' : '당겼어요';
    toast(`${ok}개를 ${n}일 ${word}.${ok < list.length ? ` ${list.length - ok}개는 못 옮겼어요.` : ''}`, {
      ms: 10000,
      action: { label: '되돌리기', run: () => { void apply(list, -delta).then((back) => toast(`${back}개를 원래 날짜로 되돌렸어요.`)); } },
    });
  };

  return (
    <div className={composerCls} role="group" aria-label="일정 한꺼번에 옮기기">
      <p className="text-base font-semibold text-ink">{shortDate(from)}부터 뒤 일정 옮기기</p>
      <p className="text-sm font-normal text-muted">안 끝난 할 일 마감일 {taskN}개와 단계 목표일 {stepN}개가 같은 날수만큼 움직여요.</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-40 flex-1">
          <Segmented label="옮길 쪽" value={dir} onChange={setDir} options={[{ value: 'later', label: '뒤로 밀기' }, { value: 'earlier', label: '앞으로 당기기' }]} />
        </div>
        <label className="flex items-center gap-2 text-sm font-normal text-ink-soft">
          <input type="number" inputMode="numeric" min={1} max={365} className={`${dateCls} w-24`} value={days} onChange={(e) => setDays(e.target.value)} aria-label="옮길 날수" />일
        </label>
      </div>
      {valid && list.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm font-normal text-ink-soft" aria-label="바뀌는 것 미리 보기">
          {list.slice(0, 6).map((m) => (
            <li key={`${m.kind}${m.id}`} className="flex min-w-0 gap-x-3">
              <span className="shrink-0 whitespace-nowrap text-ink">{shortDate(m.date)} → {shortDate(addDays(m.date, delta))}</span>
              <span className="min-w-0 truncate text-muted">{m.label}</span>
            </li>
          ))}
          {list.length > 6 && <li className="text-muted">그 밖에 {list.length - 6}개</li>}
        </ul>
      )}
      {list.length === 0 && <p className="text-sm font-normal text-muted">이 날 뒤로 옮길 일정이 없어요.</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onClose}>취소</button>
        <button type="button" className={btnPrimary} disabled={busy || !valid || list.length === 0} onClick={() => void run()}>
          {list.length}개 옮기기
        </button>
      </div>
    </div>
  );
}
