'use client';

import { useCallback, useRef, useState } from 'react';
import { useProgress } from '@/components/progress/ProgressProvider';
import {
  btnGhost, btnPrimary, composerCls, EditBadge, inputCls, TRASH_NOTE, TrashButton, useBusy, useDirty, useEditing, useFormEsc,
} from '@/components/progress/bits';
import { AddButton } from '@/components/ui/AddButton';
import { Card, cardRowCls } from '@/components/ui/Card';
import { LineIcon } from '@/components/ui/LineIcon';
import { CONTACT_PREFIX, contacts, contactToProperty, telOf, type Contact } from './home-model';

// 이름은 집 정보 항목 이름(40자)에서 「연락처 · 」을 뺀 만큼
const NAME_MAX = 40 - CONTACT_PREFIX.length;
// 넓은 화면의 표 칸: 줄마다 따로 그리드라 칸 폭을 고정해야 위아래가 맞는다(이름 · 무슨 일 · 전화 · 휴지통)
const cols = 'md:grid md:grid-cols-[12rem_minmax(0,1fr)_11rem_2.75rem] md:items-center';

/**
 * 연락처 탭: 집 정보 중 이름이 「연락처 · 」으로 시작하는 줄을 한 표로(이름 · 무슨 일 · 전화).
 * 전화 칸을 누르면 바로 건다(tel:). 줄 글을 누르면 그 자리에서 고치고, 휴지통 → 확인 창 → 되돌리기(집 정보와 같은 길).
 */
export function ContactsTab() {
  const { doc } = useProgress();
  const [composing, setComposing] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setComposing(false); window.requestAnimationFrame(() => addRef.current?.focus()); }, []);
  if (!doc) return null;
  const list = contacts(doc.property);
  return (
    <Card as="section" aria-label="연락처" className="mt-5">
      <div className={composing ? 'border-b border-line px-3' : 'border-b border-line pl-1.5'}>
        {composing ? <ContactForm onClose={close} /> : <AddButton buttonRef={addRef} label="연락처 추가" onClick={() => setComposing(true)} />}
      </div>
      {/* 머리 줄: 줄(li)과 같은 왼쪽 여백 · 같은 칸 폭. 「전화」는 번호 단추의 안쪽 여백(8px)만큼 들여 번호 아이콘과 맞춘다 */}
      {list.length > 0 && (
        <div className={`hidden border-b border-line py-2 pl-4 text-sm font-normal text-muted ${cols} md:gap-x-4`} aria-hidden>
          <span>이름</span><span>무슨 일</span><span className="pl-2">전화</span><span />
        </div>
      )}
      <ul>
        {list.length === 0 && <li className={`${cardRowCls} px-4 py-3 text-base text-muted`}>아직 연락처가 없어요.</li>}
        {list.map((c) => <ContactRow key={c.item.id} c={c} />)}
      </ul>
    </Card>
  );
}

function ContactForm({ c, onClose, onSaved }: { c?: Contact; onClose: () => void; onSaved?: () => void }) {
  const { send } = useProgress();
  const init = { name: c?.name ?? '', phone: c?.phone ?? '', work: c?.work ?? '' };
  const [name, setName] = useState(init.name);
  const [phone, setPhone] = useState(init.phone);
  const [work, setWork] = useState(init.work);
  const [base, setBase] = useState(c?.item.version ?? 0);
  const { busy, run } = useBusy();
  const dirty = name !== init.name || phone !== init.phone || work !== init.work;
  useDirty(c ? `form:contact:${c.item.id}` : 'form:add-contact', dirty);
  const esc = useFormEsc(dirty, onClose);
  const ok = name.trim() !== '' && (phone.trim() !== '' || work.trim() !== '');
  return (
    <form className={composerCls} onKeyDown={esc} onSubmit={(e) => {
      e.preventDefault();
      if (!ok) return;
      const p = contactToProperty(name, phone, work);
      void run(() => (c
        ? send({ op: 'property.update', id: c.item.id, baseVersion: base, patch: p }, {
          onSuccess: () => { onSaved?.(); onClose(); },
          onTakeLatest: (cur) => { setBase(Number(cur.version) || 0); },
        })
        : send({ op: 'property.add', ...p }, { onSuccess: onClose })));
    }}>
      <label className="block text-sm font-normal text-ink-soft">이름
        <input className={`${inputCls} mt-1`} value={name} maxLength={NAME_MAX} autoFocus placeholder="예: 도배집 사장님" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-sm font-normal text-ink-soft">전화
        <input className={`${inputCls} mt-1 tabular-nums`} type="tel" inputMode="tel" value={phone} maxLength={20} placeholder="010-0000-0000" onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label className="block text-sm font-normal text-ink-soft">무슨 일
        <input className={`${inputCls} mt-1`} value={work} maxLength={200} placeholder="예: 도배 · 장판 견적" onChange={(e) => setWork(e.target.value)} />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onClose}>취소</button>
        <button className={btnPrimary} disabled={busy || !ok}>{c ? '저장' : '추가'}</button>
      </div>
    </form>
  );
}

function ContactRow({ c }: { c: Contact }) {
  const { send, toast, confirm } = useProgress();
  const ed = useEditing(`prop:${c.item.id}`);
  const del = async () => {
    const yes = await confirm({ title: '이 연락처를 지울까요?', body: `${c.name}${c.phone ? ` ${c.phone}` : ''}`, note: TRASH_NOTE, confirmLabel: '삭제', cancelLabel: '취소', danger: true });
    if (!yes) return;
    void send({ op: 'property.delete', id: c.item.id }).then((r) => {
      if (r.ok) toast('연락처를 지웠어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'property.restore', id: c.item.id }) } });
    });
  };
  // id = 검색 결과에서 이 줄로 올 때 찾는 이름(components/search/jump.ts revealRow)
  if (ed.open) return <li id={`contact-${c.item.id}`} className={`${cardRowCls} px-3`}><ContactForm c={c} onClose={ed.stop} /></li>;
  return (
    <li id={`contact-${c.item.id}`} className={`flex items-center border-b border-line pl-5 pr-1 last:border-b-0 ${cols} md:gap-x-4`}>
      {/* 폰: [이름 / 무슨 일] [전화] [휴지통] · 넓은 화면: 이름 | 무슨 일 | 전화 | 휴지통 */}
      <button type="button" aria-label={`${c.name} 고치기`} onClick={ed.start}
        className="min-w-0 flex-1 py-4 text-left md:col-span-2 md:grid md:grid-cols-subgrid md:items-center md:gap-x-4">
        <span className="flex flex-wrap items-center gap-x-3">
          <span className="break-words text-base font-semibold text-ink">{c.name}</span>
          <EditBadge k={`prop:${c.item.id}`} />
        </span>
        <span className="mt-0.5 block break-words text-sm font-normal text-muted md:mt-0 md:text-base md:text-ink-soft">{c.work || ' '}</span>
      </button>
      {c.phone ? (
        <a href={telOf(c.phone)} aria-label={`${c.name}에게 전화 걸기 ${c.phone}`}
          className="ml-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-2 text-base font-semibold tabular-nums text-ink underline underline-offset-[3px] transition-colors hover:bg-sunken md:ml-0 md:justify-self-start">
          <LineIcon name="phone" className="size-4.5" />{c.phone}
        </a>
      ) : <span className="ml-2 shrink-0 px-2 text-sm text-muted md:ml-0">번호 없음</span>}
      <TrashButton label={`${c.name} 삭제`} onClick={() => void del()} />
    </li>
  );
}
