'use client';

import { useState } from 'react';
import { LOG_KINDS, type LogEntry, type LogKind } from '@/lib/core/types';
import { relTime } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { btnGhost, btnPrimary, EditBadge, iconBtn, inputCls, Stamp, textBtn, useBusy, useDirty, useEditing, useFormEsc } from './bits';

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
    // 「집 정보 · 기록」 창 안에서만 쓴다(창이 바깥 틀이라 카드 테두리·바깥 여백은 두지 않는다)
    <section className="min-w-0" aria-label="최근 기록">
      <form className="flex flex-col sm:flex-row gap-2 mb-4" onSubmit={(e) => {
        e.preventDefault();
        void run(() => send({ op: 'log.add', kind, text }, { onSuccess: () => setText('') }));
      }}>
        <select className={`${inputCls} sm:w-28`} value={kind} onChange={(e) => setKind(e.target.value as LogKind)} aria-label="기록 종류">{LOG_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        <input className={inputCls} placeholder="정한 것, 통화 결과, 메모" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} aria-label="기록 내용" />
        <button className={btnPrimary} disabled={busy || !text.trim()}>기록</button>
      </form>
      <ul>
        {shown.map((l) => <LogRow key={l.id} l={l} />)}
        {items.length === 0 && <li className="text-[15px] text-slate-500 font-semibold">아직 기록이 없어요.</li>}
      </ul>
      {items.length > 5 && <button type="button" className={`${textBtn} mt-2`} onClick={() => setAll((v) => !v)}>{all ? '접기' : `전체 ${items.length}건 보기`}</button>}
    </section>
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
      <li className="my-2 rounded-xl border border-slate-300 bg-slate-50 p-3">
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
    <li className="flex items-start gap-3 border-b border-slate-200 py-1 last:border-b-0">
      <span className="w-9 shrink-0 pt-3.5 text-[13px] font-bold text-slate-500">{l.kind}</span>
      <div className="min-w-0 flex-1 py-3">
        <div className="whitespace-pre-wrap text-[15px] font-semibold leading-relaxed text-slate-800">{l.text}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1"><Stamp by={l.by} at={l.at} rel={relTime} /><EditBadge k={`log:${l.id}`} /></div>
      </div>
      <div className="flex shrink-0">
        <button type="button" aria-label="수정" className={`${iconBtn} hover:text-slate-800`} onClick={() => { setText(l.text); setKind(l.kind); setOrig({ kind: l.kind, text: l.text }); setBase(l.version); ed.start(); }}><i className="fas fa-pen text-[13px]" aria-hidden /></button>
        <button type="button" aria-label="삭제" className={`${iconBtn} hover:text-slate-800`} onClick={() => {
          void send({ op: 'log.delete', id: l.id }).then((r) => { if (r.ok) toast('기록을 삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'log.restore', id: l.id }) } }); });
        }}><i className="fas fa-trash text-[13px]" aria-hidden /></button>
      </div>
    </li>
  );
}
