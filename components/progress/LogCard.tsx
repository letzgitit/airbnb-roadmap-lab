'use client';

import { useState } from 'react';
import { LOG_KINDS, type LogEntry, type LogKind } from '@/lib/core/types';
import { relTime } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { btnGhost, btnPrimary, EditBadge, iconBtn, inputCls, Stamp, textBtn, useBusy, useDirty, useEditing, useFormEsc } from './bits';

const KIND_STYLE: Record<LogKind, string> = {
  결정: 'bg-red-50 text-red-700', 통화: 'bg-blue-50 text-blue-700', 일정: 'bg-purple-50 text-purple-700', 메모: 'bg-slate-100 text-slate-700',
};

export function LogCard() {
  const { doc, send } = useProgress();
  const [kind, setKind] = useState<LogKind>('메모');
  const [text, setText] = useState('');
  const [all, setAll] = useState(false);
  const { busy, run } = useBusy();
  useDirty('form:add-log', text.trim() !== '');
  if (!doc) return null;
  const items = doc.log.filter((l) => !l.deletedAt).sort((a, b) => b.at.localeCompare(a.at));
  const shown = all ? items : items.slice(0, 5);

  return (
    <div className="mx-4 mb-6 rounded-3xl bg-white border border-slate-100 shadow-sm p-5" aria-label="최근 기록">
      <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2 mb-4"><i className="fas fa-clipboard-list text-blue-600" aria-hidden /> 최근 기록</h3>
      <form className="flex flex-col sm:flex-row gap-2 mb-4" onSubmit={(e) => {
        e.preventDefault();
        void run(() => send({ op: 'log.add', kind, text }, { onSuccess: () => setText('') }));
      }}>
        <select className={`${inputCls} sm:w-28`} value={kind} onChange={(e) => setKind(e.target.value as LogKind)} aria-label="기록 종류">{LOG_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        <input className={inputCls} placeholder="정한 것, 통화 결과, 메모" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} aria-label="기록 내용" />
        <button className={btnPrimary} disabled={busy || !text.trim()}>기록</button>
      </form>
      <ul className="space-y-2">
        {shown.map((l) => <LogRow key={l.id} l={l} />)}
        {items.length === 0 && <li className="text-[14px] text-slate-500 font-semibold">아직 기록이 없어요.</li>}
      </ul>
      {items.length > 5 && <button type="button" className={`${textBtn} mt-2`} onClick={() => setAll((v) => !v)}>{all ? '접기' : `전체 ${items.length}건 보기`}</button>}
    </div>
  );
}

function LogRow({ l }: { l: LogEntry }) {
  const { send, toast } = useProgress();
  const ed = useEditing(`log:${l.id}`);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<LogKind>(l.kind);
  const [base, setBase] = useState(l.version);
  const [orig, setOrig] = useState<{ kind: LogKind; text: string }>({ kind: l.kind, text: '' });
  const { busy, run } = useBusy();
  const dirty = ed.open && (kind !== orig.kind || text !== orig.text);
  useDirty(`form:log:${l.id}`, dirty);
  const esc = useFormEsc(dirty, ed.stop);

  if (ed.open) {
    return (
      <li className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3">
        <form className="space-y-2" onKeyDown={esc} onSubmit={(e) => {
          e.preventDefault();
          void run(() => send({ op: 'log.update', id: l.id, baseVersion: base, patch: { kind, text } }, {
            onSuccess: ed.stop,
            onTakeLatest: (cur) => {
              const k = (LOG_KINDS as readonly string[]).includes(String(cur.kind)) ? (cur.kind as LogKind) : kind;
              const o = { kind: k, text: String(cur.text ?? '') };
              setKind(o.kind); setText(o.text); setOrig(o); setBase(Number(cur.version) || 0);
            },
          }));
        }}>
          <select className={`${inputCls} sm:w-28`} value={kind} onChange={(e) => setKind(e.target.value as LogKind)} aria-label="기록 종류">{LOG_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          <textarea className={inputCls} rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} aria-label="기록 내용" />
          <div className="flex gap-2 justify-end"><button type="button" className={btnGhost} onClick={ed.stop}>취소</button><button className={btnPrimary} disabled={busy}>저장</button></div>
        </form>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-slate-50 pl-3 pr-1 py-1">
      <span className={`mt-3 shrink-0 text-[12px] font-bold px-2 py-0.5 rounded-full ${KIND_STYLE[l.kind]}`}>{l.kind}</span>
      <div className="min-w-0 flex-1 py-2.5">
        <div className="text-[14px] font-bold text-slate-800 whitespace-pre-wrap break-words">{l.text}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1"><Stamp by={l.by} at={l.at} rel={relTime} /><EditBadge k={`log:${l.id}`} /></div>
      </div>
      <div className="flex shrink-0">
        <button type="button" aria-label="수정" className={`${iconBtn} hover:text-blue-700`} onClick={() => { setText(l.text); setKind(l.kind); setOrig({ kind: l.kind, text: l.text }); setBase(l.version); ed.start(); }}><i className="fas fa-pen text-[13px]" aria-hidden /></button>
        <button type="button" aria-label="삭제" className={`${iconBtn} hover:text-red-600`} onClick={() => {
          void send({ op: 'log.delete', id: l.id }).then((r) => { if (r.ok) toast('기록을 삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'log.restore', id: l.id }) } }); });
        }}><i className="fas fa-trash text-[13px]" aria-hidden /></button>
      </div>
    </li>
  );
}
