'use client';

import { useCallback, useRef, useState } from 'react';
import { LOG_KINDS, type LogEntry, type LogKind } from '@/lib/core/types';
import { useProgress } from './ProgressProvider';
import {
  AddRow, AutoTextarea, btnGhost, btnPrimary, clipLabel, EditBadge, enterSubmit, inputCls, LastEdit, oneLine, rowCls, rowText,
  textBtn, TRASH_NOTE, TrashButton, useBusy, useDirty, useEditing, useFormEsc,
} from './bits';

// 「집 정보 · 기록」 창의 「기록」 탭. 맨 위 「＋ 기록 추가」 → 줄 = [종류 작은 글자] 글 + 줄 끝 휴지통, 글을 누르면 그 자리에서 고친다.
export function LogCard() {
  const { doc } = useProgress();
  const [all, setAll] = useState(false);
  const [composing, setComposing] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const closeComposer = useCallback(() => {
    setComposing(false);
    window.requestAnimationFrame(() => addRef.current?.focus());
  }, []);
  if (!doc) return null;
  const items = doc.log.filter((l) => !l.deletedAt).sort((a, b) => b.at.localeCompare(a.at));
  const shown = all ? items : items.slice(0, 5);

  return (
    // 「집 정보 · 기록」 창 안에서만 쓴다(창이 바깥 틀이라 카드 테두리·바깥 여백은 두지 않는다)
    <section className="min-w-0" aria-label="최근 기록">
      <ul>
        <li className={rowCls}>
          {composing
            ? <LogComposer onClose={closeComposer} />
            : <AddRow buttonRef={addRef} label="기록 추가" onClick={() => setComposing(true)} />}
        </li>
        {shown.map((l) => <LogRow key={l.id} l={l} />)}
        {items.length === 0 && <li className="py-3 text-[15px] font-semibold text-slate-500">아직 기록이 없어요.</li>}
      </ul>
      {items.length > 5 && <button type="button" className={`${textBtn} mt-2`} onClick={() => setAll((v) => !v)}>{all ? '접기' : `전체 ${items.length}건 보기`}</button>}
    </section>
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
    <form className="my-2 w-full space-y-2 rounded-xl border border-slate-300 bg-slate-50 p-3" onKeyDown={esc} onSubmit={(e) => {
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
      <li className="my-2 rounded-xl border border-slate-300 bg-slate-50 p-3">
        <form className="space-y-2" onKeyDown={esc} onSubmit={(e) => {
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
      <span className="w-9 shrink-0 pt-3.5 text-[13px] font-semibold text-slate-500">{l.kind}</span>
      <button ref={textBtnRef} type="button" aria-label={`${clipLabel(l.text)} 수정`} className="min-w-0 flex-1 py-3 text-left"
        onClick={() => { setText(l.text); setKind(l.kind); setOrig({ kind: l.kind, text: l.text }); setBase(l.version); ed.start(); }}>
        <span className={`block whitespace-pre-wrap ${rowText} text-slate-800`}>{l.text}</span>
        <span className="mt-0.5 block empty:hidden"><EditBadge k={`log:${l.id}`} /></span>
      </button>
      <TrashButton label={`${clipLabel(l.text)} 삭제`} onClick={() => void del()} />
    </li>
  );
}
