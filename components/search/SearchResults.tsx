'use client';

import { memo, useCallback, useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useProgress } from '@/components/progress/ProgressProvider';
import { useGuardedNav } from '@/components/shell/useGuardedNav';
import { telOf } from '@/components/simple-home/home-model';
import { guideIdsLoaded, useGuideIds } from '@/components/tasks/guides-client';
import { FoldRow } from '@/components/ui/FoldRow';
import { GroupHead } from '@/components/ui/GroupHead';
import { LineIcon } from '@/components/ui/LineIcon';
import { Meta } from '@/components/ui/Meta';
import { displayName } from '@/lib/client/format';
import { useViewMode } from '@/lib/client/view-mode';
import { isLoneJamo, markText } from '@/lib/shared/search-text';
import { getGuideBodies, prefetchGuideBodies, subscribeGuideBodies, type GuideBodiesState } from './guide-bodies';
import { dropJump, requestJump } from './jump';
import {
  GROUP_MAX, GROUP_SHOWN, buildIndex, countText, dayOf, hasStep, hotOfDoc, jumpOf, rowView, search,
  type Entry, type Group, type Hit, type Jump, type Marked, type SearchResult,
} from './search-model';

// 검색 결과(따로 받는 조각 — 홈 첫 로딩에 없다). 설계 볼트 29의 3 · 5 · 6장.
// 입력칸은 바로 바뀌고 결과는 useDeferredValue 로 뒤에서 다시 그린다(debounce 없음 — 다음 글자가 오면 하던 그리기를 버린다).
// 도움말 본문이 도착해 다시 찾는 것도 같은 방식(뒤에서). 찾을 항목은 문서의 실제 내용 · 도움말이 바뀔 때만 다시 만든다.
const EMPTY: SearchResult = { q: '', terms: [], groups: [], total: 0 };
const WHERE = '할 일, 도움말, 기록, 연락처, 집 정보, 자금, 질문';
const WHERE_NO_GUIDE = '할 일, 기록, 연락처, 집 정보, 자금, 질문';

export function SearchResults({ query, onClose, onQuery }: { query: string; onClose: (then?: () => void) => void; onQuery: (q: string) => void }) {
  const { doc } = useProgress();
  const guideNow = useSyncExternalStore(subscribeGuideBodies, getGuideBodies, getGuideBodies);
  const guide = useDeferredValue(guideNow);
  const ids = useGuideIds();
  // 받아 둔 본문의 version 이 도움말 목록과 어긋나면(다른 사람이 고침 · 지움) 뒤에서 한 번 다시 받는다.
  // 목록을 아직 안 받았으면(빈 값) 견주지 않는다 — 「도움말이 없다」로 잘못 읽고 본문을 또 받지 않게
  const triedFor = useRef<object | null>(null);
  useEffect(() => {
    if (guideNow.status !== 'ready' || !guideIdsLoaded() || triedFor.current === ids) return;
    const b = guideNow.bodies;
    const stale = Object.keys(ids).some((k) => b[k]?.version !== ids[k].version) || Object.keys(b).some((k) => !Object.hasOwn(ids, k));
    if (stale) { triedFor.current = ids; prefetchGuideBodies(true); }
  }, [ids, guideNow]);

  // 10초마다 문서를 다시 받아도 내용이 같으면 다시 만들지 않는다(실제로 찾는 부분만 본다)
  const tasks = doc?.tasks, log = doc?.log, property = doc?.property, money = doc?.money, questions = doc?.questions;
  const index = useMemo(
    () => (tasks && log && property ? buildIndex({ tasks, log, property, money: money ?? {}, questions: questions ?? {} }, guide.bodies) : []),
    [tasks, log, property, money, questions, guide.bodies],
  );
  const hot = useMemo(() => (tasks ? hotOfDoc({ tasks }) : []), [tasks]);
  useLayoutEffect(() => { performance.mark?.('search:ready'); }, []);
  const dq = useDeferredValue(query);
  // 자모 한 글자뿐(「ㄱ」 — 첫 타)이면 찾지 않고 직전 결과를 그대로 둔다(결과가 한꺼번에 쏟아졌다 줄어드는 깜빡임 막기)
  const fresh = useMemo(() => (isLoneJamo(dq) ? null : search(index, dq)), [index, dq]);
  const [kept, setKept] = useState<SearchResult>(EMPTY);
  if (fresh && fresh !== kept) setKept(fresh);
  const result = fresh ?? kept;

  const detail = useViewMode() === 'detail';
  const path = usePathname() ?? '/';
  const go = useGuardedNav();
  // 누르면 먼저 창을 닫고(뒤로 한 번) 그다음 옮긴다. 이미 그 화면이면 갈 곳만 맡긴다
  const onPick = useCallback((j: Jump) => onClose(() => {
    const away = (href: string) => void go(href).then((ok) => { if (!ok) dropJump(); });
    if (j.kind === 'money') { requestJump(j); if (path !== '/money') away('/money'); return; }
    if (j.kind === 'task' && (detail || !j.tab) && hasStep(j.stepId)) {
      // 「자세히 보기」를 골라 둔 기기 · 분야 탭을 못 찾은 할 일: 예전 화면의 그 단계 시트를 연다(갈 곳은 맡기지 않는다)
      if (path === '/classic') window.location.hash = `step-${j.stepId}`;
      else void go(`/classic#step-${j.stepId}`);
      return;
    }
    requestJump(j);
    if (path !== '/' && path !== '/home') away('/');
  }), [onClose, go, path, detail]);

  return (
    <>
      <p className="sr-only" aria-live="polite">{result.terms.length ? (result.total ? countText(result) : '찾은 것이 없어요.') : ''}</p>
      <Results result={result} guide={guide.status} hot={hot} detail={detail} onPick={onPick} onQuery={onQuery} />
    </>
  );
}

/** 「도움말에서도 찾는 중…」 · 실패 한 줄(할 일 묶음 맨 아래, 할 일 결과가 없으면 맨 위) */
const guideLine = (s: GuideBodiesState['status']) => (s === 'loading' || s === 'idle' ? '도움말에서도 찾는 중…' : s === 'error' ? '도움말은 지금 열리지 않아 빼고 찾았어요.' : null);
/** 빈 검색어 · 결과 없음: 가운데 정렬, 같은 위아래 여백(데일리 .search-none) */
const centerCls = 'px-5 py-12 text-center text-cta leading-relaxed text-muted';

const Results = memo(function Results({ result, guide, hot, detail, onPick, onQuery }: {
  result: SearchResult; guide: GuideBodiesState['status']; hot: { word: string; n: number }[]; detail: boolean;
  onPick: (j: Jump) => void; onQuery: (q: string) => void;
}) {
  // 결과가 그려진 다음 프레임(글자 하나 → 결과까지 재는 표시)
  useLayoutEffect(() => {
    const id = window.requestAnimationFrame(() => performance.mark?.('search:paint'));
    return () => window.cancelAnimationFrame(id);
  }, [result]);
  if (!result.terms.length) {
    // 빈 검색어: 찾는 곳 한 줄 + 안 끝난 할 일 제목에 많이 나온 말(누르면 그 말로 찾는다 — 데일리 검색 화면)
    return (
      <div className={centerCls}>
        <p>{WHERE}에서 찾아요.</p>
        {hot.length > 0 && (
          <>
            <p className="mt-6 text-meta font-semibold text-muted">할 일 제목에 많이 나온 말</p>
            <div className="mt-2.5 flex flex-wrap justify-center gap-2">
              {hot.map((k) => (
                <button key={k.word} type="button" onClick={() => onQuery(k.word)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-line px-3.5 text-cta text-ink-soft transition-colors hover:bg-sunken active:opacity-60">
                  {k.word}<small className="text-meta text-muted tabular-nums">{k.n}</small>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }
  const line = guideLine(guide);
  const status = line && <p aria-live="polite" className="px-5 py-3 text-meta text-muted">{line}</p>;
  if (!result.total) {
    // 결과 없음: 도움말을 아직 받는 중이면 「없어요」를 미리 말하지 않는다
    if (guide === 'loading' || guide === 'idle') return status;
    return (
      <>
        {status}
        <div className={centerCls}>
          <b className="mb-1 block break-words text-base font-bold text-ink">‘{result.q}’</b>
          이 말이 들어간 것이 없어요.<br />{guide === 'ready' ? WHERE : WHERE_NO_GUIDE}을 다 찾아봤어요.
        </div>
      </>
    );
  }
  const hasTask = result.groups[0]?.kind === 'task';
  return (
    <>
      {!hasTask && status}
      {result.groups.map((g) => <GroupBlock key={g.kind} group={g} q={result.q} terms={result.terms} detail={detail} onPick={onPick} foot={g.kind === 'task' ? status : null} />)}
    </>
  );
});

/** 묶음 하나: 머리(이름 + n건) → 처음 5줄 → 「n건 더 보기」(50줄까지) → 넘으면 「찾을 말을 더 자세히 적어 보세요.」 */
function GroupBlock({ group, q, terms, detail, onPick, foot }: { group: Group; q: string; terms: string[]; detail: boolean; onPick: (j: Jump) => void; foot: ReactNode }) {
  const uid = useId();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  // 검색어가 바뀌면 「더 보기」 · 펼친 줄을 처음으로
  const [seen, setSeen] = useState(q);
  if (seen !== q) { setSeen(q); setAll(false); setOpen(new Set()); }
  const capped = group.hits.slice(0, GROUP_MAX);
  const shown = all ? capped : capped.slice(0, GROUP_SHOWN);
  const rest = capped.length - GROUP_SHOWN;
  const toggle = (id: string) => setOpen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <section aria-labelledby={`${uid}-h`}>
      <GroupHead id={`${uid}-h`} name={group.label} count={group.hits.length} level={2} />
      <ul id={`${uid}-l`} className="px-5">
        {shown.map((h) => <Row key={h.entry.id} hit={h} terms={terms} detail={detail} onPick={onPick} open={open.has(h.entry.id)} onToggle={() => toggle(h.entry.id)} panelId={`${uid}-${h.entry.id}`} />)}
      </ul>
      {rest > 0 && (
        <span className="block border-t border-line px-1">
          <FoldRow strongChevron label={all ? '접기' : `${rest}건 더 보기`} open={all} onToggle={() => setAll((v) => !v)} controls={`${uid}-l`} />
        </span>
      )}
      {all && group.hits.length > GROUP_MAX && <p className="border-t border-line px-5 py-3 text-sm text-muted">찾을 말을 더 자세히 적어 보세요.</p>}
      {foot}
    </section>
  );
}

/** 밑줄(데일리 .search mark — 바탕 없이 2px 밑줄, globals.css) */
function Mark({ m }: { m: Marked }) {
  if (!m.ranges.length) return <>{m.text}</>;
  const out: ReactNode[] = [];
  let at = 0;
  for (const [a, b] of m.ranges) {
    if (a > at) out.push(m.text.slice(at, a));
    out.push(<mark key={a}>{m.text.slice(a, b)}</mark>);
    at = b;
  }
  out.push(m.text.slice(at));
  return <>{out}</>;
}

const rowCls = 'flex min-h-12 items-center gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-sunken';

/**
 * 결과 줄(「이번 주 할 일」 줄 꼴): 제목 16/600(밑줄) / 메타 13(가운뎃점 없이 칸마다) / 제목 밖에서 걸렸으면 「메모」 같은 이름 + 조각 14 두 줄.
 * 할 일 · 연락처 · 자금 = 누르면 창을 닫고 그 줄로(연락처는 오른쪽에 바로 걸기 단추), 기록 · 집 정보 · 질문 = 누르면 그 자리에서 펼침(보기만).
 * 끝난 할 일은 홈 할 일 줄과 같이 흐리게 + 가운데 줄.
 */
function Row({ hit, terms, detail, onPick, open, onToggle, panelId }: {
  hit: Hit; terms: string[]; detail: boolean; onPick: (j: Jump) => void; open: boolean; onToggle: () => void; panelId: string;
}) {
  const v = rowView(hit, terms);
  const e = hit.entry;
  const j = jumpOf(hit, { detail });
  // 펼친 기록은 제목 자리에 전문(줄바꿈 그대로, 밑줄 포함)
  const full = open && e.kind === 'log';
  const phone = e.kind === 'contact' ? e.contact.phone : null;
  const text = (
    <span className="min-w-0 flex-1">
      <span className={`block break-words text-base font-semibold ${v.done ? 'text-muted line-through' : 'text-ink'} ${full ? 'whitespace-pre-line' : e.kind === 'log' ? 'line-clamp-2' : ''}`}>
        <Mark m={full ? markText(e.item.text, terms) : v.title} />
      </span>
      {v.meta.length > 0 && (
        <Meta className="mt-0.5 text-meta text-muted">
          {v.meta.map((p, i) => <span key={i} className={p.date ? 'tabular-nums text-ink-soft' : undefined}>{p.ranges ? <Mark m={{ text: p.text, ranges: p.ranges }} /> : p.text}</span>)}
        </Meta>
      )}
      {v.snip && !open && (
        <span className="mt-1 line-clamp-2 break-words text-sm text-sub">
          <span className="mr-2 text-meta text-muted">{v.snip.name}</span><Mark m={v.snip} />
        </span>
      )}
    </span>
  );
  const call = phone && e.kind === 'contact' && (
    <a href={telOf(phone)} aria-label={`${e.contact.name}에게 전화 걸기`}
      className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-control text-ink-soft transition-colors hover:bg-sunken">
      <LineIcon name="phone" className="size-5" />
    </a>
  );
  if (j) {
    return (
      <li className="flex items-center border-b border-line last:border-b-0">
        <button type="button" data-search-row onClick={() => onPick(j)} className={`${rowCls} -ml-2 min-w-0 flex-1 ${call ? '' : '-mr-2'}`}>{text}</button>
        {call}
      </li>
    );
  }
  // 「자세히 보기」 기기의 연락처: 갈 화면이 없다 — 줄에 이미 무슨 일 · 전화가 다 보여 펼치지 않고 바로 걸기 단추만 둔다
  if (e.kind === 'contact') {
    return (
      <li className="flex items-center border-b border-line last:border-b-0">
        <div className="flex min-h-12 min-w-0 flex-1 items-center py-2">{text}</div>
        {call}
      </li>
    );
  }
  const body = open && e.kind !== 'log' ? <Detail entry={e} terms={terms} /> : null;
  return (
    <li className="border-b border-line last:border-b-0">
      {/* 기록은 제목 자리가 전문으로 바뀌고(같은 단추 안), 그 밖은 줄 밑 옅은 면에 펼친다 */}
      <div className="flex items-center">
        <button type="button" data-search-row aria-expanded={open} aria-controls={e.kind === 'log' ? undefined : panelId} onClick={onToggle}
          className={`${rowCls} -ml-2 min-w-0 flex-1 ${call ? '' : '-mr-2'}`}>
          {text}
          <LineIcon name="chevron" stroke={2} className={`size-5 shrink-0 text-ink-soft transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
        </button>
        {call}
      </div>
      {body && <div id={panelId} className="mb-3 bg-sunken px-4 py-3">{body}</div>}
    </li>
  );
}

const longText = 'whitespace-pre-line break-words text-base leading-[1.7] text-ink-soft';

/** 펼친 내용(보기만, 찾은 말 밑줄): 집 정보 = 내용 전문, 질문 = (여러 줄이면) 질문 전문 + 답 목록, 할 일(갈 곳 없음 — 단계도 분야도 없는 것) = 메모 */
function Detail({ entry: e, terms }: { entry: Entry; terms: string[] }) {
  if (e.kind === 'property') return <p className={longText}><Mark m={markText(e.item.value, terms)} /></p>;
  if (e.kind === 'task') return e.item.note ? <p className={longText}><Mark m={markText(e.item.note, terms)} /></p> : <p className="text-base text-muted">메모가 없어요.</p>;
  if (e.kind === 'question') {
    const answers = e.item.answers.filter((a) => !a.deletedAt);
    return (
      <div className="space-y-3">
        {/* 질문이 여러 줄이면 줄바꿈 그대로 한 번 더(제목 줄은 한 줄로 이어 붙여 보인다) */}
        {/\n/.test(e.item.text) && <p className={longText}><Mark m={markText(e.item.text, terms)} /></p>}
        {answers.length === 0 ? <p className="text-base text-muted">아직 답이 없어요.</p> : (
          <ul className="space-y-3">
            {answers.map((a) => (
              <li key={a.id}>
                <p className={longText}><Mark m={markText(a.text, terms)} /></p>
                <Meta className="mt-0.5 text-meta text-muted">{a.by && <span>{displayName(a.by)}</span>}<span className="tabular-nums text-ink-soft">{dayOf(a.at)}</span></Meta>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return null;
}
