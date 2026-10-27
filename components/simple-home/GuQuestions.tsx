'use client';

import { useCallback, useId, useRef, useState } from 'react';
import type { QuestionItem } from '@/lib/core/types';
import { useProgress } from '@/components/progress/ProgressProvider';
import {
  AutoTextarea, btnGhost, btnPrimary, composerCls, EditBadge, enterSubmit, inputCls, leadCls, oneLine, rowCls, rowText,
  TRASH_NOTE, TrashButton, useBusy, useDirty, useEditing, useFormEsc,
} from '@/components/progress/bits';
import { AddButton } from '@/components/ui/AddButton';
import { Card, cardRowCls } from '@/components/ui/Card';
import { guQuestions } from './home-model';

/**
 * 서류 탭 「구청에 물어볼 것」: 질문 중 받는 사람에 「구청」이 든 것 + 답 기다림만.
 * 첫 줄 「＋ 물어볼 것 추가」(받는 사람 = 구청), 줄 = [체크 = 답 받음] [글(누르면 고침)] [휴지통]. 답 적기 · 답 받는 링크는 「우리 집 › 질문」.
 */
export function GuQuestions() {
  const { doc } = useProgress();
  const uid = useId();
  const [composing, setComposing] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setComposing(false); window.requestAnimationFrame(() => addRef.current?.focus()); }, []);
  if (!doc) return null;
  const list = guQuestions(doc);
  return (
    <Card as="section" aria-labelledby={`${uid}-t`}>
      <div className="px-4 pb-2 pt-4">
        <h3 id={`${uid}-t`} className="text-lg font-bold text-ink">구청에 물어볼 것</h3>
        <p className="mt-0.5 text-sm font-normal text-muted">{list.length > 0 ? `${list.length}개 답 기다림` : '전화하거나 찾아갈 때 물어볼 것을 적어 두세요.'}</p>
      </div>
      <ul className="border-t border-line">
        <li className={composing ? `${cardRowCls} px-3` : cardRowCls}>
          {composing ? <AddForm onClose={close} /> : <AddButton buttonRef={addRef} label="물어볼 것 추가" onClick={() => setComposing(true)} />}
        </li>
        {list.map((q) => <QRow key={q.id} q={q} />)}
      </ul>
    </Card>
  );
}

function AddForm({ onClose }: { onClose: () => void }) {
  const { send } = useProgress();
  const [text, setText] = useState('');
  const { busy, run } = useBusy();
  useDirty('form:add-gu-question', text.trim() !== '');
  const esc = useFormEsc(text.trim() !== '', onClose);
  return (
    <form className={composerCls} onKeyDown={esc} onSubmit={(e) => {
      e.preventDefault();
      if (!text.trim()) return;
      void run(() => send({ op: 'question.add', to: '구청', text: text.trim() }, { onSuccess: () => { setText(''); onClose(); } }));
    }}>
      <AutoTextarea className={inputCls} value={text} maxLength={500} autoFocus aria-label="구청에 물어볼 것" placeholder="예: 소화기는 몇 개 있어야 하나요?"
        onChange={(e) => setText(oneLine(e.target.value))} onKeyDown={enterSubmit} />
      <div className="flex justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onClose}>취소</button>
        <button className={btnPrimary} disabled={busy || !text.trim()}>추가</button>
      </div>
    </form>
  );
}

function QRow({ q }: { q: QuestionItem }) {
  const { send, toast, confirm } = useProgress();
  const ed = useEditing(`question:${q.id}`);
  const [text, setText] = useState('');
  const [orig, setOrig] = useState('');
  const [base, setBase] = useState(q.version);
  const { busy, run } = useBusy();
  const dirty = ed.open && text !== orig;
  useDirty(`form:gu-question:${q.id}`, dirty);
  const esc = useFormEsc(dirty, ed.stop);

  const answered = () => {
    void send({ op: 'question.update', id: q.id, patch: { status: 'answered' } }).then((r) => {
      if (r.ok) toast('답 받은 질문으로 옮겼어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'question.update', id: q.id, patch: { status: 'open' } }) } });
    });
  };
  const del = async () => {
    const ok = await confirm({ title: '이 질문을 지울까요?', body: q.text, note: TRASH_NOTE, confirmLabel: '삭제', cancelLabel: '취소', danger: true });
    if (!ok) return;
    void send({ op: 'question.delete', id: q.id }).then((r) => {
      if (r.ok) toast('질문을 지웠어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'question.restore', id: q.id }) } });
    });
  };

  if (ed.open) {
    return (
      <li className={`${cardRowCls} px-3`}>
        <form className={composerCls} onKeyDown={esc} onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          void run(() => send({ op: 'question.update', id: q.id, baseVersion: base, patch: { text: text.trim() } }, {
            onSuccess: ed.stop,
            onTakeLatest: (cur) => { const t = String(cur.text ?? ''); setText(t); setOrig(t); setBase(Number(cur.version) || 0); },
          }));
        }}>
          <AutoTextarea className={inputCls} value={text} maxLength={500} autoFocus aria-label="질문 고치기"
            onChange={(e) => setText(oneLine(e.target.value))} onKeyDown={enterSubmit} />
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={ed.stop}>취소</button>
            <button className={btnPrimary} disabled={busy || !text.trim()}>저장</button>
          </div>
        </form>
      </li>
    );
  }
  return (
    <li className={rowCls}>
      <label className={`${leadCls} cursor-pointer`}>
        <input type="checkbox" className="size-5 cursor-pointer" checked={false} aria-label={`${q.text} 답 받음`} onChange={answered} />
      </label>
      <button type="button" aria-label={`${q.text} 고치기`} className="min-w-0 flex-1 py-3 text-left"
        onClick={() => { setText(q.text); setOrig(q.text); setBase(q.version); ed.start(); }}>
        <span className={`block break-words ${rowText}`}>{q.text}</span>
        <span className="mt-0.5 flex items-center gap-x-3 text-sm font-normal text-muted empty:hidden">
          {q.to !== '구청' && <span>{q.to}</span>}
          <EditBadge k={`question:${q.id}`} />
        </span>
      </button>
      <TrashButton label={`${q.text} 삭제`} onClick={() => void del()} />
    </li>
  );
}
