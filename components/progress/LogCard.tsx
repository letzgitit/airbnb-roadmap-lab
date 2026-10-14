'use client';

import { useState } from 'react';
import { LOG_KINDS, type LogEntry, type LogKind } from '@/lib/core/types';
import { relTime } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { btnGhost, btnPrimary, EditBadge, inputCls, useBusy, useEditing } from './bits';

const KIND_STYLE: Record<LogKind, string> = {
  결정: 'bg-red-50 text-red-600', 통화: 'bg-blue-50 text-blue-600', 일정: 'bg-purple-50 text-purple-600', 메모: 'bg-slate-100 text-slate-600',
};

export function LogCard() {
  const { doc, send } = useProgress();
  const [kind, setKind] = useState<LogKind>('메모');
  const [text, setText] = useState('');
  const [all, setAll] = useState(false);
  const { busy, run } = useBusy();
  if (!doc) return null;
  const items = doc.log.filter((l) => !l.deletedAt).sort((a, b) => b.at.localeCompare(a.at));
  const shown = all ? items : items.slice(0, 5);

  return (
    <div className="mx-4 mb-6 rounded-3xl bg-white border border-slate-100 shadow-sm p-5" aria-label="최근 기록">
      <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2 mb-4"><i className="fas fa-clipboard-list text-blue-600" /> 최근 기록</h3>
      <form className="flex flex-col sm:flex-row gap-2 mb-4" onSubmit={(e) => {
        e.preventDefault();
        void run(() => send({ op: 'log.add', kind, text }, { onSuccess: () => setText('') }));
      }}>
        <select className={`${inputCls} sm:w-28`} value={kind} onChange={(e) => setKind(e.target.value as LogKind)} aria-label="기록 종류">{LOG_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        <input className={inputCls} placeholder="정한 것 · 통화 결과 · 메모" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} aria-label="기록 내용" />
        <button className={btnPrimary} disabled={busy || !text.trim()}>기록</button>
      </form>
      <ul className="space-y-2">
        {shown.map((l) => <LogRow key={l.id} l={l} />)}
        {items.length === 0 && <li className="text-[13px] text-slate-300 font-semibold">아직 기록이 없어요.</li>}
      </ul>
      {items.length > 5 && <button type="button" className="mt-3 text-[12px] font-bold text-blue-600" onClick={() => setAll((v) => !v)}>{all ? '접기' : `전체 ${items.length}건 보기`}</button>}
    </div>
  );
}

function LogRow({ l }: { l: LogEntry }) {
  const { send, toast } = useProgress();
  const ed = useEditing(`log:${l.id}`);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<LogKind>(l.kind);
  const { busy, run } = useBusy();

  if (ed.open) {
    return (
      <li className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3">
        <form className="space-y-2" onSubmit={(e) => {
          e.preventDefault();
          void run(() => send({ op: 'log.update', id: l.id, baseVersion: l.version, patch: { kind, text } }, { onSuccess: ed.stop }));
        }}>
          <select className={`${inputCls} sm:w-28`} value={kind} onChange={(e) => setKind(e.target.value as LogKind)} aria-label="기록 종류">{LOG_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          <textarea className={inputCls} rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} aria-label="기록 내용" />
          <div className="flex gap-2 justify-end"><button type="button" className={btnGhost} onClick={ed.stop}>취소</button><button className={btnPrimary} disabled={busy}>저장</button></div>
        </form>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
      <span className={`mt-0.5 shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${KIND_STYLE[l.kind]}`}>{l.kind}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold text-slate-800 whitespace-pre-wrap break-words">{l.text}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold text-slate-400">{l.by} · {relTime(l.at)}</span><EditBadge k={`log:${l.id}`} /></div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button type="button" aria-label="수정" className="w-8 h-8 rounded-lg text-slate-400 hover:bg-white hover:text-blue-600" onClick={() => { setText(l.text); setKind(l.kind); ed.start(); }}><i className="fas fa-pen text-xs" /></button>
        <button type="button" aria-label="삭제" className="w-8 h-8 rounded-lg text-slate-400 hover:bg-white hover:text-red-500" onClick={() => {
          if (!window.confirm('이 기록을 삭제할까요?')) return;
          void send({ op: 'log.delete', id: l.id }).then((r) => { if (r.ok) toast('삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'log.restore', id: l.id }) } }); });
        }}><i className="fas fa-trash text-xs" /></button>
      </div>
    </li>
  );
}
