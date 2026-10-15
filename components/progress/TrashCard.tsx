'use client';

import { useState } from 'react';
import { relTime, withGa } from '@/lib/client/format';
import type { Op } from '@/lib/core/validate';
import { useProgress } from './ProgressProvider';
import { btnGhost, textBtn } from './bits';

interface Row { key: string; kind: string; text: string; by: string | null; at: string; restore: Op }

// 삭제한 항목(할 일·매물 정보·기록)을 복원하는 곳은 여기 한 곳뿐이다. 30일 지나면 서버가 정리한다.
export function TrashCard() {
  const { doc, send } = useProgress();
  const [open, setOpen] = useState(false);
  if (!doc) return null;

  const rows: Row[] = [
    ...Object.values(doc.tasks).filter((t) => t.deletedAt).map((t) => ({ key: t.id, kind: `할 일 ${t.stepId}단계`, text: t.text, by: t.deletedBy, at: t.deletedAt!, restore: { op: 'task.restore', id: t.id } as Op })),
    ...Object.values(doc.property).filter((p) => p.deletedAt).map((p) => ({ key: p.id, kind: '집 정보', text: `${p.label}: ${p.value}`, by: p.deletedBy, at: p.deletedAt!, restore: { op: 'property.restore', id: p.id } as Op })),
    ...doc.log.filter((l) => l.deletedAt).map((l) => ({ key: l.id, kind: `기록 ${l.kind}`, text: l.text, by: l.deletedBy, at: l.deletedAt!, restore: { op: 'log.restore', id: l.id } as Op })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (rows.length === 0) return null;

  return (
    // 「집 정보 · 기록」 창 맨 아래 한 줄(기본 접힘). 창이 바깥 틀이라 카드 테두리·바깥 여백은 두지 않는다.
    <section className="mt-8 border-t border-slate-200 pt-3" aria-label="삭제한 항목">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2"><i className="fas fa-trash-can text-slate-500" aria-hidden /> 삭제한 항목 <span className="text-slate-500 font-semibold">{rows.length}</span></h3>
        <button type="button" className={textBtn} onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? '접기' : '보기'}</button>
      </div>
      {open && (
        <>
          <p className="mt-1 text-[13px] text-slate-500">지운 지 30일이 지나면 완전히 사라져요.</p>
          <ul className="mt-2">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-3 border-b border-slate-200 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-slate-500">{r.kind}</div>
                  <div className="text-[15px] font-semibold leading-relaxed text-slate-700">{r.text}</div>
                  <div className="text-[13px] font-semibold text-slate-500 flex flex-wrap gap-x-2"><span>{r.by ? `${withGa(r.by)} 삭제` : '삭제'}</span><span>{relTime(r.at)}</span></div>
                </div>
                <button type="button" className={btnGhost} onClick={() => void send(r.restore)}>복원</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
