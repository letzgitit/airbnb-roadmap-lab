'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { BatchView, BenchItem, LinkView, ReactionView, Vote } from '@/lib/core/bench';
import { busyFetch } from '@/lib/client/busy';
import { displayName, shortDate, withGa } from '@/lib/client/format';
import { devHeaders, useProgress } from './ProgressProvider';
import { AutoTextarea, btnGhost, btnPrimary, enterSubmit, inputCls, oneLine, textBtn, useDirty, useFormEsc } from './bits';

// 「집 정보 · 기록」 창의 「꾸미기 참고」 탭: 다른 사람들이 꾸민 집(인테리어 벤치마킹) 모음.
// 로그인한 두 사람만 /api/bench 로 받는다(우리 집 평수 · 구조 이야기가 들어 있어 공개 화면 · 저장소 코드에는 없다).
// 묶음(수집한 날)마다 맨 위에 공통 패턴, 아래에 사진 벽돌 격자(핀터레스트처럼 사진 위주, 글은 제목 한두 줄뿐). 가장 최근 묶음만 펼치고 지난 묶음은 접어 둔다.
// 사진을 누르면 같은 패널 안에서 상세로 넘어가고(「목록으로」로 돌아오면 보던 자리), 거기서 두 사람이 각자 좋아요 · 별로와 짧은 메모를 남긴다(누가 남겼는지 보인다).

const MEMO_MAX = 200;   // lib/core/bench.ts MEMO_MAX 와 같게
interface Data { batches: BatchView[]; links: LinkView[]; reactions: Record<string, ReactionView[]> }
// 격자의 한 장: 수집 자료(BenchItem) 또는 두 사람이 올린 링크(link 가 있고, 공간은 비어 있을 수 있다)
type Card = Omit<BenchItem, 'space'> & { space: BenchItem['space'] | null; link?: LinkView };
const linkCard = (l: LinkView): Card => ({
  id: l.id, title: l.title, source: l.source, url: l.url, image: l.image, space: l.space,
  fit: l.fit ?? '', takeaways: l.takeaways ?? [], cost: l.cost ?? '', caution: l.caution ?? null, link: l,
});
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url.slice(0, 30); } };
const NOTE_MAX = 200;   // lib/core/bench.ts NOTE_MAX 와 같게
const ALL = '__all';
const SPACE_KEY = 'bench.space';
// 「2026-10-22」 → 「10월 22일」
// 공간 「전체」(한 곳이 아니라 집 여러 곳에 해당)는 화면에서 「여러 공간」으로 보인다. 자료의 값은 그대로 둔다.
const spaceLabel = (s: string) => (s === '전체' ? '여러 공간' : s);
// 비용 줄: 값이 이미 「비용 · 가격」으로 시작하면 라벨을 빼고, 에어비앤비는 「숙박 요금」. 「언급 없음 · 확인 못함 · 비공개」면 닫힌 줄에서는 감춘다.
const costView = (it: Card) => {
  const v = it.cost?.trim();
  if (!v) return null;
  const label = it.source === '에어비앤비' ? '숙박 요금' : /^(비용|가격)/.test(v) ? '' : '비용';
  return { label, text: v, weak: /언급 없음|확인 못함|비공개/.test(v) };
};
// 둘 다 별로: 반응을 남긴 사람이 2명 이상이고 모두 별로를 누른 자료. 화면에서만 격자 밖으로 빼고(데이터는 그대로), 반응을 바꾸면 저절로 돌아온다.
const bothDown = (list: ReactionView[]) => {
  const who = list.filter((r) => r.vote || r.memo);
  return who.length >= 2 && who.every((r) => r.vote === 'down');
};
const dateLabel = (d: string) => { const [, m, day] = d.split('-'); return m && day ? `${Number(m)}월 ${Number(day)}일` : d; };

export function BenchPanel({ active }: { active: boolean }) {
  const { toast, me } = useProgress();
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'anon'>('idle');
  const started = useRef(false);
  const [space, setSpaceState] = useState<string>(() => { try { return localStorage.getItem(SPACE_KEY) || ALL; } catch { return ALL; } });
  const setSpace = (s: string) => { setSpaceState(s); try { localStorage.setItem(SPACE_KEY, s); } catch { /* 저장이 막혀도 이번 화면에는 적용 */ } };
  const [openOld, setOpenOld] = useState<Record<string, boolean>>({});
  // 상세: 목록은 그대로 그려 둔 채 숨기고(사진을 다시 받지 않게) 같은 패널 안에 상세를 보인다. 목록 스크롤 자리를 기억해 돌아올 때 되돌린다.
  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const scrollAt = useRef(0);
  const scroller = () => rootRef.current?.closest<HTMLElement>('.overflow-y-auto') ?? null;
  const openItem = (id: string) => { scrollAt.current = scroller()?.scrollTop ?? 0; setOpenId(id); };
  const closeItem = () => setOpenId(null);
  useLayoutEffect(() => {
    const el = scroller();
    if (el) el.scrollTop = openId ? 0 : scrollAt.current;
  }, [openId]);

  const reload = useCallback(async () => {
    if (!started.current) setState('loading');
    started.current = true;
    try {
      const res = await busyFetch('/api/bench', { headers: devHeaders(), cache: 'no-store' });
      if (res.status === 401 || res.status === 403) { setData(null); setState('anon'); return; }
      if (!res.ok) { setState('error'); return; }
      const j = await res.json();
      setData({ ...j, links: j.links ?? [] });
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

  // 타일에서 바로 누르기: 화면에 먼저 반영하고 저장한다. 실패하면 누르기 전으로 되돌리고 안내한다. 메모는 그대로 둔다.
  const dataRef = useRef<Data | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);
  const pending = useRef(new Set<string>());
  const setMine = useCallback((itemId: string, mine: ReactionView | null) => {
    setData((d) => {
      if (!d) return d;
      const others = (d.reactions[itemId] ?? []).filter((r) => !r.mine);
      return { ...d, reactions: { ...d.reactions, [itemId]: mine ? [mine, ...others] : others } };
    });
  }, []);
  const quickVote = useCallback(async (itemId: string, v: Vote) => {
    if (pending.current.has(itemId)) return;
    const before = (dataRef.current?.reactions[itemId] ?? []).find((r) => r.mine) ?? null;
    const next: Vote | null = before?.vote === v ? null : v;
    const memo = before?.memo ?? '';
    pending.current.add(itemId);
    setMine(itemId, next || memo ? { name: before?.name ?? me?.name ?? '', vote: next, memo, updatedAt: new Date().toISOString(), mine: true } : null);
    const ok = await save(itemId, next, memo);
    pending.current.delete(itemId);
    if (!ok) setMine(itemId, before);
  }, [me, save, setMine]);

  // 올린 링크 넣기 · 지우기 · 되돌리기(화면에 바로 반영)
  const addLinkLocal = useCallback((l: LinkView) => setData((d) => (d ? { ...d, links: [l, ...d.links.filter((x) => x.id !== l.id)] } : d)), []);
  const removeLinkLocal = useCallback((id: string) => setData((d) => (d ? { ...d, links: d.links.filter((x) => x.id !== id) } : d)), []);
  const removeLink = useCallback(async (l: LinkView) => {
    try {
      const res = await busyFetch('/api/bench/links', { method: 'DELETE', headers: { 'content-type': 'application/json', ...devHeaders() }, body: JSON.stringify({ id: l.id }) });
      const j = await res.json().catch(() => null);
      if (!res.ok) { toast(typeof j?.message === 'string' ? j.message : '지우지 못했어요.', { kind: 'error' }); return false; }
    } catch { toast('지우지 못했어요. 인터넷 연결을 확인해 주세요.', { kind: 'error' }); return false; }
    removeLinkLocal(l.id);
    toast('링크를 지웠어요.', {
      ms: 8000,
      action: {
        label: '되돌리기',
        run: () => {
          void (async () => {
            try {
              const res = await busyFetch('/api/bench/links', { method: 'PATCH', headers: { 'content-type': 'application/json', ...devHeaders() }, body: JSON.stringify({ id: l.id }) });
              const j = await res.json().catch(() => null);
              if (res.ok && j?.link) addLinkLocal({ ...l, ...j.link });
              else toast('되돌리지 못했어요.', { kind: 'error' });
            } catch { toast('되돌리지 못했어요. 인터넷 연결을 확인해 주세요.', { kind: 'error' }); }
          })();
        },
      },
    });
    return true;
  }, [addLinkLocal, removeLinkLocal, toast]);

  // 거르기 칸: 자료에 실제로 있는 공간만(정해진 순서대로)
  const spaces = useMemo(() => {
    const order = ['전체', '거실주방', '손님방', '호스트방', '욕실', '현관', '조명·소품'];
    const have = new Set<string | null>([...(data?.batches ?? []).flatMap((b) => b.items.map((it) => it.space)), ...(data?.links ?? []).map((l) => l.space)]);
    return order.filter((s) => have.has(s));
  }, [data]);
  const cur = space !== ALL && !spaces.includes(space) ? ALL : space;
  const pick = <T extends { space: string | null }>(items: T[]) => (cur === ALL ? items : items.filter((it) => it.space === cur));

  if (state === 'anon') return <p className="py-6 text-[15px] font-semibold text-slate-500">로그인한 뒤에 볼 수 있어요.</p>;

  const linkCards = (data?.links ?? []).map(linkCard);
  const [firstBatch, ...older] = data?.batches ?? [];
  // 수집 묶음이 아직 없어도 올린 링크가 있으면 격자를 보인다
  const latest: BatchView | undefined = firstBatch ?? (linkCards.length > 0 ? { collectedAt: '', insights: [], items: [] } : undefined);
  const detail: Card | null = openId ? [...linkCards, ...(data?.batches ?? []).flatMap((b) => b.items)].find((it) => it.id === openId) ?? null : null;
  return (
    <section ref={rootRef} className="min-w-0" aria-label="꾸미기 참고">
      {detail && <Detail it={detail} reactions={data!.reactions[detail.id] ?? []} onSave={save} onBack={closeItem} onDeleteLink={detail.link ? async () => { if (await removeLink(detail.link!)) closeItem(); } : undefined} />}
      <div hidden={!!detail}>
      {state === 'loading' && !data && (
        <div role="status" aria-busy="true">
          <span className="sr-only">불러오는 중…</span>
          <div aria-hidden className="columns-2 gap-3 min-[560px]:columns-3">
            {[150, 110, 130, 170, 120, 140].map((h, k) => (
              <span key={k} style={{ height: h }} className="skeleton mb-3 block break-inside-avoid rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
      )}
      {state === 'error' && (
        <p className="py-4 text-[15px] font-semibold text-slate-600">
          불러오지 못했어요. <button type="button" className={textBtn} onClick={() => void reload()}>다시 불러오기</button>
        </p>
      )}
      {data && <LinkAdder onAdded={addLinkLocal} />}
      {data && !latest && (
        <p className="py-4 text-[15px] font-semibold text-slate-500">아직 모은 자료가 없어요. 자료가 모이면 여기에 공간별로 보여요.</p>
      )}

      {latest && spaces.length > 1 && (
        <div role="group" aria-label="공간 거르기" className="-mx-5 mb-2 mt-1 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[ALL, ...spaces].map((s) => {
            const on = cur === s;
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => setSpace(s)}
                className={`min-h-11 shrink-0 whitespace-nowrap rounded-xl border px-3 text-[14px] ${on ? 'border-slate-300 bg-slate-200 font-bold text-slate-900' : 'border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-50'}`}>
                {s === ALL ? '모두' : spaceLabel(s)}
              </button>
            );
          })}
        </div>
      )}

      {latest && <Batch b={latest} items={[...pick(linkCards), ...pick(latest.items)]} reactions={data!.reactions} onOpen={openItem} onVote={quickVote} />}

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
                {on && <div className="pb-6"><Batch b={b} items={pick(b.items)} reactions={data!.reactions} onOpen={openItem} onVote={quickVote} /></div>}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </section>
  );
}

type SaveFn = (itemId: string, vote: Vote | null, memo: string) => Promise<boolean>;

// 묶음 하나: 공통 패턴 → 사진 벽돌 격자
function Batch({ b, items, reactions, onOpen, onVote }: { b: BatchView; items: Card[]; reactions: Data['reactions']; onOpen: (id: string) => void; onVote: (id: string, v: Vote) => void }) {
  const [showInsights, setShowInsights] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const hidden = items.filter((it) => bothDown(reactions[it.id] ?? []));
  const shownItems = items.filter((it) => !bothDown(reactions[it.id] ?? []));
  return (
    <div>
      {b.insights.length > 0 && (
        <div className="mb-3 border-b border-slate-200">
          <button type="button" aria-expanded={showInsights} onClick={() => setShowInsights((v) => !v)}
            className="flex min-h-11 w-full items-center gap-3 py-2 text-left">
            <span className="min-w-0 flex-1 text-[15px] font-bold text-slate-800">여러 집 공통점 {b.insights.length}개<span className="ml-2 text-[13px] font-semibold text-slate-500">{dateLabel(b.collectedAt)} 모음</span></span>
            <i className={`fas ${showInsights ? 'fa-chevron-up' : 'fa-chevron-down'} shrink-0 text-[12px] text-slate-500`} aria-hidden />
          </button>
          {showInsights && (
            <ul className="space-y-2.5 pb-4 pt-1">
              {b.insights.map((ins, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold leading-snug text-slate-800">{ins.title}</p>
                    {ins.detail && <p className="mt-0.5 text-[14px] leading-relaxed text-slate-600">{ins.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {items.length === 0
        ? <p className="py-2 text-[15px] font-semibold text-slate-500">이 공간 자료는 이 모음에 없어요.</p>
        : shownItems.length > 0 && (
          <ul className="columns-2 gap-3 min-[560px]:columns-3">
            {shownItems.map((it) => <li key={it.id} className="mb-4 min-w-0 break-inside-avoid"><Tile it={it} reactions={reactions[it.id] ?? []} onOpen={onOpen} onVote={onVote} /></li>)}
          </ul>
        )}
      {hidden.length > 0 && (
        <div className="mt-1">
          <button type="button" aria-expanded={showHidden} onClick={() => setShowHidden((v) => !v)}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 text-[12px] font-semibold text-slate-500">
            둘 다 별로라 숨긴 자료 {hidden.length}개<i className={`fas ${showHidden ? 'fa-chevron-up' : 'fa-chevron-down'} text-[10px]`} aria-hidden />
          </button>
          {showHidden && (
            <ul className="columns-2 gap-3 pt-1 opacity-70 min-[560px]:columns-3">
              {hidden.map((it) => <li key={it.id} className="mb-4 min-w-0 break-inside-avoid"><Tile it={it} reactions={reactions[it.id] ?? []} onOpen={onOpen} onVote={onVote} /></li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// 외부 그림(출처 사이트). 못 불러오면 출처 이름이 든 회색 칸. 사진은 원래 비율 그대로(높이가 제각각)
function Photo({ src, source, big }: { src: string | null; source: string; big?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!src || failed) {
    return (
      <span className={`flex w-full flex-col items-center justify-center gap-1 bg-slate-100 px-2 text-center text-slate-500 ${big ? 'aspect-[4/3]' : 'aspect-square'}`}>
        <i className="far fa-image text-[18px]" aria-hidden />
        <span className="break-keep text-[12px] font-bold leading-tight">{source}</span>
      </span>
    );
  }
  return (
    <span className={`relative block w-full bg-slate-100 ${loaded ? '' : 'aspect-[4/5]'}`}>
      {!loaded && <span className="skeleton absolute inset-0" />}
      {/* 외부 주소라 next/image 도메인 목록 대신 일반 img. 출처 사이트가 막지 않게 referrer 를 보내지 않는다 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading={big ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
        className={loaded ? 'block h-auto w-full' : 'absolute inset-0 h-full w-full object-cover opacity-0'} />
    </span>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <p className="text-[13px] font-bold text-slate-500">{children}</p>;

// 타일 = 사진 + 제목 한두 줄 + (왼쪽 출처 · 오른쪽 좋아요/별로 단추). 사진 · 제목을 누르면 상세로, 단추는 상세를 열지 않고 바로 저장한다.
// 단추가 채워져 있으면 내 반응. 상대가 남긴 반응은 단추 아래 작은 글자(「아내 👍」)로, 메모가 있으면 말풍선.
function Tile({ it, reactions, onOpen, onVote }: { it: Card; reactions: ReactionView[]; onOpen: (id: string) => void; onVote: (id: string, v: Vote) => void }) {
  const mine = reactions.find((r) => r.mine) ?? null;
  const shown = reactions.filter((r) => r.vote || r.memo);
  const others = shown.filter((r) => !r.mine);
  const myMemo = !!mine?.memo;
  return (
    <div>
      <button type="button" onClick={() => onOpen(it.id)} className="block w-full text-left">
        <span className="block overflow-hidden rounded-xl border border-slate-200"><Photo src={it.image} source={it.link ? hostOf(it.url) : it.source} /></span>
        <span className="mt-1.5 line-clamp-2 break-words px-0.5 text-[13px] font-bold leading-snug text-slate-900">{it.title}</span>
        {it.link && <span className="block truncate px-0.5 text-[12px] font-semibold leading-snug text-blue-700 dark:text-blue-300">{withGa(it.link.addedBy)} 올림</span>}
      </button>
      <div className="flex items-center gap-1 px-0.5">
        <span className="min-w-0 flex-1 truncate text-[12px] leading-snug text-slate-500">{it.source}</span>
        <span role="group" aria-label="내 반응" className="-mr-1 flex shrink-0 items-center">
          {(['up', 'down'] as const).map((v) => {
            const on = mine?.vote === v;
            return (
              <button key={v} type="button" aria-pressed={on} aria-label={`${VOTE_LABEL[v]}${on ? ' (누르면 취소)' : ''}`}
                onClick={(e) => { e.stopPropagation(); onVote(it.id, v); }}
                className="flex size-10 items-center justify-center rounded-full">
                <span className={`flex size-8 items-center justify-center rounded-full border text-[14px] ${on
                  ? (v === 'up' ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-900' : 'border-slate-500 bg-slate-500 text-white dark:border-slate-400 dark:bg-slate-400 dark:text-slate-900')
                  : 'border-slate-200 text-slate-500'}`}>
                  <i className={`${on ? 'fas' : 'far'} ${v === 'up' ? 'fa-thumbs-up' : 'fa-thumbs-down'}`} aria-hidden />
                </span>
              </button>
            );
          })}
        </span>
      </div>
      {(others.length > 0 || myMemo) && (
        <p className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 px-0.5 text-[12px] font-semibold leading-snug text-slate-600">
          {others.map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {displayName(r.name)}
              {r.vote && <i className={`fas ${r.vote === 'up' ? 'fa-thumbs-up text-blue-700 dark:text-blue-300' : 'fa-thumbs-down text-slate-500'}`} aria-hidden />}
              {r.memo && <i className="far fa-comment text-slate-500" aria-hidden />}
              <span className="sr-only">{r.vote ? VOTE_LABEL[r.vote] : ''}{r.memo ? ' 메모 있음' : ''}</span>
            </span>
          ))}
          {myMemo && <span className="inline-flex items-center gap-1 text-slate-500"><i className="far fa-comment" aria-hidden />내 메모<span className="sr-only"> 있음</span></span>}
        </p>
      )}
    </div>
  );
}

// 상세: 같은 패널 안에서 목록을 대신해 보인다. 큰 사진 · 제목 · 맞는 이유 · 따라 할 점 · 비용 · 주의 · 원문 · 내 반응
function Detail({ it, reactions, onSave, onBack, onDeleteLink }: { it: Card; reactions: ReactionView[]; onSave: SaveFn; onBack: () => void; onDeleteLink?: () => Promise<void> }) {
  const cost = costView(it);
  return (
    <article aria-label={it.title}>
      <button type="button" onClick={onBack} className={`${textBtn} -ml-1 mb-2 inline-flex min-h-11 items-center`}>
        <i className="fas fa-chevron-left mr-1.5 text-[12px]" aria-hidden />목록으로
      </button>
      <div className="overflow-hidden rounded-2xl border border-slate-200"><Photo src={it.image} source={it.link ? hostOf(it.url) : it.source} big /></div>
      <h3 className="mt-3 break-words text-[18px] font-bold leading-snug text-slate-900">{it.title}</h3>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug text-slate-500">
        <span>{it.source}</span>
        {it.space && <span className="rounded-md border border-slate-200 px-1.5 py-px text-[12px] font-bold text-slate-600">{spaceLabel(it.space)}</span>}
        {it.link && <span>{withGa(it.link.addedBy)} 올림 · {shortDate(it.link.addedAt.slice(0, 10))}</span>}
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {it.link?.note && (
          <div><Label>{displayName(it.link.addedBy)}의 메모</Label><p className="mt-0.5 break-words text-[15px] leading-relaxed text-slate-700">{it.link.note}</p></div>
        )}
        {it.link && it.link.status !== 'done' && !it.fit && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] leading-relaxed text-slate-600">
            <i className="far fa-clock mr-1.5 text-[12px]" aria-hidden />Claude가 곧 설명을 채워요. 101호에 맞는 이유와 따라 할 점이 여기에 들어와요.
          </p>
        )}
        {it.fit && (
          <div><Label>101호에 맞는 이유</Label><p className="mt-0.5 break-words text-[15px] leading-relaxed text-slate-700">{it.fit}</p></div>
        )}
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
        {cost && !cost.weak && (
          <div><Label>{cost.label || '비용'}</Label><p className="mt-0.5 break-words text-[15px] leading-snug text-slate-700">{cost.text}</p></div>
        )}
        {it.caution && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-red-700 dark:text-red-300"><i className="fas fa-triangle-exclamation text-[12px]" aria-hidden />주의</p>
            <p className="mt-0.5 text-[14px] leading-relaxed text-slate-800">{it.caution}</p>
          </div>
        )}
        <a href={it.url} target="_blank" rel="noopener noreferrer" className={`${textBtn} self-start`}>
          원문 보기<i className="fas fa-arrow-up-right-from-square ml-1.5 text-[11px]" aria-hidden /><span className="sr-only">(새 탭)</span>
        </a>
      </div>
      <div className="mt-3 rounded-xl border border-slate-100"><Reactions itemId={it.id} title={it.title} list={reactions} onSave={onSave} /></div>
      {it.link?.mine && onDeleteLink && <DeleteLink title={it.title} onDelete={onDeleteLink} />}
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
    <div className="px-4 pb-2 pt-2">
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

// 내가 올린 링크 지우기: 확인 창 → 지움(+ 8초 되돌리기 알림)
function DeleteLink({ title, onDelete }: { title: string; onDelete: () => Promise<void> }) {
  const { confirm } = useProgress();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    const ok = await confirm({ title: '이 링크를 지울까요?', body: title, note: '지운 직후 8초 동안은 「되돌리기」를 누를 수 있어요.', confirmLabel: '삭제', cancelLabel: '취소', danger: true });
    if (!ok) return;
    setBusy(true);
    await onDelete();
    setBusy(false);
  };
  return (
    <button type="button" disabled={busy} onClick={() => void go()}
      className="mt-3 inline-flex min-h-11 items-center gap-1.5 px-1 text-[13px] font-bold text-red-700 hover:underline disabled:opacity-50 dark:text-red-300">
      <i className="fas fa-trash-can text-[12px]" aria-hidden />내가 올린 링크 지우기
    </button>
  );
}

// 탭 맨 위 「링크 올리기」: 처음엔 접힌 단추. 누르면 링크 · 왜 골랐는지(선택) · 공간(선택). 올리면 서버가 제목 · 사진을 가져오고 격자 맨 앞에 바로 생긴다.
function LinkAdder({ onAdded }: { onAdded: (l: LinkView) => void }) {
  const { toast } = useProgress();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [space, setSpace] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const dirty = open && (url.trim() !== '' || note.trim() !== '');
  useDirty('bench:link-add', dirty);
  const close = () => { setOpen(false); setErr(''); };
  const onEsc = useFormEsc(dirty, close);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    let u = url.trim();
    if (!u) { setErr('링크를 붙여 넣어 주세요.'); return; }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = `https://${u}`;   // 휴대폰에서 https:// 없이 붙여 넣은 경우
    setBusy(true);
    setErr('');
    try {
      const res = await busyFetch('/api/bench/links', { method: 'POST', headers: { 'content-type': 'application/json', ...devHeaders() }, body: JSON.stringify({ url: u, note: note.trim(), space: space || null }) }, { slow: true });
      const j = await res.json().catch(() => null);
      if (!res.ok) { setErr(typeof j?.message === 'string' ? j.message : res.status === 401 || res.status === 403 ? '로그인이 필요해요.' : '올리지 못했어요. 잠시 뒤에 다시 해 주세요.'); return; }
      onAdded(j.link);
      toast(j.fetched ? '링크를 올렸어요.' : '링크를 올렸어요. 사진은 가져오지 못해 회색 칸으로 뒀어요.');
      setUrl(''); setNote(''); setSpace(''); setOpen(false);
    } catch {
      setErr('올리지 못했어요. 인터넷 연결을 확인해 주세요.');
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="mb-2 mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 text-left text-[14px] font-bold text-blue-700 hover:bg-slate-50 dark:text-blue-300">
        <i className="fas fa-link text-[13px]" aria-hidden />링크 올리기
        <span className="ml-auto text-[12px] font-semibold text-slate-500">보다가 마음에 든 집</span>
      </button>
    );
  }
  return (
    <form onSubmit={submit} onKeyDown={onEsc} className="mb-3 mt-1 rounded-xl border border-slate-200 p-3">
      <label className="block text-[13px] font-bold text-slate-600" htmlFor="bench-link-url">링크</label>
      <input id="bench-link-url" type="url" inputMode="url" autoComplete="off" autoCapitalize="none" autoFocus value={url} onChange={(e) => { setUrl(e.target.value); setErr(''); }}
        placeholder="인스타 · 오늘의집 · 블로그 주소를 붙여 넣기" className={`${inputCls} mt-1`} />
      <label className="mt-3 block text-[13px] font-bold text-slate-600" htmlFor="bench-link-note">왜 골랐는지 <span className="font-semibold text-slate-500">(선택)</span></label>
      <AutoTextarea id="bench-link-note" value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(oneLine(e.target.value))} onKeyDown={enterSubmit}
        placeholder="예: 조명이 좋아서" className={`${inputCls} mt-1`} />
      <label className="mt-3 block text-[13px] font-bold text-slate-600" htmlFor="bench-link-space">공간 <span className="font-semibold text-slate-500">(선택)</span></label>
      <select id="bench-link-space" value={space} onChange={(e) => setSpace(e.target.value)} className={`${inputCls} mt-1`}>
        <option value="">고르지 않음</option>
        {['거실주방', '손님방', '호스트방', '욕실', '현관', '조명·소품', '전체'].map((k) => <option key={k} value={k}>{spaceLabel(k)}</option>)}
      </select>
      {err && <p role="alert" className="mt-2 text-[14px] font-bold text-red-700 dark:text-red-300">{err}</p>}
      <div className="mt-3 flex items-center justify-end gap-2">
        {busy && <span role="status" className="mr-auto text-[13px] font-semibold text-slate-500">사진을 가져오는 중…</span>}
        <button type="button" className={btnGhost} onClick={close}>취소</button>
        <button type="submit" className={btnPrimary} disabled={busy || !url.trim()}>올리기</button>
      </div>
    </form>
  );
}
