'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { BatchView, BenchItem, ReactionView, Vote } from '@/lib/core/bench';
import { busyFetch } from '@/lib/client/busy';
import { displayName } from '@/lib/client/format';
import { devHeaders, useProgress } from './ProgressProvider';
import { AutoTextarea, btnGhost, btnPrimary, enterSubmit, inputCls, oneLine, textBtn, useDirty, useFormEsc } from './bits';

// 「집 정보 · 기록」 창의 「꾸미기 참고」 탭: 다른 사람들이 꾸민 집(인테리어 벤치마킹) 모음.
// 로그인한 두 사람만 /api/bench 로 받는다(우리 집 평수 · 구조 이야기가 들어 있어 공개 화면 · 저장소 코드에는 없다).
// 묶음(수집한 날)마다 맨 위에 공통 패턴, 아래에 카드. 가장 최근 묶음만 펼치고 지난 묶음은 접어 둔다.
// 카드마다 두 사람이 각자 좋아요 · 별로와 짧은 메모를 남긴다(누가 남겼는지 보인다).

const MEMO_MAX = 200;   // lib/core/bench.ts MEMO_MAX 와 같게
interface Data { batches: BatchView[]; reactions: Record<string, ReactionView[]> }
const ALL = '__all';
const SPACE_KEY = 'bench.space';
// 「2026-10-22」 → 「10월 22일」
const dateLabel = (d: string) => { const [, m, day] = d.split('-'); return m && day ? `${Number(m)}월 ${Number(day)}일` : d; };

export function BenchPanel({ active }: { active: boolean }) {
  const { toast } = useProgress();
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'anon'>('idle');
  const started = useRef(false);
  const [space, setSpaceState] = useState<string>(() => { try { return localStorage.getItem(SPACE_KEY) || ALL; } catch { return ALL; } });
  const setSpace = (s: string) => { setSpaceState(s); try { localStorage.setItem(SPACE_KEY, s); } catch { /* 저장이 막혀도 이번 화면에는 적용 */ } };
  const [openOld, setOpenOld] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    if (!started.current) setState('loading');
    started.current = true;
    try {
      const res = await busyFetch('/api/bench', { headers: devHeaders(), cache: 'no-store' });
      if (res.status === 401 || res.status === 403) { setData(null); setState('anon'); return; }
      if (!res.ok) { setState('error'); return; }
      setData(await res.json());
      setState('idle');
    } catch { setState('error'); }
  }, []);
  useEffect(() => { if (active && !started.current) void reload(); }, [active, reload]);

  // 내 반응 저장: 성공하면 그 항목의 내 줄만 바꾼다
  const save = useCallback(async (itemId: string, vote: Vote | null, memo: string) => {
    try {
      const res = await busyFetch('/api/bench', { method: 'PUT', headers: { 'content-type': 'application/json', ...devHeaders() }, body: JSON.stringify({ itemId, vote, memo }) });
      const j = await res.json().catch(() => null);
      if (!res.ok) { toast(typeof j?.message === 'string' ? j.message : '저장하지 못했어요.', { kind: 'error' }); return false; }
      setData((d) => {
        if (!d) return d;
        const others = (d.reactions[itemId] ?? []).filter((r) => !r.mine);
        const mine: ReactionView | null = j?.reaction ?? null;
        return { ...d, reactions: { ...d.reactions, [itemId]: mine ? [mine, ...others] : others } };
      });
      return true;
    } catch {
      toast('저장하지 못했어요. 인터넷 연결을 확인해 주세요.', { kind: 'error' });
      return false;
    }
  }, [toast]);

  // 거르기 칸: 자료에 실제로 있는 공간만(정해진 순서대로)
  const spaces = useMemo(() => {
    const order = ['전체', '거실주방', '손님방', '호스트방', '욕실', '현관', '조명·소품'];
    const have = new Set((data?.batches ?? []).flatMap((b) => b.items.map((it) => it.space)));
    return order.filter((s) => have.has(s as BenchItem['space']));
  }, [data]);
  const cur = space !== ALL && !spaces.includes(space) ? ALL : space;
  const pick = (items: BenchItem[]) => (cur === ALL ? items : items.filter((it) => it.space === cur));

  if (state === 'anon') return <p className="py-6 text-[15px] font-semibold text-slate-500">로그인한 뒤에 볼 수 있어요.</p>;

  const [latest, ...older] = data?.batches ?? [];
  return (
    <section className="min-w-0" aria-label="꾸미기 참고">
      <p className="pb-3 pt-1 text-[13px] font-semibold leading-snug text-slate-500">다른 집은 이렇게 꾸몄어요. 마음에 드는지 각자 남겨 두면 같이 볼 수 있어요.</p>

      {state === 'loading' && !data && (
        <div role="status" aria-busy="true">
          <span className="sr-only">불러오는 중…</span>
          <div aria-hidden className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1].map((k) => (
              <div key={k} className="overflow-hidden rounded-2xl border border-slate-200">
                <span className="skeleton block aspect-[16/9] w-full bg-slate-100" />
                <div className="p-4"><span className="skeleton block h-5 w-3/4 rounded bg-slate-100" /><span className="skeleton mt-2 block h-4 w-1/2 rounded bg-slate-100" /></div>
              </div>
            ))}
          </div>
        </div>
      )}
      {state === 'error' && (
        <p className="py-4 text-[15px] font-semibold text-slate-600">
          불러오지 못했어요. <button type="button" className={textBtn} onClick={() => void reload()}>다시 불러오기</button>
        </p>
      )}
      {data && !latest && (
        <p className="py-4 text-[15px] font-semibold text-slate-500">아직 모은 자료가 없어요. 자료가 모이면 여기에 공간별로 보여요.</p>
      )}

      {latest && spaces.length > 1 && (
        <div role="group" aria-label="공간 거르기" className="-mx-1 mb-4 flex flex-wrap gap-1.5 px-1">
          {[ALL, ...spaces].map((s) => {
            const on = cur === s;
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => setSpace(s)}
                className={`min-h-11 rounded-xl border px-3 text-[14px] ${on ? 'border-slate-300 bg-slate-200 font-bold text-slate-900' : 'border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-50'}`}>
                {s === ALL ? '모두' : s === '전체' ? '집 전체' : s}
              </button>
            );
          })}
        </div>
      )}

      {latest && <Batch b={latest} items={pick(latest.items)} reactions={data!.reactions} onSave={save} />}

      {older.length > 0 && (
        <div className="mt-8 border-t border-slate-200 pt-1">
          {older.map((b) => {
            const on = !!openOld[b.collectedAt];
            return (
              <div key={b.collectedAt} className="border-b border-slate-200 last:border-b-0">
                <button type="button" aria-expanded={on} onClick={() => setOpenOld((m) => ({ ...m, [b.collectedAt]: !on }))}
                  className="flex min-h-14 w-full items-center gap-3 py-3 text-left">
                  <span className="min-w-0 flex-1 text-[15px] font-bold text-slate-800">{dateLabel(b.collectedAt)} 모음 <span className="ml-1 text-[13px] font-semibold text-slate-500">{b.items.length}건</span></span>
                  <i className={`fas ${on ? 'fa-chevron-up' : 'fa-chevron-down'} shrink-0 text-[12px] text-slate-500`} aria-hidden />
                </button>
                {on && <div className="pb-6"><Batch b={b} items={pick(b.items)} reactions={data!.reactions} onSave={save} /></div>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

type SaveFn = (itemId: string, vote: Vote | null, memo: string) => Promise<boolean>;

// 묶음 하나: 공통 패턴 → 카드
function Batch({ b, items, reactions, onSave }: { b: BatchView; items: BenchItem[]; reactions: Data['reactions']; onSave: SaveFn }) {
  return (
    <div>
      {b.insights.length > 0 && (
        <div className="mb-5">
          <h3 className="flex items-baseline gap-2 text-[17px] font-bold text-slate-900">공통 패턴<span className="text-[13px] font-semibold text-slate-500">{dateLabel(b.collectedAt)} 모음</span></h3>
          <ol className="mt-2 space-y-2.5">
            {b.insights.map((ins, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-600">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold leading-snug text-slate-800">{ins.title}</p>
                  {ins.detail && <p className="mt-0.5 text-[14px] leading-relaxed text-slate-600">{ins.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {items.length === 0
        ? <p className="py-2 text-[15px] font-semibold text-slate-500">이 공간 자료는 이 모음에 없어요.</p>
        : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((it) => <li key={it.id} className="min-w-0"><Card it={it} reactions={reactions[it.id] ?? []} onSave={onSave} /></li>)}
          </ul>
        )}
    </div>
  );
}

// 외부 그림(출처 사이트). 못 불러오면 출처 이름이 든 회색 칸
function Thumb({ src, source }: { src: string | null; source: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100">
      {src && !failed ? (
        <>
          {!loaded && <span className="skeleton absolute inset-0" aria-hidden />}
          {/* 외부 주소라 next/image 도메인 목록 대신 일반 img. 출처 사이트가 막지 않게 referrer 를 보내지 않는다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} className="h-full w-full object-cover" />
        </>
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-slate-500">
          <i className="far fa-image text-[22px]" aria-hidden />
          <span className="text-[13px] font-bold">{source}</span>
        </span>
      )}
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <p className="text-[13px] font-bold text-slate-500">{children}</p>;

function Card({ it, reactions, onSave }: { it: BenchItem; reactions: ReactionView[]; onSave: SaveFn }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <a href={it.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true"><Thumb src={it.image} source={it.source} /></a>
      <div className="flex flex-1 flex-col gap-3 px-4 pb-3 pt-3">
        <div>
          <div className="flex flex-wrap gap-1.5 text-[12px] font-bold">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">{it.source}</span>
            <span className="rounded-md border border-slate-200 px-2 py-0.5 text-slate-600">{it.space === '전체' ? '집 전체' : it.space}</span>
          </div>
          <h4 className="mt-1.5 text-[16px] font-bold leading-snug text-slate-900">{it.title}</h4>
        </div>
        {it.fit && <div><Label>101호에 맞는 이유</Label><p className="mt-0.5 text-[15px] leading-relaxed text-slate-700">{it.fit}</p></div>}
        {it.takeaways.length > 0 && (
          <div>
            <Label>따라 할 점</Label>
            <ul className="mt-0.5 space-y-1">
              {it.takeaways.map((t, i) => (
                <li key={i} className="flex gap-2 text-[15px] leading-snug text-slate-700"><span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
        )}
        {it.cost && <p className="flex flex-wrap gap-x-2 text-[15px] text-slate-700"><span className="font-bold text-slate-500">비용</span>{it.cost}</p>}
        {it.caution && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-red-700 dark:text-red-300"><i className="fas fa-triangle-exclamation text-[12px]" aria-hidden />주의</p>
            <p className="mt-0.5 text-[14px] leading-relaxed text-slate-800">{it.caution}</p>
          </div>
        )}
        <a href={it.url} target="_blank" rel="noopener noreferrer" className={`${textBtn} mt-auto self-start`}>
          원문 보기<i className="fas fa-arrow-up-right-from-square ml-1.5 text-[11px]" aria-hidden /><span className="sr-only">(새 탭)</span>
        </a>
      </div>
      <Reactions itemId={it.id} title={it.title} list={reactions} onSave={onSave} />
    </article>
  );
}

const VOTE_LABEL: Record<Vote, string> = { up: '좋아요', down: '별로' };

// 반응: 위에 두 사람이 남긴 것(이름 · 좋아요/별로 · 메모), 아래에 내 단추. 메모는 그 자리에서 펼쳐 쓴다.
function Reactions({ itemId, title, list, onSave }: { itemId: string; title: string; list: ReactionView[]; onSave: SaveFn }) {
  const mine = list.find((r) => r.mine) ?? null;
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [memo, setMemo] = useState('');
  const dirty = editing && memo.trim() !== (mine?.memo ?? '');
  useDirty(`bench:${itemId}`, dirty);
  const cancel = () => setEditing(false);
  const onEsc = useFormEsc(dirty, cancel);

  const vote = async (v: Vote) => {
    if (busy) return;
    setBusy(true);
    await onSave(itemId, mine?.vote === v ? null : v, mine?.memo ?? '');
    setBusy(false);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = await onSave(itemId, mine?.vote ?? null, memo.trim());
    setBusy(false);
    if (ok) setEditing(false);
  };
  const startMemo = () => { setMemo(mine?.memo ?? ''); setEditing(true); };

  return (
    <div className="border-t border-slate-100 px-4 pb-2 pt-2">
      {list.length > 0 && (
        <ul className="mb-1" aria-label="남긴 반응">
          {list.map((r, i) => (
            <li key={i} className="flex items-start gap-2 py-1 text-[14px] leading-snug">
              <span className="shrink-0 font-bold text-slate-800">{displayName(r.name)}</span>
              {r.vote && (
                <span className={`inline-flex shrink-0 items-center gap-1 font-semibold ${r.vote === 'up' ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500'}`}>
                  <i className={`fas ${r.vote === 'up' ? 'fa-thumbs-up' : 'fa-thumbs-down'} text-[12px]`} aria-hidden />{VOTE_LABEL[r.vote]}
                </span>
              )}
              {r.memo && <span className="min-w-0 text-slate-700">{r.memo}</span>}
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <form onSubmit={submit} onKeyDown={onEsc} className="py-1.5">
          <AutoTextarea value={memo} maxLength={MEMO_MAX} autoFocus aria-label={`「${title.slice(0, 20)}」 메모`} placeholder="예: 우리 손님방에 해 보자"
            onChange={(e) => setMemo(oneLine(e.target.value))} onKeyDown={enterSubmit} className={inputCls} />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={cancel}>취소</button>
            <button type="submit" className={btnPrimary} disabled={busy || !dirty}>저장</button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="내 반응">
          {(['up', 'down'] as const).map((v) => {
            const on = mine?.vote === v;
            return (
              <button key={v} type="button" aria-pressed={on} disabled={busy} onClick={() => void vote(v)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-[14px] disabled:opacity-60 ${on
                  ? (v === 'up' ? 'border-blue-600 font-bold text-blue-700 dark:border-blue-400 dark:text-blue-300' : 'border-slate-400 bg-slate-100 font-bold text-slate-800')
                  : 'border-slate-200 font-semibold text-slate-600 hover:bg-slate-50'}`}>
                <i className={`${on ? 'fas' : 'far'} ${v === 'up' ? 'fa-thumbs-up' : 'fa-thumbs-down'} text-[14px]`} aria-hidden />{VOTE_LABEL[v]}
              </button>
            );
          })}
          <button type="button" className={`${textBtn} ml-auto mr-0`} onClick={startMemo}>{mine?.memo ? '메모 고치기' : '메모 남기기'}</button>
        </div>
      )}
    </div>
  );
}
