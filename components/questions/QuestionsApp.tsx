'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { signIn, signOut } from 'next-auth/react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ProgressProvider, useProgress } from '@/components/progress/ProgressProvider';
import { AutoTextarea, btnGhost, btnPrimary, inputCls, textBtn, TrashButton, useBusy, useDirty, useFormEsc } from '@/components/progress/bits';
import { displayName, relTime } from '@/lib/client/format';
import { QUESTION_STATUS_LABEL, type GuestLink, type QuestionItem, type QuestionStatus } from '@/lib/core/types';

// 「질문」 화면(로그인한 사람만). 질문을 올리고, 손님 링크로 들어온 답을 읽고, 손님 링크를 만들고 끊는다.
// 데이터는 현황 문서(questions · guests) 안에 있어 /api/progress 로 함께 읽고 /api/progress/mutate 로 쓴다.
export function QuestionsApp({ loginReady, title }: { loginReady: boolean; title: string }) {
  return (
    <ProgressProvider>
      <Inner loginReady={loginReady} title={title} />
    </ProgressProvider>
  );
}

type Filter = 'all' | 'unread' | QuestionStatus;
const CHIP: Record<QuestionStatus, string> = {
  open: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  answered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  closed: 'bg-slate-100 text-slate-600',
};

function Inner({ loginReady, title }: { loginReady: boolean; title: string }) {
  const { status, doc } = useProgress();
  const [filter, setFilter] = useState<Filter>('all');
  const ready = status === 'ready' && !!doc;

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

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: '전체' }, { id: 'unread', label: '새 답' }, { id: 'open', label: '답 기다림' }, { id: 'answered', label: '답함' }, { id: 'closed', label: '닫음' },
  ];

  return (
    <div className="app-container">
      <header className="border-b border-slate-200 bg-white">
        <div className="px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="min-w-0 text-2xl font-bold leading-tight text-slate-900">질문</h1>
            <ThemeToggle />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3">
            <Link href="/" className="-ml-1 inline-flex min-h-9 items-center gap-1.5 px-1 text-[13px] font-semibold text-slate-600 hover:underline">
              <i className="fas fa-chevron-left text-[12px]" aria-hidden />{title}
            </Link>
            {ready && (
              <button type="button" onClick={() => void signOut({ redirect: true, callbackUrl: '/questions' })}
                className="-mr-2 inline-flex min-h-9 items-center px-2 text-[13px] font-semibold text-slate-600 hover:underline">로그아웃</button>
            )}
          </div>
        </div>
      </header>

      <main className="chart-wrapper mx-auto w-full max-w-[720px] gap-4">
        {status === 'loading' && <p className="px-1 text-[15px] text-slate-500">불러오는 중…</p>}
        {status === 'forbidden' && (
          <Card>
            <p className="text-[15px] font-semibold text-slate-800">허용되지 않은 계정이에요.</p>
            <button type="button" onClick={() => void signOut({ callbackUrl: '/questions' })} className="mt-2 inline-flex min-h-11 items-center text-[15px] font-bold text-blue-700 underline underline-offset-4 dark:text-blue-300">로그아웃</button>
          </Card>
        )}
        {status === 'anon' && (
          <Card>
            <p className="text-[15px] font-semibold text-slate-800">로그인한 사람만 볼 수 있어요.</p>
            {loginReady
              ? <button type="button" onClick={() => void signIn('google', { callbackUrl: '/questions' })} className="mt-2 inline-flex min-h-11 items-center text-[15px] font-bold text-blue-700 underline underline-offset-4 dark:text-blue-300">로그인</button>
              : <p className="mt-2 text-[13px] text-slate-500">로그인 준비 중이에요.</p>}
          </Card>
        )}
        {ready && (
          <>
            <p className="px-1 text-[15px] leading-relaxed text-slate-600">
              질문을 올리고 받는 사람에게 손님 링크를 보내면, 그 사람은 로그인 없이 자기에게 온 질문만 보고 답을 달아요.
            </p>
            <Composer names={names} />

            <div className="flex flex-wrap gap-2" role="group" aria-label="질문 거르기">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-[14px] font-bold ${filter === f.id ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}>
                  {f.label}<span className={f.id === 'unread' && counts.unread > 0 && filter !== f.id ? 'rounded-full bg-red-600 px-1.5 text-[12px] text-snow' : 'opacity-70'}>{counts[f.id]}</span>
                </button>
              ))}
            </div>

            {shown.length === 0
              ? <p className="px-1 text-[15px] font-semibold text-slate-500">{live.length === 0 ? '아직 질문이 없어요.' : '여기에 해당하는 질문이 없어요.'}</p>
              : <ol className="flex flex-col gap-3">{shown.map((q) => <QuestionCard key={q.id} q={q} showTo={manyPeople} names={names} />)}</ol>}

            <GuestLinks />
            <DeletedQuestions />
          </>
        )}
      </main>
    </div>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white px-4 py-4 ${className}`}>{children}</div>;
}

function NameInput({ value, onChange, names, id }: { value: string; onChange: (v: string) => void; names: string[]; id: string }) {
  return (
    <>
      <input id={id} className={inputCls} value={value} maxLength={20} list={`${id}-names`} placeholder="받는 사람 이름" autoComplete="off"
        onChange={(e) => onChange(e.target.value)} />
      <datalist id={`${id}-names`}>{names.map((n) => <option key={n} value={n} />)}</datalist>
    </>
  );
}

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
  if (!open) {
    return (
      <button ref={addRef} type="button" onClick={() => { setTo((v) => v || names[0] || ''); setOpen(true); }}
        className="flex min-h-12 w-full items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 text-left text-[15px] font-bold text-blue-700 hover:border-slate-400 dark:text-blue-300">
        <i className="fas fa-plus text-[14px]" aria-hidden />질문 추가
      </button>
    );
  }
  return (
    <Card>
      <form className="space-y-2" onKeyDown={esc} onSubmit={(e) => {
        e.preventDefault();
        if (!to.trim() || !text.trim()) return;
        void run(() => send({ op: 'question.add', to: to.trim(), text: text.trim() }, { onSuccess: close }));
      }}>
        <label htmlFor="q-new-to" className="block text-[13px] font-bold text-slate-600">받는 사람</label>
        <NameInput id="q-new-to" value={to} onChange={setTo} names={names} />
        <label htmlFor="q-new-text" className="block pt-1 text-[13px] font-bold text-slate-600">질문</label>
        <AutoTextarea id="q-new-text" className={inputCls} rows={3} maxLength={1000} value={text} autoFocus placeholder="물어볼 것" onChange={(e) => setText(e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnGhost} onClick={close}>취소</button>
          <button className={btnPrimary} disabled={busy || !to.trim() || !text.trim()}>추가</button>
        </div>
      </form>
    </Card>
  );
}

function QuestionCard({ q, showTo, names }: { q: QuestionItem; showTo: boolean; names: string[] }) {
  const { send, toast, confirm } = useProgress();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const answers = q.answers.filter((a) => !a.deletedAt);
  const last = answers[answers.length - 1];

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && q.unread) void send({ op: 'question.seen', id: q.id }, { quiet: true });
  };
  const setStatus = (status: QuestionStatus) => void send({ op: 'question.update', id: q.id, patch: { status } });
  const del = async () => {
    const ok = await confirm({ title: '이 질문을 지울까요?', body: q.text, note: '지운 질문은 30일 동안 아래 「삭제한 질문」에서 되살릴 수 있어요.', confirmLabel: '삭제', danger: true });
    if (!ok) return;
    void send({ op: 'question.delete', id: q.id }).then((r) => {
      if (r.ok) toast('질문을 지웠어요.', { ms: 8000, action: { label: '되돌리기', run: () => void send({ op: 'question.restore', id: q.id }) } });
    });
  };

  return (
    <li className={`overflow-hidden rounded-2xl border bg-white ${q.unread ? 'border-blue-400 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-slate-200'}`}>
      <button type="button" onClick={toggle} aria-expanded={open} className="block w-full px-4 py-3.5 text-left hover:bg-slate-50">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold text-slate-500">{q.seq}</span>
          <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${CHIP[q.status]}`}>{QUESTION_STATUS_LABEL[q.status]}</span>
          {q.unread && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[12px] font-bold text-snow">새 답</span>}
          {showTo && <span className="text-[13px] font-semibold text-slate-500">{q.to}에게</span>}
          <span className="ml-auto text-[13px] font-semibold text-slate-500">{answers.length > 0 ? `답 ${answers.length}` : ''}</span>
          <i className={`fas fa-chevron-down text-[12px] text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </span>
        <span className={`mt-1 block whitespace-pre-wrap text-[15px] font-semibold leading-snug text-slate-900 ${open ? '' : 'line-clamp-3'}`}>{q.text}</span>
        {!open && last && (
          <span className="mt-1.5 block line-clamp-2 text-[14px] leading-snug text-slate-600"><b className="font-bold text-slate-700">{displayName(last.by)}</b> {last.text}</span>
        )}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          {editing
            ? <EditQuestion q={q} names={names} onDone={() => setEditing(false)} />
            : (
              <>
                {answers.length === 0 && <p className="text-[14px] font-semibold text-slate-500">아직 답이 없어요.</p>}
                {answers.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {answers.map((a) => (
                      <li key={a.id} className={`flex items-start gap-1 rounded-xl px-3 py-2 ${a.guestId ? 'bg-blue-50 dark:bg-blue-950/40' : 'bg-slate-50'}`}>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap gap-x-2 text-[13px] font-bold text-slate-500"><span className="text-slate-700">{displayName(a.by)}</span><span>{relTime(a.at)}</span></p>
                          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{a.text}</p>
                        </div>
                        <TrashButton label="이 답 삭제" onClick={async () => {
                          const ok = await confirm({ title: '이 답을 지울까요?', body: a.text, confirmLabel: '삭제', danger: true });
                          if (ok) void send({ op: 'question.answer.delete', id: q.id, answerId: a.id });
                        }} />
                      </li>
                    ))}
                  </ul>
                )}
                <Reply q={q} />
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-2">
                  <label className="inline-flex items-center gap-2 text-[13px] font-bold text-slate-600">
                    상태
                    <select className="min-h-11 rounded-xl border border-slate-200 bg-white px-2 text-[14px] font-bold text-slate-800" value={q.status}
                      onChange={(e) => setStatus(e.target.value as QuestionStatus)}>
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
    <form className="mt-3 space-y-2" onSubmit={(e) => {
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
    <form className="space-y-2" onKeyDown={esc} onSubmit={(e) => {
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
      <label htmlFor={`q-to-${q.id}`} className="block text-[13px] font-bold text-slate-600">받는 사람</label>
      <NameInput id={`q-to-${q.id}`} value={to} onChange={setTo} names={names} />
      <label htmlFor={`q-text-${q.id}`} className="block pt-1 text-[13px] font-bold text-slate-600">질문</label>
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
    <section className="mt-4" aria-labelledby="guest-links-title">
      <h2 id="guest-links-title" className="px-1 text-[17px] font-bold text-slate-900">손님 링크</h2>
      <p className="mt-0.5 px-1 text-[13px] leading-snug text-slate-600">이 주소를 가진 사람은 로그인 없이 링크에 적은 이름과 받는 사람이 같은 질문만 보고 답을 달 수 있어요. 집 정보 · 할 일 · 기록은 보이지 않아요.</p>
      <Card className="mt-2">
        {links.length === 0 && <p className="text-[14px] font-semibold text-slate-500">아직 만든 링크가 없어요.</p>}
        <ul className="flex flex-col gap-3">
          {links.map((g) => (
            <li key={g.id} className="flex flex-col gap-1.5 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-slate-900">{g.name}</span>
                <span className="text-[13px] font-semibold text-slate-500">{relTime(g.createdAt)} 만듦</span>
              </div>
              <input readOnly value={linkOf(g)} aria-label={`${g.name}님 링크 주소`} onFocus={(e) => e.currentTarget.select()}
                className="w-full min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[13px] font-semibold text-slate-700" />
              <div className="flex gap-2">
                <button type="button" className={btnPrimary} onClick={() => void copy(g)}>링크 복사</button>
                <a href={`/q/${g.token}`} target="_blank" rel="noopener" className={`${btnGhost} inline-flex items-center`}>열어 보기</a>
                <button type="button" className={`${btnGhost} ml-auto`} onClick={() => void revoke(g)}>끊기</button>
              </div>
            </li>
          ))}
        </ul>
        <form className="mt-3 flex gap-2 border-t border-slate-100 pt-3" onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void run(() => send({ op: 'guest.add', name: name.trim() }, { onSuccess: () => { setName(''); toast('링크를 만들었어요. 「링크 복사」로 보내 주세요.'); } }));
        }}>
          <input className={inputCls} value={name} maxLength={20} placeholder="받는 사람 이름" aria-label="새 링크 받는 사람" onChange={(e) => setName(e.target.value)} />
          <button className={btnPrimary} disabled={busy || !name.trim()}>링크 만들기</button>
        </form>
      </Card>
    </section>
  );
}

function DeletedQuestions() {
  const { doc, send } = useProgress();
  const [open, setOpen] = useState(false);
  const gone = Object.values(doc?.questions ?? {}).filter((q) => q.deletedAt).sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
  if (!gone.length) return null;
  return (
    <section className="px-1">
      <button type="button" className={textBtn} aria-expanded={open} onClick={() => setOpen((v) => !v)}>삭제한 질문 {gone.length}개 {open ? '접기' : '보기'}</button>
      {open && (
        <ul className="mt-1 flex flex-col">
          {gone.map((q) => (
            <li key={q.id} className="flex items-center gap-2 border-b border-slate-100 py-1 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-[14px] text-slate-600">{q.text}</span>
              <button type="button" className={textBtn} onClick={() => void send({ op: 'question.restore', id: q.id })}>되살리기</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
