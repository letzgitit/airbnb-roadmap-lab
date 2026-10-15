'use client';

import { useState } from 'react';
import type { PropertyItem } from '@/lib/core/types';
import { relTime } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { btnGhost, btnPrimary, EditBadge, iconBtn, inputCls, Stamp, textBtn, useBusy, useDirty, useEditing, useFormEsc } from './bits';

export function PropertyCard() {
  const { doc, send } = useProgress();
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [adding, setAdding] = useState(false);
  const { busy, run } = useBusy();
  useDirty('form:add-prop', adding && (label.trim() !== '' || value.trim() !== ''));
  if (!doc) return null;
  const items = Object.values(doc.property).filter((p) => !p.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    // 「집 정보 · 기록」 창 안에서만 쓴다(창이 바깥 틀이라 카드 테두리·배경은 두지 않는다)
    <section className="min-w-0" aria-label="집 정보">
      {/* 위의 「집 정보」 탭이 이미 이름표라서 제목은 다시 쓰지 않고, 추가 단추만 둔다 */}
      <div className="flex justify-end mb-1">
        <button type="button" className={textBtn} onClick={() => setAdding((v) => !v)} aria-expanded={adding}>{adding ? '닫기' : '+ 항목 추가'}</button>
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
        <p className="text-[14px] text-slate-500 font-semibold">주소, 조건, 인도일, 렌트프리, 첫 월세일 같은 집 정보를 자유롭게 적어 두세요.</p>
      ) : (
        <dl className="divide-y divide-slate-100">{items.map((p) => <PropRow key={p.id} p={p} />)}</dl>
      )}
    </section>
  );
}

function PropRow({ p }: { p: PropertyItem }) {
  const { send, toast } = useProgress();
  const ed = useEditing(`prop:${p.id}`);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [base, setBase] = useState(p.version);
  const [orig, setOrig] = useState({ label: '', value: '' });
  const { busy, run } = useBusy();
  const dirty = ed.open && (label !== orig.label || value !== orig.value);
  useDirty(`form:prop:${p.id}`, dirty);
  const esc = useFormEsc(dirty, ed.stop);

  if (ed.open) {
    return (
      <form className="py-2 flex flex-col sm:flex-row gap-2" onKeyDown={esc} onSubmit={(e) => {
        e.preventDefault();
        void run(() => send({ op: 'property.update', id: p.id, baseVersion: base, patch: { label, value } }, {
          onSuccess: ed.stop,
          onTakeLatest: (cur) => {
            const o = { label: String(cur.label ?? ''), value: String(cur.value ?? '') };
            setLabel(o.label); setValue(o.value); setOrig(o); setBase(Number(cur.version) || 0);
          },
        }));
      }}>
        <input className={`${inputCls} sm:w-36`} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} aria-label="항목 이름" />
        <input className={inputCls} value={value} maxLength={300} onChange={(e) => setValue(e.target.value)} aria-label="값" />
        <div className="flex gap-2 justify-end"><button type="button" className={btnGhost} onClick={ed.stop}>취소</button><button className={btnPrimary} disabled={busy}>저장</button></div>
      </form>
    );
  }
  return (
    <div className="py-1.5 flex items-start justify-between gap-2">
      <div className="min-w-0 py-1">
        <dt className="text-[13px] font-bold text-slate-600 flex flex-wrap items-center gap-2">{p.label}<EditBadge k={`prop:${p.id}`} /></dt>
        <dd className="text-[14px] font-bold text-slate-800 break-words">{p.value}</dd>
        <Stamp by={p.updatedBy} at={p.updatedAt} rel={relTime} />
      </div>
      <div className="flex shrink-0">
        <button type="button" aria-label="수정" className={`${iconBtn} hover:text-blue-700`} onClick={() => { setLabel(p.label); setValue(p.value); setOrig({ label: p.label, value: p.value }); setBase(p.version); ed.start(); }}><i className="fas fa-pen text-[13px]" aria-hidden /></button>
        <button type="button" aria-label="삭제" className={`${iconBtn} hover:text-red-600`} onClick={() => {
          void send({ op: 'property.delete', id: p.id }).then((r) => { if (r.ok) toast('집 정보를 삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'property.restore', id: p.id }) } }); });
        }}><i className="fas fa-trash text-[13px]" aria-hidden /></button>
      </div>
    </div>
  );
}
