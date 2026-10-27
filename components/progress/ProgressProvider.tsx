'use client';

import { busyFetch } from '@/lib/client/busy';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { EditingMark, Me, ProgressDoc } from '@/lib/core/types';
import type { Op } from '@/lib/core/validate';
import { withGa } from '@/lib/client/format';
import { btnDanger, btnGhost, btnPrimary } from '@/components/ui/buttonCls';

type Status = 'loading' | 'anon' | 'forbidden' | 'ready';
export interface SendResult { ok: boolean; status: number; body: Record<string, unknown> | null }
// quiet: 400 거절 문구를 알림으로 띄우지 않는다(부른 쪽이 r.body.error 로 직접 알린다).
// onTakeLatest: 충돌 창에서 「최신 내용 받기」를 고르면 서버 최신값(current)으로 불린다. 열린 편집 칸을 그 값·version 으로 다시 채우는 데 쓴다.
interface SendOpts { optimistic?: boolean; onSuccess?: () => void; quiet?: boolean; onTakeLatest?: (current: Record<string, unknown>) => void }
interface Toast { id: number; msg: string; kind: 'info' | 'error'; action?: { label: string; run: () => void } }
interface Conflict { op: Op; body: Record<string, unknown>; opts?: SendOpts }

interface Ctx {
  status: Status; doc: ProgressDoc | null; me: Me | null; refreshing: boolean;
  send: (op: Op, opts?: SendOpts) => Promise<SendResult>;
  toast: (msg: string, extra?: { kind?: 'info' | 'error'; action?: Toast['action']; ms?: number }) => void;
  editingBy: (key: string) => EditingMark | undefined;
  setEditing: (key: string | null) => void;
  refresh: () => void;
  // 저장 안 한 편집 내용 추적: 폼마다 key 로 등록. scope 'modal' = 단계 창 안의 폼(창을 닫으면 사라짐)
  markDirty: (key: string, scope: DirtyScope, dirty: boolean) => void;
  hasDirty: (scope?: DirtyScope) => boolean;
  // 앱 안 확인 창(공용). true = 확인(삭제 · 버리고 닫기), false = 취소. 포커스는 늘 안전한 쪽(취소 · 계속 편집)에 있다.
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  // 확인 창 「저장 안 한 내용이 있어요」. true = 버리고 닫기, false = 계속 편집
  confirmDiscard: () => Promise<boolean>;
}
export interface ConfirmOpts {
  title: string;
  /** 본문: 지울 글 같은 것(두 줄까지만 보인다) */
  body?: string;
  /** 본문 아래 작은 안내 한 줄 */
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** true = 되돌리기 번거로운 동작(삭제): 확인 단추가 빨강, 취소가 중립 회색 */
  danger?: boolean;
}
export type DirtyScope = 'modal' | 'page';
const C = createContext<Ctx | null>(null);
export function useProgress(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error('ProgressProvider 밖에서 사용됨');
  return v;
}

const POLL_MS = 10_000;
const PRESENCE_MS = 12_000;

export function devHeaders(): Record<string, string> {
  // 개발 서버에서만 의미가 있다(서버가 production 에선 무시한다). 두 사람 흉내용: ?as=<이메일>
  // 프로덕션 빌드에선 이 줄에서 끝나 헤더 이름조차 번들에 남지 않는다.
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return {};
  const as = new URLSearchParams(window.location.search).get('as');
  return as ? { 'x-dev-fake-email': as } : {};
}

// 낙관적 업데이트: 서버 규칙을 흉내만 낸다. 최종 값은 항상 서버 응답으로 교체된다.
function applyLocal(doc: ProgressDoc, op: Op, me: Me): ProgressDoc {
  const iso = new Date().toISOString();
  const d: ProgressDoc = { ...doc, steps: { ...doc.steps }, tasks: { ...doc.tasks }, property: { ...doc.property }, log: [...doc.log] };
  const meta = (v: number) => ({ version: v + 1, updatedAt: iso, updatedBy: me.name });
  switch (op.op) {
    case 'step.update': {
      const cur = d.steps[String(op.stepId)] ?? { status: 'todo', targetDate: null, note: '', version: 0, updatedAt: '', updatedBy: '' };
      d.steps[String(op.stepId)] = { ...cur, ...op.patch, ...meta(cur.version) };
      break;
    }
    case 'task.update': {
      const cur = d.tasks[op.id]; if (!cur) break;
      const next = { ...cur, ...op.patch, ...meta(cur.version) };
      if (op.patch.done !== undefined && op.patch.done !== cur.done) { next.doneBy = op.patch.done ? me.name : null; next.doneAt = op.patch.done ? iso : null; }
      d.tasks[op.id] = next; break;
    }
    case 'task.delete': { const c = d.tasks[op.id]; if (c) d.tasks[op.id] = { ...c, deletedAt: iso, deletedBy: me.name, ...meta(c.version) }; break; }
    case 'task.restore': { const c = d.tasks[op.id]; if (c) d.tasks[op.id] = { ...c, deletedAt: null, deletedBy: null, ...meta(c.version) }; break; }
    case 'log.update': d.log = d.log.map((l) => (l.id === op.id ? { ...l, ...op.patch, ...meta(l.version) } : l)); break;
    case 'log.delete': d.log = d.log.map((l) => (l.id === op.id ? { ...l, deletedAt: iso, deletedBy: me.name, ...meta(l.version) } : l)); break;
    case 'log.restore': d.log = d.log.map((l) => (l.id === op.id ? { ...l, deletedAt: null, deletedBy: null, ...meta(l.version) } : l)); break;
    case 'property.update': { const c = d.property[op.id]; if (c) d.property[op.id] = { ...c, ...op.patch, ...meta(c.version) }; break; }
    case 'property.delete': { const c = d.property[op.id]; if (c) d.property[op.id] = { ...c, deletedAt: iso, deletedBy: me.name, ...meta(c.version) }; break; }
    case 'property.restore': { const c = d.property[op.id]; if (c) d.property[op.id] = { ...c, deletedAt: null, deletedBy: null, ...meta(c.version) }; break; }
    default: break;
  }
  return d;
}

function describe(kind: unknown, cur: Record<string, unknown> | undefined): string {
  if (!cur) return '';
  if (kind === 'task') return `"${cur.text}"${cur.due ? `, 마감 ${cur.due}` : ''}${cur.done ? ', 완료' : ''}`;
  if (kind === 'log') return `[${cur.kind}] ${cur.text}`;
  if (kind === 'property') return `${cur.label}: ${cur.value}`;
  if (kind === 'question') return `"${cur.text}" (받는 사람 ${cur.to})`;
  if (kind === 'step') {
    const label = { todo: '시작 전', doing: '진행 중', done: '완료' }[String(cur.status)] ?? '';
    return `${label}${cur.targetDate ? `, 목표일 ${cur.targetDate}` : ''}${cur.note ? `, 메모 "${cur.note}"` : ''}`;
  }
  return '';
}

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [doc, setDoc] = useState<ProgressDoc | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const conflictBtn = useRef<HTMLButtonElement>(null);
  const conflictReturn = useRef<HTMLElement | null>(null);
  const dirtyRef = useRef(new Map<string, DirtyScope>());
  const [ask, setAsk] = useState<ConfirmOpts | null>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);

  const docRef = useRef<ProgressDoc | null>(null);
  const meRef = useRef<Me | null>(null);
  const inflight = useRef(0);
  const writes = useRef(0);
  const toastId = useRef(0);
  const statusRef = useRef<Status>('loading');

  const commit = useCallback((d: ProgressDoc | null) => { docRef.current = d; setDoc(d); }, []);
  const setSt = useCallback((s: Status) => { statusRef.current = s; setStatus(s); }, []);

  const toast = useCallback<Ctx['toast']>((msg, extra) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, msg, kind: extra?.kind ?? 'info', action: extra?.action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), extra?.ms ?? 5000);
  }, []);

  const refresh = useCallback(async () => {
    if (inflight.current > 0) return;
    const cur = docRef.current;
    const seq = writes.current;
    try {
      // 첫 읽기만 로딩 막대를 켠다(몇 초마다 도는 확인 요청은 조용히)
      const res = await (cur ? fetch : busyFetch)(`/api/progress${cur ? `?since=${cur.version}` : ''}`, { headers: devHeaders(), cache: 'no-store' });
      // 세션이 끊기거나 허용이 취소되면 들고 있던 현황도 화면 메모리에서 지운다
      if (res.status === 401) { commit(null); setSt('anon'); return; }
      if (res.status === 403) { commit(null); setSt('forbidden'); return; }
      if (!res.ok) return;
      const data = await res.json();
      if (inflight.current > 0) return;
      meRef.current = data.me; setMe(data.me);
      // 폴링 응답이 오는 사이 내 저장이 끝나 더 새 문서를 받았으면, 늦게 온 옛 문서로 덮지 않는다(다음 폴링에서 맞춰짐)
      if (writes.current !== seq) return;
      if (data.unchanged && docRef.current) {
        commit({ ...docRef.current, editing: data.editing });
      } else if (data.doc) {
        commit(data.doc);
      }
      setSt('ready');
    } catch { /* 네트워크 일시 오류: 다음 폴링에서 다시 */ }
  }, [commit, setSt]);

  useEffect(() => {
    // 마운트 직후 첫 불러오기 + 10초 폴링 + 창 포커스/탭 복귀 때 즉시
    const first = setTimeout(refresh, 0);
    const tick = setInterval(() => { if (document.visibilityState === 'visible' && statusRef.current !== 'anon' && statusRef.current !== 'forbidden') refresh(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible' && statusRef.current !== 'anon' && statusRef.current !== 'forbidden') refresh(); };
    window.addEventListener('focus', onVis);
    document.addEventListener('visibilitychange', onVis);
    return () => { clearTimeout(first); clearInterval(tick); window.removeEventListener('focus', onVis); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh]);

  const post = useCallback(async (op: Op): Promise<SendResult> => {
    try {
      const res = await busyFetch('/api/progress/mutate', {
        method: 'POST', headers: { 'content-type': 'application/json', ...devHeaders() }, body: JSON.stringify(op),
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      return { ok: res.ok, status: res.status, body };
    } catch {
      return { ok: false, status: 0, body: null };
    }
  }, []);

  const send = useCallback<Ctx['send']>(async (op, opts) => {
    const before = docRef.current;
    const optimistic = opts?.optimistic !== false && before && meRef.current && !op.op.startsWith('editing') && !op.op.endsWith('.add');
    if (optimistic && before && meRef.current) commit(applyLocal(before, op, meRef.current));
    inflight.current += 1;
    let r: SendResult;
    try { r = await post(op); } finally { inflight.current -= 1; writes.current += 1; }

    if (r.ok && r.body?.doc) {
      if (inflight.current === 0) commit(r.body.doc as ProgressDoc);
      opts?.onSuccess?.();
      return r;
    }
    if (op.op.startsWith('editing')) return r;
    // 실패: 화면을 서버 값으로 되돌리고 알림
    if (r.status === 409) {
      setConflict({ op, body: r.body ?? {}, opts });
    } else if (r.status === 410) {
      toast('이미 삭제된 항목이에요.', { kind: 'error' });
    } else if (r.status === 401 || r.status === 403) {
      setSt(r.status === 401 ? 'anon' : 'forbidden');
      toast('로그인이 필요하거나 권한이 없어요.', { kind: 'error' });
    } else if ((r.status === 400 || r.status === 413) && typeof r.body?.message === 'string') {
      // quiet: 부른 쪽이 거절 까닭을 폼 안에 직접 적는다(간트 편집 폼 · 할 일 폼 — 같은 말이 두 번 뜨지 않게)
      if (!opts?.quiet) toast(r.body.message, { kind: 'error' });
    } else {
      toast('저장에 실패했어요. 변경이 되돌려졌습니다.', { kind: 'error' });
    }
    if (optimistic) { docRef.current = before; setDoc(before); }
    await refresh();
    return r;
  }, [commit, post, refresh, setSt, toast]);

  // 「편집 중」 표시: 30초 TTL 을 12초마다 갱신
  useEffect(() => {
    if (!editKey) return;
    const set = () => { void post({ op: 'editing.set', key: editKey }); };
    set();
    const iv = setInterval(set, PRESENCE_MS);
    return () => { clearInterval(iv); void post({ op: 'editing.clear', key: editKey }); };
  }, [editKey, post]);

  const editingBy = useCallback((key: string) => {
    const m = doc?.editing?.[key];
    if (!m || m.until <= Date.now() || m.by === me?.email) return undefined;
    return m;
  }, [doc, me]);

  // 충돌 창: 「최신 내용 받기」 = 열린 편집 칸을 서버 최신값으로 다시 채우고 version 도 최신으로(다시 저장해도 상대 글을 몰래 덮지 않게)
  const takeLatest = useCallback(() => {
    const c = conflict;
    setConflict(null);
    if (c?.body.current && typeof c.body.current === 'object') c.opts?.onTakeLatest?.(c.body.current as Record<string, unknown>);
    void refresh();
  }, [conflict, refresh]);

  useEffect(() => {
    if (!conflict) return;
    conflictReturn.current = document.activeElement as HTMLElement | null;
    conflictBtn.current?.focus();
    // Esc = 안전한 쪽(최신 내용 받기). 뒤에 깔린 단계 창의 Esc 처리까지 가지 않게 먼저 가로챈다.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); takeLatest(); } };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      const el = conflictReturn.current;
      if (el && document.contains(el)) el.focus();
    };
  }, [conflict, takeLatest]);

  const markDirty = useCallback<Ctx['markDirty']>((key, scope, dirty) => {
    if (dirty) dirtyRef.current.set(key, scope); else dirtyRef.current.delete(key);
  }, []);
  const hasDirty = useCallback<Ctx['hasDirty']>((scope) => [...dirtyRef.current.values()].some((v) => !scope || v === scope), []);
  const askRef = useRef<{ resolve: (v: boolean) => void } | null>(null);
  // 확인 창은 한 번에 하나. 떠 있는 동안 새로 물으면 앞의 질문은 「취소」로 닫는다.
  const confirm = useCallback<Ctx['confirm']>((opts) => new Promise<boolean>((resolve) => {
    askRef.current?.resolve(false);
    askRef.current = { resolve };
    setAsk(opts);
  }), []);
  const answer = useCallback((v: boolean) => {
    const cur = askRef.current;
    askRef.current = null;
    setAsk(null);
    cur?.resolve(v);
  }, []);
  const confirmDiscard = useCallback<Ctx['confirmDiscard']>(() => confirm({
    title: '저장 안 한 내용이 있어요', body: '지금 닫으면 고친 내용이 사라져요.', confirmLabel: '버리고 닫기', cancelLabel: '계속 편집',
  }), [confirm]);

  // 탭 닫기·새로고침: 저장 안 한 내용이 있으면 브라우저 경고
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (dirtyRef.current.size > 0) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  // 확인 창: 안전한 쪽(취소 · 계속 편집)에 포커스, Esc · 바깥 누르기 = 취소(뒤의 단계 창·폼까지 가지 않게 먼저 가로챈다)
  useEffect(() => {
    if (!ask) return;
    const back = document.activeElement as HTMLElement | null;
    cancelBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); answer(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (back && document.contains(back)) back.focus();
    };
  }, [ask, answer]);

  const value = useMemo<Ctx>(() => ({
    status, doc, me, refreshing, send, toast, editingBy, setEditing: setEditKey, refresh: () => { setRefreshing(true); void refresh().finally(() => setRefreshing(false)); },
    markDirty, hasDirty, confirm, confirmDiscard,
  }), [status, doc, me, refreshing, send, toast, editingBy, refresh, markDirty, hasDirty, confirm, confirmDiscard]);

  const curRec = conflict?.body.current as Record<string, unknown> | undefined;
  const curDesc = conflict ? describe(conflict.body.kind, curRec) : '';
  const mine = conflict && curRec && 'patch' in conflict.op ? describe(conflict.body.kind, { ...curRec, ...(conflict.op.patch as Record<string, unknown>) }) : '';
  const who = conflict ? withGa(String(conflict.body.by || '상대')) : '';

  return (
    <C.Provider value={value}>
      {children}
      {/* 폰에선 아래 탭 · 단계 창 아래 단추 줄(이전/다음 단계)을 가리지 않게 88px + 홈 막대 안전 영역 위에, PC 는 아래 24px */}
      <div className="pointer-events-none fixed bottom-[calc(88px+env(safe-area-inset-bottom))] left-1/2 z-[90] flex w-[calc(100%-32px)] max-w-md -translate-x-1/2 flex-col gap-2 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex min-h-14 items-center justify-between gap-3 rounded-control py-1.5 pl-4 pr-2 text-base font-semibold shadow-xl ${t.kind === 'error' ? 'bg-danger text-snow' : 'bg-ink text-surface'}`}>
            <span className="py-1.5">{t.msg}</span>
            {t.action && <button type="button" className="min-h-11 min-w-11 shrink-0 rounded-control px-3 font-bold text-inherit underline underline-offset-2 hover:opacity-80" onClick={() => { t.action?.run(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
      {conflict && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="conflict-title" aria-describedby="conflict-desc">
          <div className="absolute inset-0 bg-black/50 dark:bg-black/60" />
          <div className="relative w-full max-w-md rounded-panel bg-surface p-6 shadow-2xl">
            <div className="mb-2 text-sm font-bold text-danger-ink"><i className="fas fa-triangle-exclamation mr-1.5" aria-hidden />동시에 고쳤어요</div>
            <p id="conflict-title" className="text-lg font-bold text-ink">{who} 방금 이 항목을 고쳤어요.</p>
            <div id="conflict-desc" className="mt-3 space-y-1.5 text-base leading-relaxed text-ink-soft">
              <p>최신 내용: <span className="break-words font-bold text-ink">{curDesc || '(확인 불가)'}</span></p>
              {mine && <p>내가 쓴 것: <span className="break-words font-semibold text-ink-soft">{mine}</span></p>}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" className={`${btnGhost} flex-1`} onClick={async () => {
                const c = conflict; setConflict(null);
                if ('patch' in c.op) await send({ ...c.op, force: true } as Op, c.opts);
              }}>내 내용으로 덮어쓰기</button>
              <button ref={conflictBtn} type="button" className={`${btnPrimary} flex-1`} onClick={takeLatest}>최신 내용 받기</button>
            </div>
          </div>
        </div>
      )}
      {ask && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="ask-title" aria-describedby="ask-desc">
          <div className="absolute inset-0 bg-black/50 dark:bg-black/60" onClick={() => answer(false)} />
          <div className="relative w-full max-w-sm rounded-panel bg-surface p-6 shadow-2xl">
            <p id="ask-title" className="text-lg font-bold text-ink">{ask.title}</p>
            <div id="ask-desc" className="mt-2 space-y-1.5">
              {ask.body && <p className="line-clamp-2 break-words text-base leading-relaxed text-ink-soft">{ask.body}</p>}
              {ask.note && <p className="text-sm text-muted">{ask.note}</p>}
            </div>
            {/* 폰에서는 안전한 쪽(취소 · 계속 편집)이 위, 확인 쪽이 아래. 넓은 화면에서는 확인이 왼쪽 */}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={() => answer(true)}
                className={`${ask.danger ? btnDanger : btnGhost} flex-1`}>{ask.confirmLabel ?? '확인'}</button>
              <button ref={cancelBtn} type="button" onClick={() => answer(false)}
                className={`${ask.danger ? btnGhost : btnPrimary} flex-1`}>{ask.cancelLabel ?? '취소'}</button>
            </div>
          </div>
        </div>
      )}
    </C.Provider>
  );
}
