'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { LOG_KINDS, type LogEntry, type LogKind } from '@/lib/core/types';
import { AddButton } from '@/components/ui/AddButton';
import { Card, cardRowCls } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { useProgress } from './ProgressProvider';
import {
  AutoTextarea, btnGhost, btnPrimary, clipLabel, composerCls, EditBadge, enterSubmit, inputCls, LastEdit, oneLine, rowCls, rowText,
  TRASH_NOTE, TrashButton, useBusy, useDirty, useEditing, useFormEsc,
} from './bits';

const RECENT = 5;

// 우리 집 › 기록. 카드 첫 줄 「＋ 기록 추가」 → 최근 5건(줄 = [종류 작은 글자] 글 + 줄 끝 휴지통) → 「n개 더 보기」(펼치면 「접기」).
// 글을 누르면 그 자리에서 고친다.
export function LogCard() {
  const { doc } = useProgress();
  const [all, setAll] = useState(false);
  const [composing, setComposing] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const closeComposer = useCallback(() => {
    setComposing(false);
    window.requestAnimationFrame(() => addRef.current?.focus());
  }, []);
  if (!doc) return null;
  const items = doc.log.filter((l) => !l.deletedAt).sort((a, b) => b.at.localeCompare(a.at));
  const shown = all ? items : items.slice(0, RECENT);

  return (
    <Card as="section" aria-label="기록">
      <ul id={listId}>
        <li className={composing ? `${cardRowCls} px-4` : cardRowCls}>
          {composing
            ? <LogComposer onClose={closeComposer} />
            : <AddButton buttonRef={addRef} label="기록 추가" onClick={() => setComposing(true)} />}
        </li>
        {items.length === 0 && <li className={`${cardRowCls} px-4 py-3 text-base text-muted`}>아직 기록이 없어요.</li>}
        {shown.map((l) => <LogRow key={l.id} l={l} />)}
      </ul>
      {items.length > RECENT && (
        <div className="border-t border-line">
          <FoldRow label={all ? '접기' : `${items.length - RECENT}개 더 보기`} open={all} onToggle={() => setAll((v) => !v)} controls={listId} />
        </div>
      )}
    </Card>
  );
}

function LogComposer({ onClose }: { onClose: () => void }) {
  const { send } = useProgress();
  const [kind, setKind] = useState<LogKind>('메모');
  const [text, setText] = useState('');
  const { busy, run } = useBusy();
  const dirty = text.trim() !== '';
  useDirty('form:add-log', dirty);
  const esc = useFormEsc(dirty, onClose);
  return (
    <form className={composerCls} onKeyDown={esc} onSubmit={(e) => {
      e.preventDefault();
      if (!text.trim()) return;
      void run(() => send({ op: 'log.add', kind, text }, { onSuccess: () => { setText(''); onClose(); } }));
    }}>
      <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as LogKind)} aria-label="기록 종류">{LOG_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
      <AutoTextarea className={inputCls} placeholder="정한 것, 통화 결과, 메모" maxLength={1000} value={text} autoFocus aria-label="기록 내용"
        onChange={(e) => setText(oneLine(e.target.value))} onKeyDown={enterSubmit} />
      <div className="flex justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onClose}>취소</button>
        <button className={btnPrimary} disabled={busy || !text.trim()}>추가</button>
      </div>
    </form>
  );
}

function LogRow({ l }: { l: LogEntry }) {
  const { send, toast, confirm } = useProgress();
  const ed = useEditing(`log:${l.id}`);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<LogKind>(l.kind);
  const [base, setBase] = useState(l.version);
  const [orig, setOrig] = useState<{ kind: LogKind; text: string }>({ kind: l.kind, text: '' });
  const { busy, run } = useBusy();
  const textBtnRef = useRef<HTMLButtonElement>(null);
  const dirty = ed.open && (kind !== orig.kind || text !== orig.text);
  useDirty(`form:log:${l.id}`, dirty);
  const esc = useFormEsc(dirty, ed.stop);

  const del = async () => {
    const ok = await confirm({ title: '이 기록을 지울까요?', body: l.text, note: TRASH_NOTE, confirmLabel: '삭제', cancelLabel: '취소', danger: true });
    if (!ok) return;
    void send({ op: 'log.delete', id: l.id }).then((r) => {
      if (r.ok) toast('기록을 삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'log.restore', id: l.id }) } });
    });
  };

  if (ed.open) {
    return (
      <li className={`${cardRowCls} px-4`}>
        <form className={composerCls} onKeyDown={esc} onSubmit={(e) => {
          e.preventDefault();
          void run(() => send({ op: 'log.update', id: l.id, baseVersion: base, patch: { kind, text } }, {
            onSuccess: () => { ed.stop(); window.requestAnimationFrame(() => textBtnRef.current?.focus()); },
            onTakeLatest: (cur) => {
              const k = (LOG_KINDS as readonly string[]).includes(String(cur.kind)) ? (cur.kind as LogKind) : kind;
              const o = { kind: k, text: String(cur.text ?? '') };
              setKind(o.kind); setText(o.text); setOrig(o); setBase(Number(cur.version) || 0);
            },
          }));
        }}>
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as LogKind)} aria-label="기록 종류">{LOG_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          <AutoTextarea className={inputCls} rows={2} maxLength={1000} value={text} autoFocus onChange={(e) => setText(e.target.value)} aria-label="기록 내용" />
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={ed.stop}>취소</button>
            <button className={btnPrimary} disabled={busy}>저장</button>
          </div>
          <LastEdit by={l.updatedBy || l.by} at={l.updatedAt || l.at} />
        </form>
      </li>
    );
  }
  return (
    <li className={rowCls}>
      {/* 종류(13px)는 글(15px) 첫 줄과 높이를 맞춘다: 줄 높이 차 4px 의 절반 */}
      <span className="w-14 shrink-0 pl-4 pt-3 text-sm text-muted"><span className="mt-0.5 block">{l.kind}</span></span>
      <button ref={textBtnRef} type="button" aria-label={`${clipLabel(l.text)} 수정`} className="min-w-0 flex-1 py-3 text-left"
        onClick={() => { setText(l.text); setKind(l.kind); setOrig({ kind: l.kind, text: l.text }); setBase(l.version); ed.start(); }}>
        <span className={`block whitespace-pre-wrap break-words ${rowText}`}>{l.text}</span>
        <span className="mt-0.5 block empty:hidden"><EditBadge k={`log:${l.id}`} /></span>
      </button>
      <TrashButton label={`${clipLabel(l.text)} 삭제`} onClick={() => void del()} />
    </li>
  );
}
