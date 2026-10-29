'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import type { PhotoView } from '@/lib/core/photos';
import { relTime, withGa } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { busyFetch } from '@/lib/client/busy';
import { byStepPosition, REF_LABEL, REF_STEP } from '@/lib/core/photo-order';
import { btnGhost, btnPrimary, inputCls, textBtn, TrashButton, useBusy, useDirty } from './bits';
import { AddButton, AddTextButton } from '@/components/ui/AddButton';
import { Card, cardRowCls } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { IconButton } from '@/components/ui/IconButton';
import { Segmented } from '@/components/ui/Segmented';

// 삭제 확인 창 안내(서버가 30일 보관 — lib/core/photos.ts TRASH_KEEP_MS)
const PHOTO_TRASH_NOTE = '지운 사진은 30일 동안 사진 화면 맨 아래 「삭제한 사진」에서 되살릴 수 있어요.';

// 사진: 로그인한 두 사람만 /api/photos 로 받는다(공개 화면 · 저장소 코드에는 사진도 설명도 없다).
// 타임라인 단계별로 묶고(단계 순서, 사진이 없는 단계는 숨김), 단계 안은 찍은 날짜 순.
// 참고 사진(stepId 0, 다른 집 현장 등 우리 집이 아닌 사진)은 단계와 따로 맨 끝 칸에 모으고, 단계 창 사진 줄에는 나오지 않는다.
// 우리 집 › 사진 화면과 단계 시트의 사진 줄이 같은 목록 · 크게 보기 · 올리기 창을 같이 쓴다(PhotosProvider — 사이트 틀이 한 번 감싼다).

export interface StepName { id: number; title: string }
interface Data { photos: PhotoView[]; trash: PhotoView[] }
const src = (id: string, size: 'thumb' | 'full' | 'file') => `/api/photos/${id}?size=${size}`;
// 「2026-10-14T13:05:22」 → 「10월 14일」
const dayKey = (t: string) => t.slice(0, 10);
const dayLabel = (t: string) => { const [, m, d] = dayKey(t).split('-'); return m && d ? `${Number(m)}월 ${Number(d)}일` : ''; };

// 기본 순서: 단계 → (직접 바꾼 순서 position) → 찍은 시각 → 올린 순서 — lib/core/photo-order.ts

// 사진 탭의 정렬 · 거르기(고른 값은 이 브라우저에 기억한다. 검색어는 기억하지 않는다)
export type SortMode = 'default' | 'newest' | 'oldest';
export type KindFilter = 'all' | 'image' | 'doc';
const SORT_KEY = 'photos.sort', KIND_KEY = 'photos.kind';
function remembered<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try { const v = localStorage.getItem(key); return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback; } catch { return fallback; }
}
function remember(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* 저장이 막혀도 이번 화면에는 적용 */ } }
const SORTS = ['default', 'newest', 'oldest'] as const;
const KINDS = ['all', 'image', 'doc'] as const;

interface Ctx {
  steps: StepName[];
  data: Data | null;
  state: 'idle' | 'loading' | 'error' | 'anon';
  /** 단계 순서 · 찍은 날짜 순으로 줄 세운 전체 사진(크게 보기의 앞뒤 넘기기도 이 순서). 할 일 메모 사진은 빠진다 */
  ordered: PhotoView[];
  /** 할 일 메모 사진(지우지 않은 것, 올린 순). 새 홈 할 일 줄이 taskId 로 골라 쓴다 */
  taskPhotos: PhotoView[];
  /** 할 일 메모에 사진 올리기(여러 장 차례로). 끝나면 목록을 다시 받는다 */
  uploadToTask: (taskId: string, stepId: number, files: File[]) => Promise<void>;
  /** 새 홈 단계 블록 사진(cardId 있음, 지우지 않은 것, 올린 순). 블록 몸통 · 갤러리 분야 묶음이 쓴다 */
  cardPhotos: PhotoView[];
  /** 단계 블록에 사진 올리기(여러 장 차례로, 단계 = 그 블록의 「＋ 할 일」 단계). 끝나면 목록을 다시 받는다 */
  uploadToCard: (cardId: string, stepId: number, files: File[]) => Promise<void>;
  /** 사진 탭에 보이는 줄(거르기 · 검색 · 정렬 적용). 사진 탭에서 연 크게 보기의 앞뒤 넘기기도 이 순서 */
  shown: PhotoView[];
  sort: SortMode; setSort: (s: SortMode) => void;
  kind: KindFilter; setKind: (k: KindFilter) => void;
  query: string; setQuery: (q: string) => void;
  /** 같은 단계 안에서 한 칸 앞(-1) · 뒤(+1)로 옮긴다 */
  move: (id: string, dir: -1 | 1) => Promise<boolean>;
  canMove: (id: string, dir: -1 | 1) => boolean;
  ensure: () => void;
  reload: () => Promise<void>;
  /** 크게 보기. stepId 를 주면 그 단계 사진 안에서만 넘긴다(단계 창 사진 줄). ids 를 주면 그 사진들 안에서만(새 홈 사진 탭 — 순서 옮기기 없음) */
  view: (id: string, stepId?: number, ids?: string[]) => void;
  /** 올리기 창. album 을 주면 그 묶음 이름으로 올린다(새 홈 「공사 후」 칸). doc = 「글씨 많은 문서」를 켠 채로 연다(갤러리 › 문서) */
  upload: (stepId?: number, album?: string, opts?: { doc?: boolean }) => void;
  patch: (id: string, method: 'PATCH' | 'DELETE', body?: Record<string, unknown>) => Promise<boolean>;
}
const C = createContext<Ctx | null>(null);
export function usePhotos(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error('PhotosProvider 밖에서 사용됨');
  return v;
}

// 로그인했을 때만 감싼다. 목록은 처음 필요할 때(사진 탭 · 단계 창) 한 번 받고, 올리기 · 고치기 뒤에 다시 받는다.
export function PhotosProvider({ steps, children }: { steps: StepName[]; children: ReactNode }) {
  const { toast, confirm, doc } = useProgress();
  const [data, setData] = useState<Data | null>(null);
  const [taskPhotos, setTaskPhotos] = useState<PhotoView[]>([]);
  const [cardPhotos, setCardPhotos] = useState<PhotoView[]>([]);
  const [state, setState] = useState<Ctx['state']>('idle');
  const [viewId, setViewId] = useState<string | null>(null);
  const [viewStep, setViewStep] = useState<number | null>(null);
  const [viewIds, setViewIds] = useState<string[] | null>(null);
  const [uploadStep, setUploadStep] = useState<number | null>(null);
  const [uploadAlbum, setUploadAlbum] = useState('');
  const [uploadDoc, setUploadDoc] = useState(false);
  const started = useRef(false);

  const reload = useCallback(async () => {
    setState((s) => (s === 'idle' && !started.current ? 'loading' : s));
    started.current = true;
    try {
      const res = await busyFetch('/api/photos', { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) { setData(null); setState('anon'); return; }
      if (!res.ok) { setState('error'); return; }
      // 할 일 메모 사진(taskId 있음)은 사진 화면 · 단계 창 · 「삭제한 사진」에 섞지 않고 따로 둔다(그 할 일 메모 밑 · 갤러리 분야 묶음에만 보인다).
      // 블록 사진(cardId 있음)도 사진 화면 · 단계 창에는 섞지 않는다. 지운 블록 사진은 「삭제한 사진」에서 되살릴 수 있게 남긴다
      const j = (await res.json()) as Data;
      const plain = (p: PhotoView) => !p.taskId && !p.cardId;
      setData({ photos: j.photos.filter(plain), trash: j.trash.filter((p) => !p.taskId) });
      setTaskPhotos(j.photos.filter((p) => !!p.taskId).sort((a, b) => a.order - b.order));
      setCardPhotos(j.photos.filter((p) => !!p.cardId).sort((a, b) => a.order - b.order));
      setState('idle');
    } catch { setState('error'); }
  }, []);
  const ensure = useCallback(() => { if (!started.current) void reload(); }, [reload]);

  const ordered = useMemo(() => [...(data?.photos ?? [])].sort(byStepPosition), [data]);

  const [sort, setSortState] = useState<SortMode>(() => remembered(SORT_KEY, SORTS, 'default'));
  const [kind, setKindState] = useState<KindFilter>(() => remembered(KIND_KEY, KINDS, 'all'));
  const [query, setQuery] = useState('');
  const setSort = useCallback((s: SortMode) => { setSortState(s); remember(SORT_KEY, s); }, []);
  const setKind = useCallback((k: KindFilter) => { setKindState(k); remember(KIND_KEY, k); }, []);
  // 「사진」 = 이미지, 「문서」 = PDF(사진 정보에는 「글씨 많은 문서」 표시가 따로 남지 않는다)
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = ordered.filter((p) => (kind === 'all' || (kind === 'doc') === (p.kind === 'pdf'))
      && (!q || `${p.caption}\n${p.album}\n${stepLabel(steps, p.stepId)}`.toLowerCase().includes(q)));
    if (sort === 'newest') return f.sort((a, b) => b.takenAt.localeCompare(a.takenAt) || b.order - a.order);
    if (sort === 'oldest') return f.sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.order - b.order);
    return f;
  }, [ordered, kind, query, sort, steps]);

  const patch = useCallback<Ctx['patch']>(async (id, method, body = {}) => {
    try {
      const res = await busyFetch(`/api/photos/${id}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => null);
      if (!res.ok) { toast(typeof j?.message === 'string' ? j.message : '저장하지 못했어요.', { kind: 'error' }); return false; }
      await reload();
      return true;
    } catch {
      toast('저장하지 못했어요. 인터넷 연결을 확인해 주세요.', { kind: 'error' });
      return false;
    }
  }, [reload, toast]);

  // 올리기 창의 기본 단계: 진행 중인 첫 단계 → 없으면 안 끝난 첫 단계(타임라인의 「지금」과 같은 기준)
  const defaultStep = useMemo(() => {
    const st = (id: number) => doc?.steps[String(id)]?.status ?? 'todo';
    return steps.find((s) => st(s.id) === 'doing')?.id ?? steps.find((s) => st(s.id) !== 'done')?.id ?? steps[0]?.id ?? 1;
  }, [doc, steps]);

  // 크게 보기에서 넘기는 목록: 고른 사진 묶음(새 홈 사진 탭) → 한 단계(단계 창) → 사진 탭에 보이는 줄
  const viewList = useMemo(() => {
    if (viewIds) { const by = new Map([...ordered, ...taskPhotos, ...cardPhotos].map((p) => [p.id, p])); return viewIds.map((id) => by.get(id)).filter((p): p is PhotoView => !!p); }
    return viewStep === null ? shown : ordered.filter((p) => p.stepId === viewStep);
  }, [shown, ordered, taskPhotos, cardPhotos, viewStep, viewIds]);

  // 할 일 메모 · 단계 블록 사진 올리기: 사진 올리기 창과 같은 길(큰 사진은 미리 줄이고 한 장씩), 단계 = 그 할 일 · 블록 단계, taskId · cardId 표시
  const uploadAttached = useCallback(async (to: { taskId: string } | { cardId: string }, stepId: number, files: File[]) => {
    let okN = 0;
    for (const f of files) {
      try {
        if (!f.type.startsWith('image/')) throw new Error('사진만 올릴 수 있어요.');
        const fd = new FormData();
        fd.append('file', await shrinkIfLarge(f), 'photo.jpg');
        fd.append('stepId', String(stepId));
        if ('taskId' in to) fd.append('taskId', to.taskId); else fd.append('cardId', to.cardId);
        const res = await busyFetch('/api/photos', { method: 'POST', headers: { 'x-photos-upload': '1' }, body: fd }, { slow: true });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(typeof j?.message === 'string' ? j.message : '올리지 못했어요.');
        okN += 1;
      } catch (e) {
        toast(`${f.name}: ${e instanceof Error ? e.message : '올리지 못했어요.'}`, { kind: 'error' });
      }
    }
    await reload();
    if (okN > 0) toast(`사진 ${okN}장을 붙였어요.`);
  }, [reload, toast]);
  const uploadToTask = useCallback((taskId: string, stepId: number, files: File[]) => uploadAttached({ taskId }, stepId, files), [uploadAttached]);
  const uploadToCard = useCallback((cardId: string, stepId: number, files: File[]) => uploadAttached({ cardId }, stepId, files), [uploadAttached]);

  // 같은 단계 사진을 기본 순서로 놓고 한 칸 옮긴 뒤, 그 단계 사진들의 position 을 그 순서대로 다시 매겨 한 번에 저장한다
  const canMove = useCallback((id: string, dir: -1 | 1) => {
    const p = ordered.find((q) => q.id === id);
    if (!p) return false;
    const same = ordered.filter((q) => q.stepId === p.stepId);
    const j = same.findIndex((q) => q.id === id) + dir;
    return j >= 0 && j < same.length;
  }, [ordered]);
  const move = useCallback(async (id: string, dir: -1 | 1) => {
    const p = ordered.find((q) => q.id === id);
    if (!p || !canMove(id, dir)) return false;
    const arr = ordered.filter((q) => q.stepId === p.stepId);
    const i = arr.findIndex((q) => q.id === id);
    [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]];
    const positions = arr.map((q, k) => ({ id: q.id, position: k })).filter((x, k) => (arr[k].position ?? null) !== x.position);
    try {
      const res = await busyFetch('/api/photos', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ positions }) });
      const j = await res.json().catch(() => null);
      if (!res.ok) { toast(typeof j?.message === 'string' ? j.message : '순서를 저장하지 못했어요.', { kind: 'error' }); return false; }
      await reload();
      return true;
    } catch {
      toast('순서를 저장하지 못했어요. 인터넷 연결을 확인해 주세요.', { kind: 'error' });
      return false;
    }
  }, [ordered, canMove, reload, toast]);
  const viewIndex = viewId ? viewList.findIndex((p) => p.id === viewId) : -1;
  const remove = useCallback(async (p: PhotoView) => {
    // 할 일 메모 사진은 「삭제한 사진」 목록에 안 나오므로 되살리기는 알림의 「되돌리기」로만.
    // 블록 사진은 「삭제한 사진」(30일)에도 남고, 알림의 「되돌리기」로도 바로 되살린다
    const ok = await confirm({ title: '이 사진을 지울까요?', body: p.caption || p.album || undefined, note: p.taskId ? undefined : PHOTO_TRASH_NOTE, confirmLabel: '삭제', danger: true });
    if (!ok) return;
    // 지운 뒤에는 다음 사진(마지막이면 앞 사진)을 보여 준다
    const i = viewList.findIndex((q) => q.id === p.id);
    const next = viewList[i + 1] ?? viewList[i - 1] ?? null;
    if (await patch(p.id, 'DELETE')) {
      setViewId(next?.id ?? null);
      if (p.taskId || p.cardId) toast('사진을 지웠어요.', { ms: 8000, action: { label: '되돌리기', run: () => void patch(p.id, 'PATCH', { restore: true }) } });
      else toast('사진을 지웠어요.');
    }
  }, [confirm, viewList, patch, toast]);

  const value = useMemo<Ctx>(() => ({
    steps, data, state, ordered, taskPhotos, uploadToTask, cardPhotos, uploadToCard, shown, sort, setSort, kind, setKind, query, setQuery, move, canMove, ensure, reload,
    view: (id, stepId, ids) => { setViewStep(stepId ?? null); setViewIds(ids ?? null); setViewId(id); },
    upload: (stepId, album, opts) => { setUploadAlbum(album ?? ''); setUploadDoc(!!opts?.doc); setUploadStep(stepId ?? defaultStep); },
    patch,
  }), [steps, data, state, ordered, taskPhotos, uploadToTask, cardPhotos, uploadToCard, shown, sort, setSort, kind, setKind, query, move, canMove, ensure, reload, defaultStep, patch]);

  return (
    <C.Provider value={value}>
      {children}
      {viewIndex >= 0 && (
        <Lightbox list={viewList} index={viewIndex} steps={steps} onIndex={(i) => setViewId(viewList[i]?.id ?? null)} onClose={() => setViewId(null)}
          onSave={(p, body) => patch(p.id, 'PATCH', body)} onDelete={remove} onMove={move} canMove={canMove} showMove={!viewIds && (viewStep !== null || (sort === 'default' && !query.trim() && kind === 'all'))} />
      )}
      {uploadStep !== null && <UploadDialog steps={steps} initialStep={uploadStep} album={uploadAlbum} initialDoc={uploadDoc} onDone={() => void reload()} onClose={() => setUploadStep(null)} />}
    </C.Provider>
  );
}

const stepLabel = (steps: StepName[], id: number) => {
  if (id === REF_STEP) return REF_LABEL;
  const s = steps.find((x) => x.id === id);
  return s ? `${s.id}. ${s.title}` : `${id}단계`;
};

// 썸네일 한 칸(정사각형, 화면에 가까워질 때 불러온다)
// 썸네일 그림. 못 불러오면 깨진 그림 대신 짧은 글
function ThumbImg({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (failed) return <span className="flex h-full w-full items-center justify-center px-1 text-center text-sm text-muted">못 불러왔어요</span>;
  return (
    <>
      {!loaded && <span className="skeleton absolute inset-0" aria-hidden />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src(id, 'thumb')} alt="" loading="lazy" decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} className="h-full w-full object-cover" />
    </>
  );
}

// 썸네일 한 칸(정사각형, 화면에 가까워질 때 불러온다). 흰 종이 사진도 경계가 보이게 옅은 안쪽 테두리.
function Thumb({ p, onOpen }: { p: PhotoView; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label={`${p.caption || p.album || '사진'} 열기`}
      className="relative block aspect-square w-full overflow-hidden rounded-control bg-sunken">
      {p.hasImage
        ? <ThumbImg id={p.id} />
        : <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted"><i className="fas fa-file-pdf text-[28px]" aria-hidden /><span className="text-sm font-bold">PDF</span></span>}
      {/* 사진 위 「PDF」 표시: 어떤 화면 모드에서도 어두운 바탕 + 흰 글자 */}
      {p.kind === 'pdf' && p.hasImage && <span className="keep-light absolute left-1 top-1 rounded-control bg-ink/80 px-1.5 py-0.5 text-sm font-bold text-on-accent">PDF</span>}
      <span className="pointer-events-none absolute inset-0 rounded-control ring-1 ring-inset ring-ink/10" aria-hidden />
    </button>
  );
}

/**
 * 사진 검색칸 + 정렬(기본 순서 · 최신순 · 오래된순) 한 줄. 값은 PhotosProvider 의 query · sort(정렬은 이 브라우저에 기억).
 * 입력하는 대로(0.2초 쉬었다가) 거른다. 한글 조합 중에는 거르지 않고, 조합이 끝나면 바로 거른다. 우리 집 › 사진 · 새 홈 갤러리 맨 위가 같이 쓴다.
 */
export function PhotoSearchFields({ placeholder = '설명 · 앨범 · 단계', label = '사진 검색(설명 · 앨범 · 단계 이름)' }: { placeholder?: string; label?: string }) {
  const { sort, setSort, query, setQuery } = usePhotos();
  const [text, setText] = useState(query);
  const composing = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { if (!composing.current) setQuery(text.trim()); }, 200);
    return () => clearTimeout(t);
  }, [text, setQuery]);
  return (
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <i className="fas fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint" aria-hidden />
        <input type="search" value={text} aria-label={label} placeholder={placeholder} autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={(e) => { composing.current = false; setQuery(e.currentTarget.value.trim()); }}
          className={`min-h-11 w-full rounded-control border border-line-strong bg-surface pl-9 ${text ? 'pr-11' : 'pr-2'} text-base font-semibold text-ink placeholder:font-normal placeholder:text-muted focus:border-accent-ink focus:outline-none focus:ring-1 focus:ring-accent-ink [&::-webkit-search-cancel-button]:hidden`} />
        {text && (
          <button type="button" aria-label="검색어 지우기" onClick={() => { setText(''); setQuery(''); }}
            className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-control text-muted hover:text-ink">
            <i className="fas fa-times" aria-hidden />
          </button>
        )}
      </div>
      <select aria-label="정렬" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}
        className="min-h-11 shrink-0 rounded-control border border-line-strong bg-surface px-3 text-base font-semibold text-ink focus:border-accent-ink focus:outline-none focus:ring-1 focus:ring-accent-ink">
        <option value="default">올린 순서</option>
        <option value="newest">최신순</option>
        <option value="oldest">오래된순</option>
      </select>
    </div>
  );
}

// ── 우리 집 › 사진 화면 ──
const NO_GROUP = -1;   // 최신순 · 오래된순의 「단계 묶음 없음」 표시(제목 줄 없음)
/** noUpload: 첫 줄 「＋ 사진 올리기」를 뺀다(새 홈 「모든 사진」 — 올리기는 위 공사 전 · 후 두 곳만) */
export function PhotosPanel({ active, noUpload = false }: { active: boolean; noUpload?: boolean }) {
  const { steps, data, state, shown, sort, kind, setKind, query, ensure, reload, view, upload } = usePhotos();
  const filtering = query !== '' || kind !== 'all';
  useEffect(() => { if (active) ensure(); }, [active, ensure]);

  // 기본 순서: 단계 → 날짜 → 사진(사진이 없는 단계는 빠진다, 참고 사진 칸은 맨 끝).
  // 최신순 · 오래된순: 단계 묶음 없이 날짜로만 묶는다(NO_GROUP. 0 은 참고 사진 칸이라 -1 을 쓴다).
  const sections = useMemo(() => {
    const out: { stepId: number; days: { day: string; items: PhotoView[] }[]; n: number }[] = [];
    for (const p of shown) {
      const sid = sort === 'default' ? p.stepId : NO_GROUP;
      let s = out[out.length - 1];
      if (!s || s.stepId !== sid) { s = { stepId: sid, days: [], n: 0 }; out.push(s); }
      let d = s.days[s.days.length - 1];
      if (!d || d.day !== dayKey(p.takenAt)) { d = { day: dayKey(p.takenAt), items: [] }; s.days.push(d); }
      d.items.push(p);
      s.n += 1;
    }
    return out;
  }, [shown, sort]);

  if (state === 'anon') return <Card className="px-4 py-3"><p className="text-base text-muted">로그인한 뒤에 볼 수 있어요.</p></Card>;

  const has = !!data && data.photos.length > 0;
  return (
    <>
      <Card as="section" aria-label="사진">
        {/* 첫 줄 「＋ 사진 올리기」 → 올리기 창(단계는 지금 단계로 골라 둔 채) */}
        {!noUpload && <AddButton label="사진 올리기" onClick={() => upload()} />}

        {has && (
          <div className={`space-y-2 px-4 py-3 ${noUpload ? '' : 'border-t border-line'}`} role="search" aria-label="사진 찾기">
            <p className="text-sm text-muted" aria-live="polite">
              {filtering ? `${shown.length}장 (전체 ${data.photos.length}장)` : `${shown.length}장`}
            </p>
            <PhotoSearchFields />
            <Segmented<KindFilter> label="보기 거르기" value={kind} onChange={setKind}
              options={[{ value: 'all', label: '전체' }, { value: 'image', label: '사진' }, { value: 'doc', label: '문서' }]} />
          </div>
        )}

        {has && shown.length === 0 && (
          <p className="border-t border-line px-4 py-3 text-base text-muted">{query ? `「${query}」에 맞는 ${kind === 'doc' ? '문서가' : '사진이'} 없어요.` : kind === 'doc' ? '올린 문서가 없어요.' : '올린 사진이 없어요.'}</p>
        )}
        {state === 'loading' && !data && (
          <div className="border-t border-line px-4 py-3" role="status" aria-busy="true">
            <span className="sr-only">사진을 불러오는 중…</span>
            {/* 실제 목록과 같은 틀: 단계 제목 줄 + 날짜 줄 + 썸네일 격자(+ 설명 줄) */}
            <div aria-hidden>
              <span className="skeleton mb-1 block h-6 w-44 rounded-control bg-sunken" />
              <span className="skeleton mb-1 mt-2 block h-4 w-16 rounded-control bg-sunken" />
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {[0, 1, 2, 3, 4, 5].map((k) => (
                  <div key={k}>
                    <span className="skeleton block aspect-square w-full rounded-control bg-sunken" />
                    <span className="skeleton mt-1 block h-4 w-3/4 rounded-control bg-sunken" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {state === 'error' && (
          <p className="border-t border-line px-4 py-3 text-base text-ink-soft">
            사진을 불러오지 못했어요. <button type="button" className={textBtn} onClick={() => void reload()}>다시 불러오기</button>
          </p>
        )}
        {data && data.photos.length === 0 && (
          <p className="border-t border-line px-4 py-3 text-base text-muted">아직 사진이 없어요. 집 사진, 계약서, 등기부 같은 걸 올려 두세요.</p>
        )}

        {sections.length > 0 && (
          <div className="border-t border-line px-4 pb-4 pt-3">
            {sections.map((s) => (
              <div key={s.stepId} className="mt-6 first:mt-0">
                {s.stepId !== NO_GROUP && <h3 className="flex items-baseline gap-2 text-base font-bold text-ink">{stepLabel(steps, s.stepId)}<span className="text-sm font-normal text-muted">{s.n}</span></h3>}
                {s.days.map((d) => (
                  <div key={d.day} className="mt-2">
                    <p className="mb-1 text-sm text-muted">{dayLabel(d.day)}</p>
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                      {d.items.map((p) => (
                        <li key={p.id} className="min-w-0">
                          <Thumb p={p} onOpen={() => view(p.id)} />
                          {(p.caption || p.album) && <p className="mt-1 line-clamp-1 text-sm text-ink-soft">{p.caption || p.album}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 맨 아래 「삭제한 사진 n개」(기본 접힘) — 할 일 · 집 정보 · 기록의 「삭제한 ○○」와 같은 모양 */}
      <PhotoTrash className="mt-8" />
    </>
  );
}

/** 「삭제한 사진 n개」 접는 상자(지운 게 없으면 그리지 않는다). 우리 집 › 사진 · 새 홈 갤러리 맨 아래가 같이 쓴다 */
export function PhotoTrash({ className = '' }: { className?: string }) {
  const { steps, data, patch } = usePhotos();
  const [trashOpen, setTrashOpen] = useState(false);
  const trashId = useId();
  if (!data || data.trash.length === 0) return null;
  return (
    <Card as="section" aria-label="삭제한 사진" className={className}>
      <FoldRow label="삭제한 사진" count={data.trash.length} open={trashOpen} onToggle={() => setTrashOpen((v) => !v)} controls={trashId} />
      {trashOpen && (
        <div id={trashId} className="border-t border-line">
          <p className="px-4 pt-3 text-sm text-muted">지운 지 30일이 지나면 완전히 사라져요.</p>
          <ul>
            {data.trash.map((p) => (
              <li key={p.id} className={`${cardRowCls} flex items-center gap-3 px-4 py-3`}>
                <span className="relative size-12 shrink-0 overflow-hidden rounded-control bg-sunken">
                  {p.hasImage && <ThumbImg id={p.id} />}
                  <span className="pointer-events-none absolute inset-0 rounded-control ring-1 ring-inset ring-ink/10" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-muted">{stepLabel(steps, p.stepId)}</div>
                  <div className="truncate text-base font-semibold text-ink-soft">{p.caption || p.album || (p.kind === 'pdf' ? 'PDF' : '사진')}</div>
                  <div className="flex flex-wrap gap-x-2 text-sm text-muted"><span>{p.deletedBy ? `${withGa(p.deletedBy)} 삭제` : '삭제'}</span><span>{relTime(p.deletedAt)}</span></div>
                </div>
                <button type="button" className={btnGhost} onClick={() => void patch(p.id, 'PATCH', { restore: true })}>되살리기</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ── 단계 시트의 사진 줄: 그 단계 사진을 작은 썸네일로 가로로 늘어놓고, 누르면 같은 크게 보기 ──
// 이름 · props({ stepId })는 단계 시트(StepModal)가 쓰므로 바꾸지 않는다.
export function StepPhotos({ stepId }: { stepId: number }) {
  const { ordered, ensure, view, upload, state } = usePhotos();
  useEffect(() => { ensure(); }, [ensure]);
  const items = ordered.filter((p) => p.stepId === stepId);
  return (
    <section aria-label="이 단계 사진">
      <h3 className="mb-2 flex items-baseline gap-2 text-base font-bold text-ink">사진{items.length > 0 && <span className="text-sm font-normal text-muted">{items.length}</span>}</h3>
      {items.length > 0 ? (
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {items.map((p) => <li key={p.id} className="w-19 shrink-0"><Thumb p={p} onOpen={() => view(p.id, stepId)} /></li>)}
        </ul>
      ) : (
        <p className="text-base text-muted">{state === 'error' ? '사진을 불러오지 못했어요.' : '아직 이 단계 사진이 없어요.'}</p>
      )}
      {/* 마지막 줄 「＋ 사진」(새 홈 단계 블록 「＋ 사진」과 같은 이름 · 모양 — AddTextButton. 이 단계를 골라 둔 채로 올리기 창이 열린다) */}
      <div className="-mx-3 mt-1"><AddTextButton label="사진" srLabel=": 이 단계에 올리기" onClick={() => upload(stepId)} /></div>
    </section>
  );
}

// ── 화면 위에 덮는 창 공통: Esc = 이 창만 닫기(뒤의 시트까지 닫히지 않게 먼저 가로챈다) ──
function useOverlayKeys(onClose: () => void, extra?: (e: KeyboardEvent) => void) {
  const ref = useRef({ onClose, extra });
  useEffect(() => { ref.current = { onClose, extra }; });
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="alertdialog"]')) return;   // 확인 창이 떠 있으면 그쪽이 먼저
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); ref.current.onClose(); return; }
      ref.current.extra?.(e);
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); if (back && document.contains(back)) back.focus(); };
  }, []);
}

// Vercel 함수는 본문 4.5MB 까지만 받는다: 그보다 큰 사진은 폰에서 먼저 줄여 보낸다(서버가 다시 1600 · 2400px 로 줄인다)
const SEND_MAX = 3.5 * 1024 * 1024;
const PDF_MAX = 4 * 1024 * 1024;
async function shrinkIfLarge(f: File): Promise<Blob> {
  if (f.size <= SEND_MAX) return f;
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(f); } catch {
    throw new Error('사진이 너무 크고 이 기기에서 열 수 없어요. JPG로 바꿔 올려 주세요.');
  }
  const scale = Math.min(1, 3000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  for (const q of [0.9, 0.8, 0.7]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= SEND_MAX) return blob;
  }
  throw new Error('사진이 너무 커요. 조금 줄여서 올려 주세요.');
}

function StepSelect({ steps, value, onChange, id }: { steps: StepName[]; value: number; onChange: (n: number) => void; id?: string }) {
  return (
    <select id={id} aria-label={id ? undefined : '단계'} className={inputCls} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {steps.map((s) => <option key={s.id} value={s.id}>{s.id}. {s.title}</option>)}
      <option value={REF_STEP}>{REF_LABEL}</option>
    </select>
  );
}

// ── 사진 올리기 창 ──
function UploadDialog({ steps, initialStep, album = '', initialDoc = false, onDone, onClose }: { steps: StepName[]; initialStep: number; album?: string; initialDoc?: boolean; onDone: () => void; onClose: () => void }) {
  const uid = useId();
  const { toast, confirmDiscard } = useProgress();
  const [files, setFiles] = useState<File[]>([]);
  const [stepId, setStepId] = useState(initialStep);
  const [caption, setCaption] = useState('');
  const [doc, setDoc] = useState(initialDoc);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const { busy, run } = useBusy();
  useDirty('form:photos-upload', files.length > 0 || busy);
  const firstRef = useRef<HTMLLabelElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  const tryClose = useCallback(async () => {
    if (busy) return;                                // 올리는 중에는 닫지 않는다
    if (files.length && !(await confirmDiscard())) return;
    onClose();
  }, [busy, files.length, confirmDiscard, onClose]);
  useOverlayKeys(() => void tryClose());

  const submit = () => run(async () => {
    const errs: string[] = [];
    setErrors([]);
    setProgress({ done: 0, total: files.length });
    let okN = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
        if (isPdf && f.size > PDF_MAX) throw new Error('PDF는 4MB까지 올릴 수 있어요.');
        const blob = isPdf ? f : await shrinkIfLarge(f);
        const fd = new FormData();
        fd.append('file', blob, isPdf ? 'file.pdf' : 'photo.jpg');
        fd.append('stepId', String(stepId));
        fd.append('caption', caption);
        if (album) fd.append('album', album);
        if (doc) fd.append('doc', '1');
        const res = await busyFetch('/api/photos', { method: 'POST', headers: { 'x-photos-upload': '1' }, body: fd }, { slow: true });
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(typeof j?.message === 'string' ? j.message
            : res.status === 413 ? '파일이 너무 커요.' : res.status === 401 || res.status === 403 ? '로그인이 필요해요.' : '올리지 못했어요.');
        }
        okN += 1;
      } catch (e) {
        errs.push(`${f.name}: ${e instanceof Error ? e.message : '올리지 못했어요.'}`);
      }
      setProgress({ done: i + 1, total: files.length });
    }
    onDone();
    setErrors(errs);
    setProgress(null);
    if (okN > 0) toast(`${okN}장 올렸어요.`);
    if (errs.length === 0) { setFiles([]); onClose(); }
    else setFiles(files.filter((f) => errs.some((e) => e.startsWith(`${f.name}:`))));
  });

  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`}>
      <div className="absolute inset-0 bg-black/50 dark:bg-black/60" onClick={() => void tryClose()} />
      <form className="relative max-h-[90vh] w-full max-w-content space-y-3 overflow-y-auto rounded-t-panel bg-surface p-4 shadow-2xl md:rounded-panel" onSubmit={(e) => {
        e.preventDefault();
        if (!files.length || busy) return;
        void submit();
      }}>
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${uid}-t`} className="text-xl font-bold text-ink">{album ? `사진 올리기 · ${album}` : '사진 올리기'}</h2>
          <IconButton label="닫기" icon="fa-xmark" variant="filled" disabled={busy} onClick={() => void tryClose()} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <input id={`${uid}-file`} type="file" accept="image/*,application/pdf" multiple className="sr-only"
            onChange={(e) => { setFiles([...(e.target.files ?? [])]); setErrors([]); }} />
          <label ref={firstRef} tabIndex={-1} htmlFor={`${uid}-file`} className={`${btnGhost} cursor-pointer`}>
            <i className="fas fa-images text-base text-muted" aria-hidden />{files.length ? '다시 고르기' : '사진 · PDF 고르기'}
          </label>
          {files.length > 0 && <span className="text-base text-ink-soft">{files.length}개 골랐어요</span>}
        </div>
        <div>
          <label htmlFor={`${uid}-step`} className="mb-1 block text-sm text-ink-soft">단계</label>
          <StepSelect id={`${uid}-step`} steps={steps} value={stepId} onChange={setStepId} />
        </div>
        <div>
          <label htmlFor={`${uid}-cap`} className="mb-1 block text-sm text-ink-soft">설명 (안 적어도 돼요)</label>
          <input id={`${uid}-cap`} className={inputCls} maxLength={100} placeholder="예: 주방" value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>
        <label className="flex min-h-11 items-center gap-3 text-base font-semibold text-ink">
          <input type="checkbox" className="size-5 shrink-0" checked={doc} onChange={(e) => setDoc(e.target.checked)} />
          <span>글씨 많은 문서 <span className="text-sm font-normal text-muted">(계약서 · 등기부처럼 작은 글씨를 또렷하게)</span></span>
        </label>
        {progress && (
          <div aria-live="polite">
            <p className="text-sm text-ink-soft">올리는 중… {progress.done}/{progress.total}</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
          </div>
        )}
        {errors.length > 0 && (
          <ul className="space-y-1 text-sm text-danger-ink" role="alert">
            {errors.map((e) => <li key={e} className="flex gap-1.5"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-danger" aria-hidden />{e}</li>)}
          </ul>
        )}
        <div className="flex justify-end gap-2 pb-[env(safe-area-inset-bottom)]">
          <button type="button" className={btnGhost} disabled={busy} onClick={() => void tryClose()}>취소</button>
          <button className={btnPrimary} disabled={busy || !files.length}>{busy ? '올리는 중…' : '올리기'}</button>
        </div>
      </form>
    </div>
  );
}

// ── 크게 보기 ──
function Lightbox({ list, index, steps, onIndex, onClose, onSave, onDelete, onMove, canMove, showMove }: {
  list: PhotoView[]; index: number; steps: StepName[];
  onIndex: (i: number) => void; onClose: () => void;
  onSave: (p: PhotoView, body: { stepId: number; caption: string }) => Promise<boolean>;
  onDelete: (p: PhotoView) => void;
  onMove: (id: string, dir: -1 | 1) => Promise<boolean>;
  canMove: (id: string, dir: -1 | 1) => boolean;
  /** 순서 단추를 보일지: 정렬이 기본이고 검색 · 거르기가 없을 때(또는 단계 창에서 연 경우)만 */
  showMove: boolean;
}) {
  const p = list[index];
  const [editing, setEditing] = useState(false);
  const [stepId, setStepId] = useState(p.stepId);
  const [caption, setCaption] = useState(p.caption);
  const [shownId, setShownId] = useState(p.id);
  // 큰 그림 상태: 불러오는 중 · 불러옴 · 실패. actual = 원래 크기로 보며 스크롤(글씨 많은 문서용)
  const [img, setImg] = useState<'loading' | 'ok' | 'error'>('loading');
  const [actual, setActual] = useState(false);
  const { busy, run } = useBusy();
  const closeRef = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const n = list.length;

  // 다른 사진으로 넘어가면 고치던 칸을 닫는다
  if (shownId !== p.id) {
    setShownId(p.id);
    setEditing(false);
    setStepId(p.stepId);
    setCaption(p.caption);
    setImg('loading');
    setActual(false);
  }

  const go = useCallback((d: number) => { if (n > 1) onIndex((index + d + n) % n); }, [index, n, onIndex]);
  useEffect(() => { closeRef.current?.focus(); }, []);
  // Esc: 고치는 중이면 고치기만 닫고, 아니면 크게 보기를 닫는다. ←/→ = 넘기기(입력칸에 쓰는 중이면 그대로 둔다)
  useOverlayKeys(() => (editing ? setEditing(false) : onClose()), (e) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
    if (!typing && e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (!typing && e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });

  // 옆 사진을 미리 받아 둔다(넘길 때 바로 보이게)
  useEffect(() => {
    for (const d of [1, -1]) {
      const q = list[(index + d + n) % n];
      if (q?.hasImage && q.id !== p.id) { const img = new Image(); img.src = src(q.id, 'full'); }
    }
  }, [index, list, n, p.id]);

  const onTouchStart = (e: TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current; touch.current = null;
    if (!s || actual) return;                        // 원래 크기로 보는 중엔 손가락 이동 = 스크롤
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  // 옆 화살표는 넓은 화면만. 폰은 아래 줄의 「이전」「다음」 단추
  // 크게 보기는 화면 모드와 상관없이 늘 어두운 면이다(.keep-light 로 토큰을 밝은 값으로 되돌린 뒤 어둡게 칠한다)
  const navBtn = 'absolute top-1/2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 sm:flex';
  const darkBtn = 'inline-flex min-h-11 shrink-0 items-center rounded-control bg-white/10 px-3 text-base font-bold hover:bg-white/20';
  return (
    <div className="keep-light fixed inset-0 z-[70] flex flex-col bg-slate-950" role="dialog" aria-modal="true" aria-label="사진 크게 보기">
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="min-w-0 text-sm text-slate-300">
          <span className="block truncate">{stepLabel(steps, p.stepId)}</span>
          <span className="flex flex-wrap gap-x-3"><span>{dayLabel(p.takenAt)}</span>{p.album && <span className="truncate">{p.album}</span>}<span>{index + 1} / {n}</span></span>
        </p>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <i className="fas fa-times" aria-hidden />
        </button>
      </div>
      <div className="relative min-h-0 flex-1 select-none" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {p.hasImage ? (
          // 그림을 누르면 「화면에 맞춤」 ↔ 「원래 크기(스크롤)」
          <div className={`absolute inset-0 ${actual ? 'overflow-auto' : 'overflow-hidden'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={p.id} src={src(p.id, 'full')} alt={p.caption || p.album || '사진'}
              onLoad={() => setImg('ok')} onError={() => setImg('error')} onClick={() => setActual((v) => !v)}
              className={`${actual ? 'm-auto block max-w-none cursor-zoom-out' : 'h-full w-full cursor-zoom-in object-contain'} ${img === 'error' ? 'invisible' : ''}`} />
          </div>
        ) : <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-300"><i className="fas fa-file-pdf text-[56px] text-slate-500" aria-hidden /><span className="text-base font-bold">PDF 문서</span></div>}
        {p.hasImage && img === 'loading' && <span className="skeleton pointer-events-none absolute inset-3 rounded-panel bg-white/5" aria-hidden />}
        {p.hasImage && img !== 'ok' && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-base text-slate-300" aria-live="polite">
            {img === 'loading' ? '불러오는 중…' : '사진을 불러오지 못했어요.'}
          </p>
        )}
        {n > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="이전 사진" className={`${navBtn} left-3`}><i className="fas fa-chevron-left" aria-hidden /></button>
            <button type="button" onClick={() => go(1)} aria-label="다음 사진" className={`${navBtn} right-3`}><i className="fas fa-chevron-right" aria-hidden /></button>
          </>
        )}
      </div>
      <div className="shrink-0 bg-slate-900 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 text-white">
        {editing ? (
          <form className="mx-auto max-w-content space-y-2" onSubmit={(e) => {
            e.preventDefault();
            void run(async () => { if (await onSave(p, { stepId, caption })) setEditing(false); });
          }}>
            <label htmlFor={`${shownId}-step`} className="block text-sm text-slate-300">단계</label>
            <StepSelect id={`${shownId}-step`} steps={steps} value={stepId} onChange={setStepId} />
            <label htmlFor={`${shownId}-cap`} className="block text-sm text-slate-300">설명</label>
            <input id={`${shownId}-cap`} className={inputCls} maxLength={100} value={caption} placeholder="예: 주방" onChange={(e) => setCaption(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => setEditing(false)}>취소</button>
              <button className={btnPrimary} disabled={busy}>저장</button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {n > 1 && (
              <div className="flex w-full justify-between gap-2 sm:hidden">
                <button type="button" onClick={() => go(-1)} className={darkBtn}><i className="fas fa-chevron-left mr-1.5" aria-hidden />이전</button>
                <button type="button" onClick={() => go(1)} className={darkBtn}>다음<i className="fas fa-chevron-right ml-1.5" aria-hidden /></button>
              </div>
            )}
            <p className="min-w-0 flex-1 basis-40 text-base font-semibold">{p.caption || <span className="font-normal text-slate-400">설명 없음</span>}</p>
            {p.kind === 'pdf' && (
              <a href={src(p.id, 'file')} target="_blank" rel="noopener" className="inline-flex min-h-11 shrink-0 items-center rounded-control bg-surface px-3 text-base font-bold text-ink hover:bg-sunken">
                <i className="fas fa-file-pdf mr-1.5 text-muted" aria-hidden />PDF 열기
              </a>
            )}
            {/* 글씨 많은 문서를 PC 에서 크게: 큰 사진만 새 탭으로 연다(로그인한 같은 창이라 그대로 열린다) */}
            {p.kind === 'image' && p.hasImage && <a href={src(p.id, 'full')} target="_blank" rel="noopener" className={darkBtn}>크게 보기</a>}
            {p.originalUrl && <a href={p.originalUrl} target="_blank" rel="noopener noreferrer" className={darkBtn}>원본 보기</a>}
            {/* 같은 단계 안에서 한 칸씩. 맨 앞 · 맨 뒤에서는 눌리지 않는다. 정렬 · 검색 · 거르기 중에는 숨긴다 */}
            {showMove && (
              <div className="flex w-full items-center gap-2">
                <span className="text-sm text-slate-300">순서</span>
                <button type="button" disabled={busy || !canMove(p.id, -1)} onClick={() => void run(() => onMove(p.id, -1))} aria-label="같은 단계에서 앞자리로 옮기기" className={`${darkBtn} disabled:opacity-40`}>앞자리로</button>
                <button type="button" disabled={busy || !canMove(p.id, 1)} onClick={() => void run(() => onMove(p.id, 1))} aria-label="같은 단계에서 뒷자리로 옮기기" className={`${darkBtn} disabled:opacity-40`}>뒷자리로</button>
              </div>
            )}
            <button type="button" onClick={() => setEditing(true)} className={darkBtn}>고치기</button>
            <TrashButton label="이 사진 지우기" onClick={() => onDelete(p)} />
          </div>
        )}
      </div>
    </div>
  );
}
