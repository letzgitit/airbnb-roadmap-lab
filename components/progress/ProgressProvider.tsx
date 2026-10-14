'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { EditingMark, Me, ProgressDoc } from '@/lib/core/types';
import type { Op } from '@/lib/core/validate';

type Status = 'loading' | 'anon' | 'forbidden' | 'ready';
export interface SendResult { ok: boolean; status: number; body: Record<string, unknown> | null }
interface SendOpts { optimistic?: boolean; onSuccess?: () => void; quiet?: boolean }
interface Toast { id: number; msg: string; kind: 'info' | 'error'; action?: { label: string; run: () => void } }
interface Conflict { op: Op; body: Record<string, unknown>; opts?: SendOpts }

interface Ctx {
  status: Status; doc: ProgressDoc | null; me: Me | null; refreshing: boolean;
  send: (op: Op, opts?: SendOpts) => Promise<SendResult>;
  toast: (msg: string, extra?: { kind?: 'info' | 'error'; action?: Toast['action']; ms?: number }) => void;
  editingBy: (key: string) => EditingMark | undefined;
  setEditing: (key: string | null) => void;
  refresh: () => void;
}
const C = createContext<Ctx | null>(null);
export function useProgress(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error('ProgressProvider 밖에서 사용됨');
  return v;
}

const POLL_MS = 10_000;
const PRESENCE_MS = 12_000;

function devHeaders(): Record<string, string> {
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
  if (kind === 'task') return `"${cur.text}"${cur.due ? ` · 마감 ${cur.due}` : ''}${cur.done ? ' · 완료' : ''}`;
  if (kind === 'log') return `[${cur.kind}] ${cur.text}`;
  if (kind === 'property') return `${cur.label}: ${cur.value}`;
  if (kind === 'step') {
    const label = { todo: '시작 전', doing: '진행 중', done: '완료' }[String(cur.status)] ?? '';
    return `${label}${cur.targetDate ? ` · 목표일 ${cur.targetDate}` : ''}${cur.note ? ` · 메모 "${cur.note}"` : ''}`;
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
      const res = await fetch(`/api/progress${cur ? `?since=${cur.version}` : ''}`, { headers: devHeaders(), cache: 'no-store' });
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
      const res = await fetch('/api/progress/mutate', {
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
      toast(r.body.message, { kind: 'error' });
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

  const value = useMemo<Ctx>(() => ({
    status, doc, me, refreshing, send, toast, editingBy, setEditing: setEditKey, refresh: () => { setRefreshing(true); void refresh().finally(() => setRefreshing(false)); },
  }), [status, doc, me, refreshing, send, toast, editingBy, refresh]);

  const curDesc = conflict ? describe(conflict.body.kind, conflict.body.current as Record<string, unknown> | undefined) : '';
  const who = conflict ? String(conflict.body.by || '상대') : '';

  return (
    <C.Provider value={value}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex flex-col gap-2 w-[calc(100%-32px)] max-w-md pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold shadow-xl ${t.kind === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900/95 text-white'}`}>
            <span>{t.msg}</span>
            {t.action && <button className="shrink-0 text-amber-300 font-black" onClick={() => { t.action?.run(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
      {conflict && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4" role="alertdialog" aria-label="수정 충돌">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full">
            <div className="text-[11px] font-black text-red-500 tracking-widest mb-2"><i className="fas fa-exclamation-triangle" /> 동시에 고쳤어요</div>
            <p className="font-extrabold text-slate-800 text-[15px] leading-snug">{who}가 방금 이 항목을 고쳤어요.</p>
            <p className="mt-2 text-sm text-slate-600">최신 내용: <span className="font-bold text-slate-800">{curDesc || '(확인 불가)'}</span></p>
            <div className="mt-5 flex flex-col sm:flex-row gap-2">
              <button className="flex-1 px-4 py-3 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-700" onClick={async () => {
                const c = conflict; setConflict(null);
                if ('patch' in c.op) await send({ ...c.op, force: true } as Op, c.opts);
              }}>내 내용으로 덮어쓰기</button>
              <button className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200" onClick={() => { setConflict(null); void refresh(); }}>최신 내용 받기</button>
            </div>
          </div>
        </div>
      )}
    </C.Provider>
  );
}
