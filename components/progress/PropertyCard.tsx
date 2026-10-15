'use client';

import { useCallback, useRef, useState } from 'react';
import type { PropertyItem } from '@/lib/core/types';
import { useProgress } from './ProgressProvider';
import {
  AddRow, AutoTextarea, btnGhost, btnPrimary, EditBadge, enterSubmit, inputCls, LastEdit, oneLine, rowCls, rowSub, rowText,
  TRASH_NOTE, TrashButton, useBusy, useDirty, useEditing, useFormEsc,
} from './bits';

// 「집 정보 · 기록」 창의 「집 정보」 탭. 줄 = [이름 13px / 값 15px] + 줄 끝 휴지통, 글을 누르면 그 자리에서 고친다.
export function PropertyCard() {
  const { doc } = useProgress();
  const [composing, setComposing] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const closeComposer = useCallback(() => {
    setComposing(false);
    window.requestAnimationFrame(() => addRef.current?.focus());
  }, []);
  if (!doc) return null;
  const items = Object.values(doc.property).filter((p) => !p.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    // 「집 정보 · 기록」 창 안에서만 쓴다(창이 바깥 틀이라 카드 테두리·배경은 두지 않는다)
    <section className="min-w-0" aria-label="집 정보">
      {items.length === 0 && (
        <p className="pb-2 text-[15px] font-semibold text-slate-500">주소, 조건, 인도일, 렌트프리, 첫 월세일 같은 집 정보를 자유롭게 적어 두세요.</p>
      )}
      <ul>
        {items.map((p) => <PropRow key={p.id} p={p} />)}
        <li className={rowCls}>
          {composing
            ? <PropComposer onClose={closeComposer} />
            : <AddRow buttonRef={addRef} label="집 정보 추가" onClick={() => setComposing(true)} />}
        </li>
      </ul>
    </section>
  );
}

function PropComposer({ onClose }: { onClose: () => void }) {
  const { send } = useProgress();
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const { busy, run } = useBusy();
  const dirty = label.trim() !== '' || value.trim() !== '';
  useDirty('form:add-prop', dirty);
  const esc = useFormEsc(dirty, onClose);
  return (
    <form className="my-2 w-full space-y-2 rounded-xl border border-slate-300 bg-slate-50 p-3" onKeyDown={esc} onSubmit={(e) => {
      e.preventDefault();
      if (!label.trim() || !value.trim()) return;
      void run(() => send({ op: 'property.add', label, value }, { onSuccess: () => { setLabel(''); setValue(''); onClose(); } }));
    }}>
      <input className={inputCls} placeholder="항목 (예: 인도일)" maxLength={40} value={label} autoFocus onChange={(e) => setLabel(e.target.value)} aria-label="항목 이름" />
      <AutoTextarea className={inputCls} placeholder="값" maxLength={300} value={value} aria-label="값"
        onChange={(e) => setValue(oneLine(e.target.value))} onKeyDown={enterSubmit} />
      <div className="flex justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onClose}>취소</button>
        <button className={btnPrimary} disabled={busy || !label.trim() || !value.trim()}>추가</button>
      </div>
    </form>
  );
}

function PropRow({ p }: { p: PropertyItem }) {
  const { send, toast, confirm } = useProgress();
  const ed = useEditing(`prop:${p.id}`);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [base, setBase] = useState(p.version);
  const [orig, setOrig] = useState({ label: '', value: '' });
  const { busy, run } = useBusy();
  const textBtnRef = useRef<HTMLButtonElement>(null);
  const dirty = ed.open && (label !== orig.label || value !== orig.value);
  useDirty(`form:prop:${p.id}`, dirty);
  const esc = useFormEsc(dirty, ed.stop);

  const del = async () => {
    const ok = await confirm({ title: '이 집 정보를 지울까요?', body: `${p.label}: ${p.value}`, note: TRASH_NOTE, confirmLabel: '삭제', cancelLabel: '취소', danger: true });
    if (!ok) return;
    void send({ op: 'property.delete', id: p.id }).then((r) => {
      if (r.ok) toast('집 정보를 삭제했어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'property.restore', id: p.id }) } });
    });
  };

  if (ed.open) {
    return (
      <li className="my-2 rounded-xl border border-slate-300 bg-slate-50 p-3">
        <form className="space-y-2" onKeyDown={esc} onSubmit={(e) => {
          e.preventDefault();
          void run(() => send({ op: 'property.update', id: p.id, baseVersion: base, patch: { label, value } }, {
            onSuccess: () => { ed.stop(); window.requestAnimationFrame(() => textBtnRef.current?.focus()); },
            onTakeLatest: (cur) => {
              const o = { label: String(cur.label ?? ''), value: String(cur.value ?? '') };
              setLabel(o.label); setValue(o.value); setOrig(o); setBase(Number(cur.version) || 0);
            },
          }));
        }}>
          <input className={inputCls} value={label} maxLength={40} autoFocus onChange={(e) => setLabel(e.target.value)} aria-label="항목 이름" />
          <AutoTextarea className={inputCls} value={value} maxLength={300} aria-label="값" onChange={(e) => setValue(oneLine(e.target.value))} onKeyDown={enterSubmit} />
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={ed.stop}>취소</button>
            <button className={btnPrimary} disabled={busy}>저장</button>
          </div>
          <LastEdit by={p.updatedBy} at={p.updatedAt} />
        </form>
      </li>
    );
  }
  return (
    <li className={rowCls}>
      <button ref={textBtnRef} type="button" aria-label={`${p.label} 수정`} className="min-w-0 flex-1 py-3 text-left"
        onClick={() => { setLabel(p.label); setValue(p.value); setOrig({ label: p.label, value: p.value }); setBase(p.version); ed.start(); }}>
        <span className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${rowSub}`}><span>{p.label}</span><EditBadge k={`prop:${p.id}`} /></span>
        <span className={`mt-0.5 block whitespace-pre-wrap ${rowText} text-slate-800`}>{p.value}</span>
      </button>
      <TrashButton label={`${p.label} 삭제`} onClick={() => void del()} />
    </li>
  );
}
