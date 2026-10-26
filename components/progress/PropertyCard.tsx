'use client';

import { useCallback, useRef, useState } from 'react';
import type { PropertyItem } from '@/lib/core/types';
import { AddButton } from '@/components/ui/AddButton';
import { Card, cardRowCls } from '@/components/ui/Card';
import { useProgress } from './ProgressProvider';
import {
  AutoTextarea, btnGhost, btnPrimary, composerCls, EditBadge, enterSubmit, inputCls, LastEdit, oneLine, rowCls, rowSub, rowText,
  TRASH_NOTE, TrashButton, useBusy, useDirty, useEditing, useFormEsc,
} from './bits';

// 우리 집 › 집 정보. 카드 첫 줄 「＋ 집 정보 추가」 → 줄 = [항목 이름 13px / 값 15px] + 줄 끝 휴지통, 글을 누르면 그 자리에서 고친다.
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
    <Card as="section" aria-label="집 정보">
      <ul>
        <li className={composing ? `${cardRowCls} px-4` : cardRowCls}>
          {composing
            ? <PropComposer onClose={closeComposer} />
            : <AddButton buttonRef={addRef} label="집 정보 추가" onClick={() => setComposing(true)} />}
        </li>
        {items.length === 0 && (
          <li className={`${cardRowCls} px-4 py-3 text-base text-muted`}>주소, 조건, 인도일, 렌트프리, 첫 월세일 같은 집 정보를 자유롭게 적어 두세요.</li>
        )}
        {items.map((p) => <PropRow key={p.id} p={p} />)}
      </ul>
    </Card>
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
    <form className={composerCls} onKeyDown={esc} onSubmit={(e) => {
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
      <li className={`${cardRowCls} px-4`}>
        <form className={composerCls} onKeyDown={esc} onSubmit={(e) => {
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
      <button ref={textBtnRef} type="button" aria-label={`${p.label} 수정`} className="min-w-0 flex-1 py-3 pl-4 text-left"
        onClick={() => { setLabel(p.label); setValue(p.value); setOrig({ label: p.label, value: p.value }); setBase(p.version); ed.start(); }}>
        <span className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${rowSub}`}><span>{p.label}</span><EditBadge k={`prop:${p.id}`} /></span>
        <span className={`mt-0.5 block whitespace-pre-wrap break-words ${rowText}`}>{p.value}</span>
      </button>
      <TrashButton label={`${p.label} 삭제`} onClick={() => void del()} />
    </li>
  );
}
