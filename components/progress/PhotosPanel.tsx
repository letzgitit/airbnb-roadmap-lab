'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import type { PhotoView } from '@/lib/core/photos';
import { relTime, withGa } from '@/lib/client/format';
import { useProgress } from './ProgressProvider';
import { AddRow, btnGhost, btnPrimary, inputCls, textBtn, TrashButton, useBusy, useDirty } from './bits';

// 삭제 확인 창 안내(서버가 30일 보관 — lib/core/photos.ts TRASH_KEEP_MS)
const PHOTO_TRASH_NOTE = '지운 사진은 30일 동안 사진 탭 맨 아래 「삭제한 사진」에서 되살릴 수 있어요.';

// 사진: 로그인한 두 사람만 /api/photos 로 받는다(공개 화면 · 저장소 코드에는 사진도 설명도 없다).
// 타임라인 단계별로 묶고(단계 순서, 사진이 없는 단계는 숨김), 단계 안은 찍은 날짜 순.
// 「집 정보 · 기록」 창의 「사진」 탭과 단계 창의 사진 줄이 같은 목록 · 크게 보기 · 올리기 창을 같이 쓴다(PhotosProvider).

export interface StepName { id: number; title: string }
interface Data { photos: PhotoView[]; trash: PhotoView[] }
const src = (id: string, size: 'thumb' | 'full' | 'file') => `/api/photos/${id}?size=${size}`;
// 「2026-10-14T13:05:22」 → 「10월 14일」
const dayKey = (t: string) => t.slice(0, 10);
const dayLabel = (t: string) => { const [, m, d] = dayKey(t).split('-'); return m && d ? `${Number(m)}월 ${Number(d)}일` : ''; };

// 정렬: 단계 순서 → 찍은 시각 → 올린 순서
const byStepTime = (a: PhotoView, b: PhotoView) => a.stepId - b.stepId || a.takenAt.localeCompare(b.takenAt) || a.order - b.order;

interface Ctx {
  steps: StepName[];
  data: Data | null;
  state: 'idle' | 'loading' | 'error' | 'anon';
  /** 단계 순서 · 찍은 날짜 순으로 줄 세운 전체 사진(크게 보기의 앞뒤 넘기기도 이 순서) */
  ordered: PhotoView[];
  ensure: () => void;
  reload: () => Promise<void>;
  /** 크게 보기. stepId 를 주면 그 단계 사진 안에서만 넘긴다(단계 창 사진 줄) */
  view: (id: string, stepId?: number) => void;
  upload: (stepId?: number) => void;
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
  const [state, setState] = useState<Ctx['state']>('idle');
  const [viewId, setViewId] = useState<string | null>(null);
  const [viewStep, setViewStep] = useState<number | null>(null);
  const [uploadStep, setUploadStep] = useState<number | null>(null);
  const started = useRef(false);

  const reload = useCallback(async () => {
    setState((s) => (s === 'idle' && !started.current ? 'loading' : s));
    started.current = true;
    try {
      const res = await fetch('/api/photos', { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) { setData(null); setState('anon'); return; }
      if (!res.ok) { setState('error'); return; }
      setData(await res.json());
      setState('idle');
    } catch { setState('error'); }
  }, []);
  const ensure = useCallback(() => { if (!started.current) void reload(); }, [reload]);

  const ordered = useMemo(() => [...(data?.photos ?? [])].sort(byStepTime), [data]);

  const patch = useCallback<Ctx['patch']>(async (id, method, body = {}) => {
    try {
      const res = await fetch(`/api/photos/${id}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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

  const viewList = useMemo(() => (viewStep === null ? ordered : ordered.filter((p) => p.stepId === viewStep)), [ordered, viewStep]);
  const viewIndex = viewId ? viewList.findIndex((p) => p.id === viewId) : -1;
  const remove = useCallback(async (p: PhotoView) => {
    const ok = await confirm({ title: '이 사진을 지울까요?', body: p.caption || p.album || undefined, note: PHOTO_TRASH_NOTE, confirmLabel: '삭제', danger: true });
    if (!ok) return;
    // 지운 뒤에는 다음 사진(마지막이면 앞 사진)을 보여 준다
    const i = viewList.findIndex((q) => q.id === p.id);
    const next = viewList[i + 1] ?? viewList[i - 1] ?? null;
    if (await patch(p.id, 'DELETE')) { setViewId(next?.id ?? null); toast('사진을 지웠어요.'); }
  }, [confirm, viewList, patch, toast]);

  const value = useMemo<Ctx>(() => ({
    steps, data, state, ordered, ensure, reload,
    view: (id, stepId) => { setViewStep(stepId ?? null); setViewId(id); },
    upload: (stepId) => setUploadStep(stepId ?? defaultStep),
    patch,
  }), [steps, data, state, ordered, ensure, reload, defaultStep, patch]);

  return (
    <C.Provider value={value}>
      {children}
      {viewIndex >= 0 && (
        <Lightbox list={viewList} index={viewIndex} steps={steps} onIndex={(i) => setViewId(viewList[i]?.id ?? null)} onClose={() => setViewId(null)}
          onSave={(p, body) => patch(p.id, 'PATCH', body)} onDelete={remove} />
      )}
      {uploadStep !== null && <UploadDialog steps={steps} initialStep={uploadStep} onDone={() => void reload()} onClose={() => setUploadStep(null)} />}
    </C.Provider>
  );
}

const stepLabel = (steps: StepName[], id: number) => { const s = steps.find((x) => x.id === id); return s ? `${s.id}. ${s.title}` : `${id}단계`; };

// 썸네일 한 칸(정사각형, 화면에 가까워질 때 불러온다)
// 썸네일 그림. 못 불러오면 깨진 그림 대신 짧은 글
function ThumbImg({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="flex h-full w-full items-center justify-center px-1 text-center text-[12px] font-semibold text-slate-500">못 불러왔어요</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src(id, 'thumb')} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />;
}

// 썸네일 한 칸(정사각형, 화면에 가까워질 때 불러온다). 흰 종이 사진도 경계가 보이게 옅은 안쪽 테두리.
function Thumb({ p, onOpen }: { p: PhotoView; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label={`${p.caption || p.album || '사진'} 열기`}
      className="relative block aspect-square w-full overflow-hidden rounded-lg bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500">
      {p.hasImage
        ? <ThumbImg id={p.id} />
        : <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-500"><i className="fas fa-file-pdf text-[28px] text-slate-500" aria-hidden /><span className="text-[13px] font-bold">PDF</span></span>}
      {p.kind === 'pdf' && p.hasImage && <span className="absolute left-1 top-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[12px] font-bold text-white">PDF</span>}
      <span className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-slate-900/10" aria-hidden />
    </button>
  );
}

// ── 「집 정보 · 기록」 창의 「사진」 탭 ──
export function PhotosPanel({ active }: { active: boolean }) {
  const { steps, data, state, ordered, ensure, reload, view, upload, patch } = usePhotos();
  const [trashOpen, setTrashOpen] = useState(false);
  useEffect(() => { if (active) ensure(); }, [active, ensure]);

  // 단계 → 날짜 → 사진. 사진이 없는 단계는 빠진다.
  const sections = useMemo(() => {
    const out: { stepId: number; days: { day: string; items: PhotoView[] }[]; n: number }[] = [];
    for (const p of ordered) {
      let s = out[out.length - 1];
      if (!s || s.stepId !== p.stepId) { s = { stepId: p.stepId, days: [], n: 0 }; out.push(s); }
      let d = s.days[s.days.length - 1];
      if (!d || d.day !== dayKey(p.takenAt)) { d = { day: dayKey(p.takenAt), items: [] }; s.days.push(d); }
      d.items.push(p);
      s.n += 1;
    }
    return out;
  }, [ordered]);

  if (state === 'anon') return <p className="py-6 text-[15px] font-semibold text-slate-500">로그인한 뒤에 볼 수 있어요.</p>;

  return (
    <section className="min-w-0" aria-label="사진">
      <div className="flex items-center justify-between gap-2 pb-3 pt-1">
        <p className="text-[13px] font-semibold text-slate-500">{data && data.photos.length > 0 ? `사진 ${data.photos.length}장` : ''}</p>
        <button type="button" className={btnPrimary} onClick={() => upload()}>
          <i className="fas fa-plus mr-1.5 text-[14px]" aria-hidden />사진 올리기
        </button>
      </div>

      {state === 'loading' && !data && <p className="py-6 text-[15px] font-semibold text-slate-500">사진을 불러오는 중…</p>}
      {state === 'error' && (
        <p className="py-4 text-[15px] font-semibold text-slate-600">
          사진을 불러오지 못했어요. <button type="button" className={textBtn} onClick={() => void reload()}>다시 불러오기</button>
        </p>
      )}
      {data && data.photos.length === 0 && (
        <p className="py-4 text-[15px] font-semibold text-slate-500">아직 사진이 없어요. 집 사진, 계약서, 등기부 같은 걸 올려 두세요.</p>
      )}

      {sections.map((s) => (
        <div key={s.stepId} className="mt-5 first:mt-0">
          <h3 className="mb-1 flex items-baseline gap-2 text-[15px] font-bold text-slate-900">{stepLabel(steps, s.stepId)}<span className="text-[13px] font-semibold text-slate-500">{s.n}</span></h3>
          {s.days.map((d) => (
            <div key={d.day} className="mt-2">
              <p className="mb-1 text-[13px] font-semibold text-slate-500">{dayLabel(d.day)}</p>
              <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
                {d.items.map((p) => (
                  <li key={p.id} className="min-w-0">
                    <Thumb p={p} onOpen={() => view(p.id)} />
                    {(p.caption || p.album) && <p className="mt-0.5 line-clamp-1 text-[13px] font-semibold text-slate-600">{p.caption || p.album}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}

      {data && data.trash.length > 0 && (
        <div className="mt-8 border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-[17px] font-bold text-slate-800"><i className="fas fa-trash-can text-slate-500" aria-hidden /> 삭제한 사진 <span className="font-semibold text-slate-500">{data.trash.length}</span></h3>
            <button type="button" className={textBtn} onClick={() => setTrashOpen((v) => !v)} aria-expanded={trashOpen}>{trashOpen ? '접기' : '보기'}</button>
          </div>
          {trashOpen && (
            <>
              <p className="mt-1 text-[13px] text-slate-500">지운 지 30일이 지나면 완전히 사라져요.</p>
              <ul className="mt-2">
                {data.trash.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 border-b border-slate-200 py-3 last:border-b-0">
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-slate-100">
                      {p.hasImage && <ThumbImg id={p.id} />}
                      <span className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-slate-900/10" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-slate-500">{stepLabel(steps, p.stepId)}</div>
                      <div className="truncate text-[15px] font-semibold text-slate-700">{p.caption || p.album || (p.kind === 'pdf' ? 'PDF' : '사진')}</div>
                      <div className="flex flex-wrap gap-x-2 text-[13px] font-semibold text-slate-500"><span>{p.deletedBy ? `${withGa(p.deletedBy)} 삭제` : '삭제'}</span><span>{relTime(p.deletedAt)}</span></div>
                    </div>
                    <button type="button" className={btnGhost} onClick={() => void patch(p.id, 'PATCH', { restore: true })}>복원</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ── 단계 창의 사진 줄: 그 단계 사진을 작은 썸네일로 가로로 늘어놓고, 누르면 같은 크게 보기 ──
export function StepPhotos({ stepId }: { stepId: number }) {
  const { ordered, ensure, view, upload, state } = usePhotos();
  useEffect(() => { ensure(); }, [ensure]);
  const items = ordered.filter((p) => p.stepId === stepId);
  return (
    <section aria-label="이 단계 사진">
      <h3 className="mb-1 flex items-baseline gap-2 text-[15px] font-bold text-slate-700">사진{items.length > 0 && <span className="text-[13px] font-semibold text-slate-500">{items.length}</span>}</h3>
      {items.length > 0 ? (
        <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {items.map((p) => <li key={p.id} className="w-[76px] shrink-0"><Thumb p={p} onOpen={() => view(p.id, stepId)} /></li>)}
        </ul>
      ) : (
        <p className="text-[13px] font-semibold text-slate-500">{state === 'error' ? '사진을 불러오지 못했어요.' : '아직 이 단계 사진이 없어요.'}</p>
      )}
      {/* 「할 일 추가」와 같은 모양의 올리기 줄(이 단계를 골라 둔 채로 열린다) */}
      <AddRow label="사진 올리기" onClick={() => upload(stepId)} />
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
    </select>
  );
}

// ── 사진 올리기 창 ──
function UploadDialog({ steps, initialStep, onDone, onClose }: { steps: StepName[]; initialStep: number; onDone: () => void; onClose: () => void }) {
  const uid = useId();
  const { toast, confirmDiscard } = useProgress();
  const [files, setFiles] = useState<File[]>([]);
  const [stepId, setStepId] = useState(initialStep);
  const [caption, setCaption] = useState('');
  const [doc, setDoc] = useState(false);
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
        if (doc) fd.append('doc', '1');
        const res = await fetch('/api/photos', { method: 'POST', headers: { 'x-photos-upload': '1' }, body: fd });
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
      <div className="absolute inset-0 bg-slate-900/60" onClick={() => void tryClose()} />
      <form className="relative max-h-[90vh] w-full max-w-[520px] space-y-3 overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl md:rounded-3xl" onSubmit={(e) => {
        e.preventDefault();
        if (!files.length || busy) return;
        void submit();
      }}>
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${uid}-t`} className="text-xl font-bold text-slate-900">사진 올리기</h2>
          <button type="button" onClick={() => void tryClose()} aria-label="닫기" disabled={busy}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40"><i className="fas fa-times" aria-hidden /></button>
        </div>
        <div>
          <input id={`${uid}-file`} type="file" accept="image/*,application/pdf" multiple className="sr-only"
            onChange={(e) => { setFiles([...(e.target.files ?? [])]); setErrors([]); }} />
          <label ref={firstRef} tabIndex={-1} htmlFor={`${uid}-file`} className={`${btnGhost} inline-flex cursor-pointer items-center`}>
            <i className="fas fa-images mr-1.5 text-[15px] text-slate-500" aria-hidden />{files.length ? '다시 고르기' : '사진 · PDF 고르기'}
          </label>
          <span className="ml-3 text-[15px] font-semibold text-slate-700">{files.length ? `${files.length}개 골랐어요` : ''}</span>
        </div>
        <div>
          <label htmlFor={`${uid}-step`} className="mb-1 block text-[13px] font-bold text-slate-600">단계</label>
          <StepSelect id={`${uid}-step`} steps={steps} value={stepId} onChange={setStepId} />
        </div>
        <div>
          <label htmlFor={`${uid}-cap`} className="mb-1 block text-[13px] font-bold text-slate-600">설명 (안 적어도 돼요)</label>
          <input id={`${uid}-cap`} className={inputCls} maxLength={100} placeholder="예: 주방" value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-[15px] font-semibold text-slate-700">
          <input type="checkbox" className="h-5 w-5 shrink-0" checked={doc} onChange={(e) => setDoc(e.target.checked)} />
          <span>글씨 많은 문서 <span className="text-[13px] text-slate-500">(계약서 · 등기부처럼 작은 글씨를 또렷하게)</span></span>
        </label>
        {progress && (
          <div aria-live="polite">
            <p className="text-[13px] font-bold text-slate-600">올리는 중… {progress.done}/{progress.total}</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} /></div>
          </div>
        )}
        {errors.length > 0 && (
          <ul className="space-y-1 text-[13px] font-semibold text-slate-800" role="alert">
            {errors.map((e) => <li key={e} className="flex gap-1.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" aria-hidden />{e}</li>)}
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
function Lightbox({ list, index, steps, onIndex, onClose, onSave, onDelete }: {
  list: PhotoView[]; index: number; steps: StepName[];
  onIndex: (i: number) => void; onClose: () => void;
  onSave: (p: PhotoView, body: { stepId: number; caption: string }) => Promise<boolean>;
  onDelete: (p: PhotoView) => void;
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
  const navBtn = 'absolute top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 sm:flex';
  const darkBtn = 'inline-flex min-h-11 shrink-0 items-center rounded-xl bg-white/10 px-3 text-[15px] font-bold hover:bg-white/20';
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950" role="dialog" aria-modal="true" aria-label="사진 크게 보기">
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="min-w-0 text-[13px] font-semibold leading-snug text-slate-300">
          <span className="block truncate">{stepLabel(steps, p.stepId)}</span>
          <span className="flex flex-wrap gap-x-3"><span>{dayLabel(p.takenAt)}</span>{p.album && <span className="truncate">{p.album}</span>}<span>{index + 1} / {n}</span></span>
        </p>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
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
        ) : <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-300"><i className="fas fa-file-pdf text-[56px] text-slate-500" aria-hidden /><span className="text-[15px] font-bold">PDF 문서</span></div>}
        {p.hasImage && img !== 'ok' && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[15px] font-semibold text-slate-300" aria-live="polite">
            {img === 'loading' ? <><i className="fas fa-spinner fa-spin mr-2" aria-hidden />불러오는 중…</> : '사진을 불러오지 못했어요.'}
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
          <form className="mx-auto max-w-[640px] space-y-2" onSubmit={(e) => {
            e.preventDefault();
            void run(async () => { if (await onSave(p, { stepId, caption })) setEditing(false); });
          }}>
            <label htmlFor={`${shownId}-step`} className="block text-[13px] font-bold text-slate-300">단계</label>
            <StepSelect id={`${shownId}-step`} steps={steps} value={stepId} onChange={setStepId} />
            <label htmlFor={`${shownId}-cap`} className="block text-[13px] font-bold text-slate-300">설명</label>
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
            <p className="min-w-0 flex-1 basis-40 text-[15px] font-semibold leading-snug">{p.caption || <span className="text-slate-400">설명 없음</span>}</p>
            {p.kind === 'pdf' && (
              <a href={src(p.id, 'file')} target="_blank" rel="noopener" className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-white px-3 text-[15px] font-bold text-slate-900 hover:bg-slate-100">
                <i className="fas fa-file-pdf mr-1.5 text-slate-500" aria-hidden />PDF 열기
              </a>
            )}
            {/* 글씨 많은 문서를 PC 에서 크게: 큰 사진만 새 탭으로 연다(로그인한 같은 창이라 그대로 열린다) */}
            {p.kind === 'image' && p.hasImage && <a href={src(p.id, 'full')} target="_blank" rel="noopener" className={darkBtn}>크게 보기</a>}
            {p.originalUrl && <a href={p.originalUrl} target="_blank" rel="noopener noreferrer" className={darkBtn}>원본 보기</a>}
            <button type="button" onClick={() => setEditing(true)} className={darkBtn}>고치기</button>
            <TrashButton label="이 사진 지우기" onClick={() => onDelete(p)} />
          </div>
        )}
      </div>
    </div>
  );
}
