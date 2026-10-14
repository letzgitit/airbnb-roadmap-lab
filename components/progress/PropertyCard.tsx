'use client';

import { useState } from 'react';
import type { PropertyItem } from '@/lib/core/types';
import { relTime } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { btnGhost, btnPrimary, EditBadge, inputCls, useBusy, useEditing } from './bits';

export function PropertyCard() {
  const { doc, send } = useProgress();
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [adding, setAdding] = useState(false);
  const { busy, run } = useBusy();
  if (!doc) return null;
  const items = Object.values(doc.property).filter((p) => !p.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[13px] font-extrabold text-slate-800 flex items-center gap-2"><i className="fas fa-house text-blue-600" /> 매물 정보</h4>
        <button type="button" className="text-[12px] font-bold text-blue-600" onClick={() => setAdding((v) => !v)}>{adding ? '닫기' : '+ 항목 추가'}</button>
      </div>
      {adding && (
        <form className="mb-3 flex flex-col sm:flex-row gap-2" onSubmit={(e) => {
          e.preventDefault();
          void run(() => send({ op: 'property.add', label, value }, { onSuccess: () => { setLabel(''); setValue(''); } }));
        }}>
          <input className={`${inputCls} sm:w-36`} placeholder="항목 (예: 인도일)" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} aria-label="항목 이름" />
          <input className={inputCls} placeholder="값" maxLength={300} value={value} onChange={(e) => setValue(e.target.value)} aria-label="값" />
          <button className={btnPrimary} disabled={busy || !label.trim() || !value.trim()}>추가</button>
        </form>
      )}
      {items.length === 0 ? (
        <p className="text-[13px] text-slate-400 font-semibold">주소·조건·인도일·렌트프리·첫 월세일 같은 매물 정보를 자유롭게 적어 두세요.</p>
      ) : (
        <dl className="divide-y divide-slate-100">{items.map((p) => <PropRow key={p.id} p={p} />)}</dl>
      )}
    </div>
  );
}

function PropRow({ p }: { p: PropertyItem }) {
  const { send, toast } = useProgress();
  const ed = useEditing(`prop:${p.id}`);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const { busy, run } = useBusy();

  if (ed.open) {
    return (
      <form className="py-2 flex flex-col sm:flex-row gap-2" onSubmit={(e) => {
        e.preventDefault();
        void run(() => send({ op: 'property.update', id: p.id, baseVersion: p.version, patch: { label, value } }, { onSuccess: ed.stop }));
      }}>
        <input className={`${inputCls} sm:w-36`} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} aria-label="항목 이름" />
        <input className={inputCls} value={value} maxLength={300} onChange={(e) => setValue(e.target.value)} aria-label="값" />
        <div className="flex gap-2"><button type="button" className={btnGhost} onClick={ed.stop}>취소</button><button className={btnPrimary} disabled={busy}>저장</button></div>
      </form>
    );
  }
  return (
    <div className="py-2 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <dt className="text-[11px] font-black text-slate-400">{p.label} <EditBadge k={`prop:${p.id}`} /></dt>
        <dd className="text-[14px] font-bold text-slate-800 break-words">{p.value}</dd>
        <span className="text-[10px] font-semibold text-slate-400">{p.updatedBy} · {relTime(p.updatedAt)}</span>
      </div>
      <div className="flex gap-1 shrink-0">
        <button type="button" aria-label="수정" className="w-8 h-8 rounded-lg text-slate-400 hover:bg-white hover:text-blue-600" onClick={() => { setLabel(p.label); setValue(p.value); ed.start(); }}><i className="fas fa-pen text-xs" /></button>
        <button type="button" aria-label="삭제" className="w-8 h-8 rounded-lg text-slate-400 hover:bg-white hover:text-red-500" onClick={() => {
          if (!window.confirm(`"${p.label}" 항목을 삭제할까요?`)) return;
          void send({ op: 'property.delete', id: p.id }).then((r) => { if (r.ok) toast('삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'property.restore', id: p.id }) } }); });
        }}><i className="fas fa-trash text-xs" /></button>
      </div>
    </div>
  );
}
