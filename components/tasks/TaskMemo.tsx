'use client';

import { useRef, useState } from 'react';
import type { TaskItem } from '@/lib/core/types';
import { useProgress } from '@/components/progress/ProgressProvider';
import { inputCls } from '@/components/progress/bits';
import { addBtnCls } from '@/components/ui/buttonCls';
import { LineIcon } from '@/components/ui/LineIcon';
import { checkItems, insertCheckLine, memoParts, noteOp, refOf, retryOnConflict, type CheckChange, type CheckItem } from './checklist';

/**
 * 펼친 할 일 메모(할 일 줄 TaskRow · 간트 펼친 칸 TaskDetail 이 같이 쓴다 — 「모두 다 동일하게」).
 * - 체크리스트가 없는 메모: 지금 그대로 줄마다 한 문단(16px · 행간 1.7 · 한 줄 최대 약 36em).
 * - 메모 안 `- [ ] 글` · `- [x] 글` 줄(checklist.ts)은 체크 칸 + 글. 누르면 바로 체크 · 해제(낙관적 반영 — 실패하면 되돌리고 알림),
 *   끝낸 항목은 흐리게 + 가운데 줄. 목록 맨 아래 「＋ 항목」 한 줄 입력(Enter 로 더하고 칸이 남아 이어서 입력, 빈 글이면 아무 일 없음).
 *   항목 고치기 · 지우기 · 순서는 연필(고치는 폼 메모 칸)에서 글로. 모든 항목을 체크해도 할 일은 끝내지 않는다.
 * - 체크 칸: 할 일 체크 칸(22px)보다 한 단 작은 18px 네모 · 같은 결(1.5px 테두리 · 모서리 6, 체크하면 검정 면 + 체크), 누르는 칸은 줄 전체 44px.
 *   체크 칸 네모의 왼쪽 끝 = 메모 글 왼쪽 끝(44px 칸을 13px 왼쪽으로 내민다). 「＋ 항목」의 ＋ 도 같은 자리.
 * - 동시에 두 사람이 체크하면: 메모 전체를 보내므로 서버가 409 로 막고, 최신 메모에 내 체크 하나만 다시 적용해 보낸다(retryOnConflict).
 */
const memoCls = 'max-w-[36em] space-y-2 break-keep text-base font-normal leading-[1.7] text-ink-soft [overflow-wrap:anywhere]';

export function TaskMemo({ t, note }: { t: TaskItem; note: string }) {
  const { send } = useProgress();
  const parts = memoParts(t.note);
  if (!parts.some((p) => p.t === 'check')) {
    return (
      <div className={memoCls}>
        {note.split(/\n+/).map((para, i) => <p key={i} className="whitespace-pre-wrap">{para}</p>)}
      </div>
    );
  }
  const items = checkItems(t.note);
  const lastCheck = parts.map((p) => p.t).lastIndexOf('check');
  const save = (ch: CheckChange) => {
    const op = noteOp(t.id, t, ch);
    if (op) void send(op, { retry: retryOnConflict(t.id, ch) });
  };
  const toggle = (it: CheckItem, done: boolean) => {
    const i = items.findIndex((x) => x.line === it.line);
    if (i >= 0) save({ t: 'set', ref: refOf(items, i), done });
  };
  return (
    <div className={memoCls}>
      {parts.map((p, i) => p.t === 'text'
        ? p.lines.map((l, j) => <p key={`${i}-${j}`} className="whitespace-pre-wrap">{l}</p>)
        : (
          <ul key={i} aria-label="체크리스트">
            {p.items.map((it) => <CheckRow key={it.line} it={it} onChange={(v) => toggle(it, v)} />)}
            {i === lastCheck && <li><AddItem title={t.text} onAdd={(text) => save({ t: 'add', text })} /></li>}
          </ul>
        ))}
    </div>
  );
}

function CheckRow({ it, onChange }: { it: CheckItem; onChange: (done: boolean) => void }) {
  return (
    <li>
      {/* 줄 전체가 누르는 칸(44px). 글이 두 줄로 꺾이면 체크 칸은 첫 줄 가운데.
          flex 가 아닌 block + 체크 칸 absolute — 간트 펼친 칸의 오른쪽에 뜬 연필 · 휴지통(float) 옆에서도 줄이 밀리지 않게(flex 는 float 옆에서 통째로 밀린다) */}
      <label className="relative block min-h-11 cursor-pointer py-[8.5px] pl-[31px]">
        <span className="absolute -left-[13px] top-0 flex size-11 items-center justify-center">
          <input type="checkbox" checked={it.done} onChange={(e) => onChange(e.target.checked)}
            className="peer size-4.5 cursor-pointer appearance-none rounded-chip border-[1.5px] border-faint bg-surface transition-colors checked:border-ink checked:bg-ink" />
          <LineIcon name="check" stroke={2.6} className="pointer-events-none absolute size-3.5 text-surface opacity-0 peer-checked:opacity-100" />
        </span>
        <span className={it.done ? 'text-muted line-through' : undefined}>{it.text}</span>
      </label>
    </li>
  );
}

// 「＋ 항목」: 처음엔 「＋ 사진」과 같은 글자 단추(addBtnCls — ＋ 가 체크 칸 네모 자리), 누르면 같은 자리에 한 줄 입력칸(입력칸 왼쪽 끝 = 항목 글 왼쪽 끝).
// Enter = 더하고 칸을 비워 이어서 입력, 빈 글 Enter = 아무 일 없음, Esc · 빈 칸에서 다른 곳 누름 = 닫기(쓰던 글이 있으면 닫지 않는다)
function AddItem({ title, onAdd }: { title: string; onAdd: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const btn = useRef<HTMLButtonElement>(null);
  const close = (focus: boolean) => { setOpen(false); setText(''); if (focus) window.requestAnimationFrame(() => btn.current?.focus()); };
  if (!open) {
    return (
      <button ref={btn} type="button" onClick={() => setOpen(true)} className={`${addBtnCls} -ml-3`}>
        <LineIcon name="plus" className="size-4.5" stroke={2.2} />항목<span className="sr-only">: {title} 체크리스트에 더하기</span>
      </button>
    );
  }
  return (
    <form className="relative block py-1 pl-[31px]" onSubmit={(e) => {
      e.preventDefault();
      if (!text.trim()) return;
      onAdd(text);
      setText('');
    }}>
      <span className="absolute -left-[13px] top-1 flex size-11 items-center justify-center text-ink"><LineIcon name="plus" className="size-4.5" stroke={2.2} /></span>
      <input className={inputCls} value={text} maxLength={200} autoFocus
        aria-label={`${title} 체크리스트에 더할 항목`} placeholder="더할 항목"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } }}
        onBlur={() => { if (!text.trim()) close(false); }} />
    </form>
  );
}

/**
 * 편집 폼(연필) · 새 할 일 폼 메모 칸 바로 밑 「＋ 체크 항목」(「＋ 할 일」과 같은 글자 단추 — addBtnCls, ＋ 가 메모 칸 왼쪽 끝).
 * 누르면 메모에 빈 체크 줄 `- [ ] ` 을 넣고(마지막 체크 줄 밑, 없으면 끝 · 빈 메모면 첫 줄) 메모 칸의 그 줄 끝에 커서를 둔다 — 글로 `- [ ]` 를 몰라도 체크리스트를 시작하게.
 * noteId = 메모 칸(textarea)의 id.
 */
export function CheckLineButton({ noteId, value, onChange, className = '-ml-3' }: {
  noteId: string; value: string; onChange: (v: string) => void;
  /** 왼쪽 맞춤(기본 = ＋ 가 메모 칸 왼쪽 끝, 간트 폼 = 밑 「＋ 세부 항목 추가」의 ＋ 와 한 세로줄) */
  className?: string;
}) {
  return (
    <button type="button" className={`${addBtnCls} ${className} self-start`}
      onClick={() => {
        const r = insertCheckLine(value);
        onChange(r.note);
        window.requestAnimationFrame(() => {
          const el = document.getElementById(noteId) as HTMLTextAreaElement | null;
          if (!el) return;
          el.focus();
          el.setSelectionRange(r.caret, r.caret);
        });
      }}>
      <LineIcon name="plus" className="size-4.5" stroke={2.2} />체크 항목<span className="sr-only">: 메모에 체크 줄 더하기</span>
    </button>
  );
}
