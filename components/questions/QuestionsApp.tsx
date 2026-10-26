'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { useProgress } from '@/components/progress/ProgressProvider';
import { AutoTextarea, btnGhost, btnPrimary, composerCls, inputCls, textBtn, TrashButton, useBusy, useDirty, useFormEsc } from '@/components/progress/bits';
import { AddButton } from '@/components/ui/AddButton';
import { Badge } from '@/components/ui/Badge';
import { Card, cardRowCls } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Segmented } from '@/components/ui/Segmented';
import { displayName, relTime } from '@/lib/client/format';
import { QUESTION_STATUS_LABEL, type GuestLink, type QuestionItem, type QuestionStatus } from '@/lib/core/types';

// 우리 집 › 질문(로그인한 사람만 — 로그인 확인은 「우리 집」 틀의 LoginGate 가 한다).
// 질문을 올리고, 답 받는 링크(/q/<토큰>)로 들어온 답을 읽고, 답 받는 링크를 만들고 끊는다.
// 데이터는 현황 문서(questions · guests) 안에 있어 /api/progress 로 함께 읽고 /api/progress/mutate 로 쓴다.
// 코드 이름(guest.* 연산, GuestLink)은 그대로 두고 화면 글자만 「답 받는 링크」로 쓴다.
type Filter = 'all' | 'unread' | QuestionStatus;

export function QuestionsApp() {
  const { doc } = useProgress();
  const [filter, setFilter] = useState<Filter>('all');

  const live = useMemo(() => Object.values(doc?.questions ?? {}).filter((q) => !q.deletedAt), [doc]);
  const counts = useMemo(() => ({
    all: live.length,
    unread: live.filter((q) => q.unread).length,
    open: live.filter((q) => q.status === 'open').length,
    answered: live.filter((q) => q.status === 'answered').length,
    closed: live.filter((q) => q.status === 'closed').length,
  }), [live]);
  const shown = useMemo(() => live
    .filter((q) => filter === 'all' || (filter === 'unread' ? q.unread : q.status === filter))
    // 올린 순서(번호) 그대로, 닫은 것만 맨 아래. 읽거나 상태를 바꿔도 카드가 자리를 옮기지 않게 한다.
    .sort((a, b) => Number(a.status === 'closed') - Number(b.status === 'closed') || (a.seq || 0) - (b.seq || 0)), [live, filter]);
  const names = useMemo(() => {
    const s = new Set<string>();
    Object.values(doc?.guests ?? {}).forEach((g) => { if (!g.revokedAt) s.add(g.name); });
    live.forEach((q) => s.add(q.to));
    return [...s];
  }, [doc, live]);
  const manyPeople = new Set(live.map((q) => q.to)).size > 1;

  if (!doc) return null;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">링크를 받은 사람은 로그인 없이 자기에게 온 질문만 보고 답을 달아요.</p>

        {/* 거르기를 목록 카드 위에 둔다. 다섯 칸 + 개수가 360px 폰에서 한 줄에 들어가게 칸 좌우 여백만 8px 로 줄인다(Segmented 기본 12px) */}
        <div className="[&_button]:px-2">
          <Segmented<Filter> label="질문 거르기" value={filter} onChange={setFilter} options={[
            { value: 'all', label: '전체', count: counts.all },
            { value: 'unread', label: '새 답', count: counts.unread },
            { value: 'open', label: QUESTION_STATUS_LABEL.open, count: counts.open },
            { value: 'answered', label: QUESTION_STATUS_LABEL.answered, count: counts.answered },
            { value: 'closed', label: QUESTION_STATUS_LABEL.closed, count: counts.closed },
          ]} />
        </div>

        {/* 카드 하나: 첫 줄 「＋ 질문 추가」 → 질문 줄들(없으면 빈 문구 한 줄). 다른 목록 화면과 같은 모양 */}
        <Card>
          <div className={cardRowCls}><Composer names={names} /></div>
          {shown.length === 0
            ? <p className={`${cardRowCls} px-4 py-3 text-base text-muted`}>{live.length === 0 ? '아직 질문이 없어요.' : '여기에 해당하는 질문이 없어요.'}</p>
            : <ol aria-label="질문 목록">{shown.map((q) => <QuestionCard key={q.id} q={q} showTo={manyPeople} names={names} />)}</ol>}
        </Card>
      </div>

      <GuestLinks />
      <DeletedQuestions />
    </div>
  );
}

const labelCls = 'block text-sm text-ink-soft';
const selectCls = 'min-h-11 rounded-control border border-line-strong bg-surface px-3 text-lg font-semibold text-ink focus:border-accent-ink focus:outline-none focus:ring-1 focus:ring-accent-ink';

function NameInput({ value, onChange, names, id }: { value: string; onChange: (v: string) => void; names: string[]; id: string }) {
  return (
    <>
      <input id={id} className={inputCls} value={value} maxLength={20} list={`${id}-names`} placeholder="받는 사람 이름" autoComplete="off"
        onChange={(e) => onChange(e.target.value)} />
      <datalist id={`${id}-names`}>{names.map((n) => <option key={n} value={n} />)}</datalist>
    </>
  );
}

// 카드 첫 줄 「＋ 질문 추가」 → 누르면 그 자리에서 폼이 펼쳐진다
function Composer({ names }: { names: string[] }) {
  const { send } = useProgress();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [text, setText] = useState('');
  const { busy, run } = useBusy();
  const addRef = useRef<HTMLButtonElement>(null);
  const dirty = open && text.trim() !== '';
  useDirty('form:add-question', dirty);
  const close = () => { setOpen(false); setText(''); window.requestAnimationFrame(() => addRef.current?.focus()); };
  const esc = useFormEsc(dirty, close);
  return (
    <>
      {!open ? (
        <AddButton buttonRef={addRef} label="질문 추가" onClick={() => { setTo((v) => v || names[0] || ''); setOpen(true); }} />
      ) : (
        <div className="px-4">
          <form className={composerCls} onKeyDown={esc} onSubmit={(e) => {
            e.preventDefault();
            if (!to.trim() || !text.trim()) return;
            void run(() => send({ op: 'question.add', to: to.trim(), text: text.trim() }, { onSuccess: close }));
          }}>
            <label htmlFor="q-new-to" className={labelCls}>받는 사람</label>
            <NameInput id="q-new-to" value={to} onChange={setTo} names={names} />
            <label htmlFor="q-new-text" className={`${labelCls} pt-1`}>질문</label>
            <AutoTextarea id="q-new-text" className={inputCls} rows={3} maxLength={1000} value={text} autoFocus placeholder="물어볼 것" onChange={(e) => setText(e.target.value)} />
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={btnGhost} onClick={close}>취소</button>
              <button className={btnPrimary} disabled={busy || !to.trim() || !text.trim()}>추가</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function QuestionCard({ q, showTo, names }: { q: QuestionItem; showTo: boolean; names: string[] }) {
  const { send, toast, confirm } = useProgress();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const bodyId = useId();
  const answers = q.answers.filter((a) => !a.deletedAt);
  const last = answers[answers.length - 1];

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && q.unread) void send({ op: 'question.seen', id: q.id }, { quiet: true });
  };
  const setStatus = (status: QuestionStatus) => void send({ op: 'question.update', id: q.id, patch: { status } });
  const del = async () => {
    const ok = await confirm({ title: '이 질문을 지울까요?', body: q.text, note: '지운 질문은 30일 동안 맨 아래 「삭제한 질문」에서 되살릴 수 있어요.', confirmLabel: '삭제', danger: true });
    if (!ok) return;
    void send({ op: 'question.delete', id: q.id }).then((r) => {
      if (r.ok) toast('질문을 지웠어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'question.restore', id: q.id }) } });
    });
  };

  return (
    // 질문 카드 안의 한 줄(1px 선으로 나눈다 — 상자 안에 상자를 넣지 않는다)
    <li className={cardRowCls}>
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls={bodyId} className="block w-full px-4 py-3 text-left transition-colors active:bg-sunken md:hover:bg-sunken">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">{q.seq}</span>
          <Badge>{QUESTION_STATUS_LABEL[q.status]}</Badge>
          {q.unread && <Badge tone="accent">새 답</Badge>}
          {showTo && <span className="text-sm text-muted">{q.to}에게</span>}
          <span className="ml-auto text-sm text-muted">{answers.length > 0 ? `답 ${answers.length}` : ''}</span>
          <i className={`fas fa-chevron-down text-xs text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </span>
        <span className={`mt-1 block whitespace-pre-wrap break-words text-base font-semibold text-ink ${open ? '' : 'line-clamp-3'}`}>{q.text}</span>
        {!open && last && (
          <span className="mt-1 block line-clamp-2 text-sm text-ink-soft"><span className="text-ink">{displayName(last.by)}</span> {last.text}</span>
        )}
      </button>
      {open && (
        <div id={bodyId} className="border-t border-line">
          {editing
            ? <div className="px-4"><EditQuestion q={q} names={names} onDone={() => setEditing(false)} /></div>
            : (
              <>
                <ul aria-label="답">
                  {answers.length === 0 && <li className={`${cardRowCls} px-4 py-3 text-base text-muted`}>아직 답이 없어요.</li>}
                  {answers.map((a) => (
                    <li key={a.id} className={`${cardRowCls} flex items-start gap-1 py-1 pl-4`}>
                      <div className="min-w-0 flex-1 py-2">
                        <p className="flex flex-wrap gap-x-2 text-sm text-muted"><span>{displayName(a.by)}</span><span>{relTime(a.at)}</span></p>
                        <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-ink">{a.text}</p>
                      </div>
                      <TrashButton label="이 답 삭제" onClick={async () => {
                        const ok = await confirm({ title: '이 답을 지울까요?', body: a.text, confirmLabel: '삭제', danger: true });
                        if (ok) void send({ op: 'question.answer.delete', id: q.id, answerId: a.id });
                      }} />
                    </li>
                  ))}
                </ul>
                <div className="border-t border-line px-4 py-3"><Reply q={q} /></div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line py-1 pl-4">
                  <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
                    상태
                    <select className={selectCls} value={q.status} onChange={(e) => setStatus(e.target.value as QuestionStatus)}>
                      {(['open', 'answered', 'closed'] as const).map((s) => <option key={s} value={s}>{QUESTION_STATUS_LABEL[s]}</option>)}
                    </select>
                  </label>
                  <button type="button" className={textBtn} onClick={() => setEditing(true)}>질문 고치기</button>
                  <span className="ml-auto" />
                  <TrashButton label="질문 삭제" onClick={() => void del()} />
                </div>
              </>
            )}
        </div>
      )}
    </li>
  );
}

function Reply({ q }: { q: QuestionItem }) {
  const { send } = useProgress();
  const [text, setText] = useState('');
  const { busy, run } = useBusy();
  useDirty(`form:reply:${q.id}`, text.trim() !== '');
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      if (!text.trim()) return;
      void run(() => send({ op: 'question.answer', id: q.id, text: text.trim() }, { onSuccess: () => setText('') }));
    }}>
      <AutoTextarea className={inputCls} rows={2} maxLength={2000} value={text} placeholder="덧붙일 말 · 대신 받아 적은 답" aria-label="답 달기" onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end">
        <button className={btnPrimary} disabled={busy || !text.trim()}>답 달기</button>
      </div>
    </form>
  );
}

function EditQuestion({ q, names, onDone }: { q: QuestionItem; names: string[]; onDone: () => void }) {
  const { send } = useProgress();
  const [to, setTo] = useState(q.to);
  const [text, setText] = useState(q.text);
  const [base, setBase] = useState(q.version);
  const { busy, run } = useBusy();
  const dirty = to !== q.to || text !== q.text;
  useDirty(`form:question:${q.id}`, dirty);
  const esc = useFormEsc(dirty, onDone);
  return (
    <form className={composerCls} onKeyDown={esc} onSubmit={(e) => {
      e.preventDefault();
      const patch: { to?: string; text?: string } = {};
      if (to.trim() !== q.to) patch.to = to.trim();
      if (text.trim() !== q.text) patch.text = text.trim();
      if (!Object.keys(patch).length) { onDone(); return; }
      void run(() => send({ op: 'question.update', id: q.id, baseVersion: base, patch }, {
        onSuccess: onDone,
        onTakeLatest: (cur) => { setTo(String(cur.to ?? to)); setText(String(cur.text ?? text)); setBase(Number(cur.version) || 0); },
      }));
    }}>
      <label htmlFor={`q-to-${q.id}`} className={labelCls}>받는 사람</label>
      <NameInput id={`q-to-${q.id}`} value={to} onChange={setTo} names={names} />
      <label htmlFor={`q-text-${q.id}`} className={`${labelCls} pt-1`}>질문</label>
      <AutoTextarea id={`q-text-${q.id}`} className={inputCls} rows={3} maxLength={1000} value={text} autoFocus onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className={btnGhost} onClick={onDone}>취소</button>
        <button className={btnPrimary} disabled={busy || !to.trim() || !text.trim()}>저장</button>
      </div>
    </form>
  );
}

function linkOf(g: GuestLink) {
  return typeof window === 'undefined' ? `/q/${g.token}` : `${window.location.origin}/q/${g.token}`;
}

// 「답 받는 링크」: 링크 줄들 + 마지막 줄 = 새 링크 만들기
function GuestLinks() {
  const { doc, send, toast, confirm } = useProgress();
  const [name, setName] = useState('');
  const { busy, run } = useBusy();
  const links = Object.values(doc?.guests ?? {}).filter((g) => !g.revokedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const copy = async (g: GuestLink) => {
    try { await navigator.clipboard.writeText(linkOf(g)); toast(`${g.name}님 링크를 복사했어요.`); }
    catch { toast('복사하지 못했어요. 주소를 길게 눌러 복사해 주세요.', { kind: 'error' }); }
  };
  const revoke = async (g: GuestLink) => {
    const ok = await confirm({ title: `${g.name}님 링크를 끊을까요?`, body: '끊으면 이 주소로는 더 열리지 않아요.', note: '다시 열어 주려면 새 링크를 만들어 보내야 해요.', confirmLabel: '끊기', danger: true });
    if (ok) void send({ op: 'guest.revoke', id: g.id });
  };
  return (
    <section aria-labelledby="guest-links-title">
      <SectionHeader id="guest-links-title" title="답 받는 링크" />
      <Card>
        <ul>
          {links.length === 0 && <li className={`${cardRowCls} px-4 py-3 text-base text-muted`}>아직 만든 링크가 없어요.</li>}
          {links.map((g) => (
            <li key={g.id} className={`${cardRowCls} flex flex-col gap-2 px-4 py-3`}>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-base font-semibold text-ink">{g.name}</span>
                <span className="text-sm text-muted">{relTime(g.createdAt)} 만듦</span>
              </p>
              <input readOnly value={linkOf(g)} aria-label={`${g.name}님 링크 주소`} onFocus={(e) => e.currentTarget.select()}
                className="min-h-11 w-full rounded-control border border-line bg-sunken px-3 text-lg text-ink-soft focus:outline-none focus:ring-1 focus:ring-accent-ink" />
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} onClick={() => void copy(g)}>링크 복사</button>
                <a href={`/q/${g.token}`} target="_blank" rel="noopener" className={btnGhost}>열어 보기</a>
                <button type="button" className={`${btnGhost} ml-auto`} onClick={() => void revoke(g)}>끊기</button>
              </div>
            </li>
          ))}
          <li className={`${cardRowCls} px-4 py-3`}>
            <form className="flex gap-2" onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              void run(() => send({ op: 'guest.add', name: name.trim() }, { onSuccess: () => { setName(''); toast('링크를 만들었어요. 「링크 복사」로 보내 주세요.'); } }));
            }}>
              <input className={`${inputCls} min-w-0 flex-1`} value={name} maxLength={20} placeholder="받는 사람 이름" aria-label="새 링크 받는 사람" onChange={(e) => setName(e.target.value)} />
              <button className={btnPrimary} disabled={busy || !name.trim()}>링크 만들기</button>
            </form>
          </li>
        </ul>
      </Card>
    </section>
  );
}

// 맨 아래 「삭제한 질문 n개」(기본 접힘) → 펼치면 줄마다 「되살리기」
function DeletedQuestions() {
  const { doc, send } = useProgress();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const gone = Object.values(doc?.questions ?? {}).filter((q) => q.deletedAt).sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
  if (!gone.length) return null;
  return (
    <Card as="section" aria-label="삭제한 질문" className="mt-2">
      <FoldRow label="삭제한 질문" count={gone.length} open={open} onToggle={() => setOpen((v) => !v)} controls={listId} />
      {open && (
        <div id={listId} className="border-t border-line">
          <p className="px-4 pt-3 text-sm text-muted">지운 지 30일이 지나면 완전히 사라져요.</p>
          <ul>
            {gone.map((q) => (
              <li key={q.id} className={`${cardRowCls} flex items-center gap-3 px-4 py-3`}>
                <span className="min-w-0 flex-1 truncate text-base font-semibold text-ink-soft">{q.text}</span>
                <button type="button" className={btnGhost} onClick={() => void send({ op: 'question.restore', id: q.id })}>되살리기</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
