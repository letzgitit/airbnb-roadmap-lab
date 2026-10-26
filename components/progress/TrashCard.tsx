'use client';

import { useId, useState } from 'react';
import { relTime, withGa } from '@/lib/client/format';
import type { Op } from '@/lib/core/validate';
import { Card } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { useProgress } from './ProgressProvider';
import { btnGhost } from './bits';

type Kind = 'task' | 'property' | 'log';
interface Row { key: string; kind: string[]; text: string; by: string | null; at: string; restore: Op }

const TITLE: Record<Kind, string> = { task: '삭제한 할 일', property: '삭제한 집 정보', log: '삭제한 기록' };
const ALL: Kind[] = ['task', 'property', 'log'];

// 목록 맨 아래 「삭제한 ○○ n개」(기본 접힘). kinds 로 그 목록의 것만 보인다(없으면 할 일 · 집 정보 · 기록 모두).
// 지운 것을 되살리는 곳은 여기다. 30일 지나면 서버가 정리한다(lib/core/engine.ts TRASH_KEEP_MS).
export function TrashCard({ kinds = ALL }: { kinds?: Kind[] }) {
  const { doc, send } = useProgress();
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (!doc) return null;

  const want = new Set(kinds);
  const many = want.size > 1;
  const rows: Row[] = [
    ...(want.has('task') ? Object.values(doc.tasks).filter((t) => t.deletedAt).map((t) => ({ key: t.id, kind: many ? ['할 일', `${t.stepId}단계`] : [`${t.stepId}단계`], text: t.text, by: t.deletedBy, at: t.deletedAt!, restore: { op: 'task.restore', id: t.id } as Op })) : []),
    ...(want.has('property') ? Object.values(doc.property).filter((p) => p.deletedAt).map((p) => ({ key: p.id, kind: many ? ['집 정보'] : [], text: `${p.label}: ${p.value}`, by: p.deletedBy, at: p.deletedAt!, restore: { op: 'property.restore', id: p.id } as Op })) : []),
    ...(want.has('log') ? doc.log.filter((l) => l.deletedAt).map((l) => ({ key: l.id, kind: (many ? ['기록', l.kind] : [l.kind]).filter(Boolean), text: l.text, by: l.deletedBy, at: l.deletedAt!, restore: { op: 'log.restore', id: l.id } as Op })) : []),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (rows.length === 0) return null;

  const title = many ? '삭제한 항목' : TITLE[kinds[0]];
  return (
    <Card as="section" aria-label={title} className="mt-8">
      <FoldRow label={title} count={rows.length} open={open} onToggle={() => setOpen((v) => !v)} controls={listId} />
      {open && (
        <div id={listId} className="border-t border-line">
          <p className="px-4 pt-3 text-sm text-muted">지운 지 30일이 지나면 완전히 사라져요.</p>
          <ul>
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  {r.kind.length > 0 && <div className="flex flex-wrap gap-x-3 text-sm text-muted">{r.kind.map((k, i) => <span key={i}>{k}</span>)}</div>}
                  <div className="break-words text-base font-semibold text-ink-soft">{r.text}</div>
                  <div className="flex flex-wrap gap-x-2 text-sm text-muted"><span>{r.by ? `${withGa(r.by)} 삭제` : '삭제'}</span><span>{relTime(r.at)}</span></div>
                </div>
                <button type="button" className={btnGhost} onClick={() => void send(r.restore)}>되살리기</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
