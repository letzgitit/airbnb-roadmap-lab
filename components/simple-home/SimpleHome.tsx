'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ProgressDoc, TaskItem } from '@/lib/core/types';
import { usePhotos } from '@/components/progress/PhotosPanel';
import { todayStr } from '@/lib/client/format';
import { useProgress } from '@/components/progress/ProgressProvider';
import { useSite } from '@/components/shell/SiteShell';
import { ViewPicker } from '@/components/shell/ViewPicker';
import { focusTask } from '@/components/tasks/TaskRow';
import type { StepRef } from '@/components/tasks/TaskComposer';
import { SOON_DAYS } from '@/components/tasks/task-view';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { FoldRow } from '@/components/ui/FoldRow';
import { LineIcon } from '@/components/ui/LineIcon';
import { revealRow, useJump } from '@/components/search/jump';
import { CalendarTab } from './CalendarTab';
import { ContactsTab } from './ContactsTab';
import { PhotosTab, type PhotoSub } from './PhotosTab';
import { BlockHead, blockCls, StepBlock } from './StepBlock';
import { useTabSwipe } from './TabSwipe';
import { OPEN_KEY, PHOTO_SUB_KEY, TAB_KEY, dropOldLocal, restoreScroll, savedOpen, savedSub, startTab, trackScroll, write } from './home-state';
import {
  CARD_TABS, TABS, askOnly, blockId, contacts, daysBetween, isAsk, isWorkTab, relDay, sortCards, summarize, tabCounts, tasksByCard, telOf, weekTasks, workTab,
  type CardDef, type TabId, type WorkTabId,
} from './home-model';

// 고른 탭 · 펼친 블록 · 갤러리 보조 탭 · 스크롤 위치는 이 브라우저 탭에만(sessionStorage — home-state.ts):
// 새로 들어오면 달력 + 다 접힘 + 맨 위, 새로고침 · 시안이나 자금에 갔다 돌아오면 그대로
const TAB_IDS = TABS.map((t) => t.id);
/** 건너가기(이번 주 할 일 · 검색): n = 누를 때마다 새 값, guide = 칠한 뒤 도움말 창도 연다 */
type Reveal = { id: string; tab: WorkTabId; n: number; guide?: boolean };

/**
 * 분야 탭 줄(대메뉴, 기획 27의 9절): 흰 면 줄 + 아래 1px 선, **같은 너비 여섯 칸**이 줄 폭을 꽉 채운다(grid 6열 — 칸 너비가 글자에 따라 늘지 않아 320px 폰에서도 한 줄).
 * 칸 = 선 아이콘 24px 위 + 이름 14(text-sm)/800 아래, 줄 높이 60px(아래 선 포함 — globals.css --spacing-tabbar, 펼친 블록 머리가 그 밑에 붙는다). 안 고른 탭도 본문색(ink-soft)으로 진하게,
 * 고른 탭 = ink + 아이콘 선 굵게(1.8 → 2.3) + 칸 너비 3px 밑줄.
 * 화면 맨 위에 붙어 따라오고, 붙은 동안은 줄이 머리 띠와 같은 형광 면 + 검정 글자가 된다(데일리 .tabs--stuck).
 * 기한 지난 안 끝난 일이 있는 탭(고르지 않은 것)은 아이콘 오른쪽 위 작은 빨강 점.
 */
export function HomeTabBar({ tab, onPick, late = {}, idBase }: {
  tab: TabId | null; onPick?: (t: TabId) => void; late?: Partial<Record<TabId, number>>; idBase?: string;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // 여섯 칸이 늘 줄 안에 다 들어 있어(가로로 넘치지 않음) 고른 탭을 줄 안으로 끌어올 일이 없다 — 예전 scrollIntoView 는 뺐다
  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px -mb-px" />
      <div className={`sticky top-0 z-30 border-b transition-colors ${stuck ? 'border-marker bg-marker text-on-marker [--tab-line:var(--color-on-marker)]' : 'border-line bg-surface text-ink [--tab-line:var(--color-ink)]'}`}>
        <div role={onPick ? 'tablist' : undefined} aria-label={onPick ? '분야' : undefined} aria-hidden={onPick ? undefined : true}
          className="mx-auto grid max-w-content grid-cols-6 md:px-safe lg:max-w-wide">
          {TABS.map((t) => {
            const on = t.id === tab;
            const dot = !on && (late[t.id] ?? 0) > 0;
            const cls = `relative flex h-[calc(var(--spacing-tabbar)-1px)] min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap text-sm font-extrabold leading-none tracking-[-0.02em] transition-opacity active:opacity-60 ${stuck ? '' : on ? 'text-ink' : 'text-ink-soft'}`;
            const body = (
              <>
                <span className="relative">
                  <LineIcon name={t.icon} className="size-6" stroke={on ? 2.3 : 1.8} />
                  {dot && <span className={`absolute -right-1 -top-0.5 size-1.5 rounded-full ${stuck ? 'bg-danger-on-marker' : 'bg-danger-ink'}`} aria-hidden />}
                </span>
                {t.label}
                {dot && <span className="sr-only">(기한 지남 있음)</span>}
                {on && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--tab-line)]" aria-hidden />}
              </>
            );
            return onPick
              ? <button key={t.id} type="button" role="tab" id={`${idBase}-${t.id}`} aria-selected={on} aria-controls={`${idBase}-panel`} onClick={() => onPick(t.id)} className={cls}>{body}</button>
              : <span key={t.id} className={cls}>{body}</span>;
          })}
        </div>
      </div>
    </>
  );
}

/**
 * 새 홈 「간단히 보기」(로그인한 두 사람, 기획 27 — 주money 데일리 형광펜 디자인):
 * 머리 띠(틀) → 분야 탭 「행정 · 설비 · 운영 · 갤러리 · 연락처 · 달력」 → 본문.
 * - 일터 탭(행정 · 설비 · 운영): 「이번 주 할 일」 블록 → 단계 블록들(마감 이른 순, 다 끝낸 블록도 제자리 — 처음엔 모두 접힘).
 * - PC(1024px 이상): 가운데 본문 + 오른쪽 곁 칸(「이번 주 할 일」 · 「연락처 바로 걸기」). 폰 · 태블릿에서는 「이번 주 할 일」이 본문 맨 위.
 * - 맨 아래 「간단히 보기 | 자세히 보기」 고르개(자세히 = /classic, 기기에 기억).
 * 홈 안에서 끝난다 — 「우리 집」(/house)으로 보내는 링크를 두지 않는다.
 */
export function SimpleHome() {
  const { doc, hasDirty, confirmDiscard } = useProgress();
  const { steps } = useSite();
  const { ensure, setQuery, setSort } = usePhotos();
  const uid = useId();
  // 할 일 사진 · 갤러리 개수를 보이려고 사진 목록도 처음에 한 번 받는다
  useEffect(() => { ensure(); }, [ensure]);
  const [tab, setTab] = useState<TabId>(startTab);
  const [photoSub, setPhotoSub] = useState<PhotoSub>(savedSub);
  const pickSub = (s: PhotoSub) => { setPhotoSub(s); write(PHOTO_SUB_KEY, s); };
  // 「이번 주 할 일」 · 검색 결과에서 고른 할 일: 그 탭으로 가서(그 할 일이 든 블록이 접혀 있으면 펼쳐) 그 줄로 내려간다. 탭을 손으로 바꾸면 잊는다
  //   guide = 검색에서 도움말에서만 걸린 할 일 — 그 줄을 칠한 뒤 도움말 창까지 연다
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // 「문의 필요만 보기」(일터 탭): 단추는 늘 「이번 주 할 일」 머리 오른쪽(폰은 본문, PC는 곁 칸). 탭을 바꾸면 끈다
  const [askOn, setAskOn] = useState(false);
  // 탭을 고르면(누르기 · 좌우 쓸기, 이미 고른 탭을 다시 눌러도) 그 탭을 처음 상태로 열고 맨 위로 올린다(2026-10-29 사이트 주인):
  //   행정 · 설비 · 운영 = 그 탭 단계 블록 모두 접기, 갤러리 = 보조 탭 「사진」 + 검색 비우기 + 정렬 기본, 달력 = 이번 달 · 오늘(다시 그려서).
  //   탭 본문은 fresh 가 바뀔 때마다 새로 그린다(key) — 쓰다 만 폼이 있으면 먼저 「저장 안 한 내용」 확인을 받는다.
  //   예외: 「이번 주 할 일」에서 건너가기(goTask)는 그 탭의 다른 블록을 접고 대상 블록 하나만 편다(WorkTab 의 reveal).
  const [fresh, setFresh] = useState(0);
  const openTab = (t: TabId) => {
    if (isWorkTab(t)) write(OPEN_KEY, JSON.stringify([...savedOpen()].filter((id) => !id.startsWith(`${t}.`))));
    if (t === 'gallery') { pickSub('photos'); setQuery(''); setSort('default'); }
    setTab(t); write(TAB_KEY, t); setReveal(null); setAskOn(false); setFresh((n) => n + 1);
    window.scrollTo({ top: 0 });
  };
  const pick = (t: TabId) => {
    if (!hasDirty()) { openTab(t); return; }
    void confirmDiscard().then((ok) => { if (ok) openTab(t); });
  };
  // 폰에서 본문을 좌우로 쓸면 옆 탭으로(TabSwipe.tsx — 데일리와 같은 판정). 탭을 누른 것과 같이 pick 으로 바꾸고 맨 위로 올린다.
  // 쓰다 만 폼이 있으면 쓸기는 받지 않는다(탭을 누르면 확인을 거쳐 넘어간다)
  useTabSwipe({ keys: TAB_IDS, current: tab, onPick: openTab, enabled: () => !hasDirty() });
  const today = todayStr();
  const goTask = (id: string, t: WorkTabId, guide = false) => {
    if (t !== tab) { setTab(t); write(TAB_KEY, t); setAskOn(false); }
    setReveal((r) => ({ id, tab: t, n: (r?.n ?? 0) + 1, guide }));
  };
  // 할 일로 건너가기(「이번 주 할 일」 · 검색 결과): 같은 탭이어도 그 탭의 다른 블록을 접으므로(그 안의 쓰다 만 폼이 사라진다)
  // 쓰다 만 폼이 있으면 늘 먼저 「저장 안 한 내용」 확인을 받는다
  const pickTask = (id: string, t: WorkTabId, guide = false) => {
    if (!hasDirty()) { goTask(id, t, guide); return; }
    void confirmDiscard().then((ok) => { if (ok) goTask(id, t, guide); });
  };
  // 검색 결과에서 고른 할 일 · 연락처(components/search/jump.ts). 연락처는 다른 탭으로 옮길 때만 확인(같은 탭이면 줄로 내려가기만 한다)
  //   처음 그릴 때 꺼냈으면(다른 화면에서 옮겨 옴) 스크롤 위치 되돌리기는 하지 않는다 — 그 줄로 가는 것과 부딪치지 않게
  const jumped = useRef(false);
  useJump('task', (j) => { jumped.current = true; if (j.tab) pickTask(j.id, j.tab, j.guide); });
  useJump('contact', (j) => {
    jumped.current = true;
    const go = () => { if (tab !== 'contacts') openTab('contacts'); revealRow(`contact-${j.id}`); };
    if (tab === 'contacts' || !hasDirty()) { go(); return; }
    void confirmDiscard().then((ok) => { if (ok) go(); });
  });

  // 탭마다 블록 묶음 · 이번 주 할 일(곁 칸은 지금 탭, 일터가 아닌 탭에서는 셋 다 모아서)
  const work = useMemo(() => {
    if (!doc) return null;
    return Object.fromEntries(CARD_TABS.map((c) => [c.tab, tasksByCard(doc, c.cards)])) as Record<WorkTabId, Record<string, TaskItem[]>>;
  }, [doc]);
  const late = useMemo(() => {
    const out: Partial<Record<TabId, number>> = {};
    if (work) for (const c of CARD_TABS) out[c.tab] = tabCounts(work[c.tab], today).late;
    return out;
  }, [work, today]);

  // 새로고침 · 돌아왔을 때 적어 둔 스크롤 위치로 한 번(데이터가 그려진 뒤), 그다음부터는 멈출 때마다 적는다
  const shownOnce = !!doc && !!work;
  useEffect(() => { dropOldLocal(); }, []);
  useEffect(() => {
    if (!shownOnce) return;
    const undo = jumped.current ? () => undefined : restoreScroll();
    const untrack = trackScroll();
    return () => { undo(); untrack(); };
  }, [shownOnce]);

  if (!doc || !work) return null;
  const weekFor = (tabs: WorkTabId[]) => tabs.flatMap((t) => weekTasks(work[t], today).list.map((task) => ({ task, tab: t })))
    .sort((a, b) => (a.task.due ?? '').localeCompare(b.task.due ?? ''));
  const asideWeek = weekFor(isWorkTab(tab) ? [tab] : CARD_TABS.map((c) => c.tab));
  const weekTitle = '이번 주 할 일';
  const askCount = isWorkTab(tab) ? Object.values(work[tab]).flat().filter((t) => isAsk(t) && !t.done).length : 0;
  const ask = isWorkTab(tab) && (askCount > 0 || askOn) ? <AskToggle on={askOn} count={askCount} onToggle={() => setAskOn((v) => !v)} /> : null;

  return (
    <>
      <h1 className="sr-only">우리 준비 간단히 보기</h1>
      <HomeTabBar tab={tab} onPick={pick} late={late} idBase={uid} />

      <div data-tab-swipe className="mx-auto w-full max-w-content pt-2 md:px-safe md:pt-4 lg:grid lg:max-w-wide lg:grid-cols-[minmax(0,1fr)_18.75rem] lg:items-start lg:gap-x-6">
        <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${tab}`} className="min-w-0">
          {isWorkTab(tab) ? (
            <WorkTab key={`${tab}:${fresh}`} tab={tab} groups={work[tab]} doc={doc} steps={steps} today={today}
              weekItems={weekFor([tab])} weekTitle={weekTitle} onPickWeek={pickTask}
              reveal={reveal?.tab === tab ? reveal : null} ask={ask} askOn={askOn} onAskOff={() => setAskOn(false)} />
          ) : tab === 'contacts' ? (
            <div className="px-safe pb-2 md:px-0"><ContactsTab /></div>
          ) : (
            // 갤러리 · 달력은 일터 탭처럼 흰 블록을 쌓는다(폰은 화면 끝까지)
            <>
              {tab === 'gallery' && <PhotosTab key={fresh} sub={photoSub} onSub={pickSub} />}
              {tab === 'calendar' && <CalendarTab key={fresh} rowSteps={steps} today={today} />}
            </>
          )}
        </div>
        {/* 곁 칸(PC): 위에 붙어 따라온다(분야 탭 줄 아래) */}
        <aside aria-label="곁 칸" className="hidden lg:sticky lg:top-[calc(var(--spacing-tabbar)+1rem)] lg:flex lg:flex-col lg:gap-2">
          {/* 달력 탭에서는 달력이 같은 일을 하므로 이번 주 할 일을 숨긴다 */}
          {/* 「문의 필요만 보기」는 이번 주 블록 머리 오른쪽. 이번 주가 비어 블록이 없으면 같은 자리(곁 칸 맨 위 오른쪽)에 단추만 */}
          {tab !== 'calendar' && (asideWeek.length > 0
            ? <WeekBlock title={weekTitle} items={asideWeek} today={today} onPick={pickTask} showTab={!isWorkTab(tab)} headRight={ask} />
            : ask && <AskRow>{ask}</AskRow>)}
          <QuickCalls doc={doc} onMore={() => pick('contacts')} />
        </aside>
      </div>

      <footer className="mt-10 px-safe">
        <ViewPicker />
      </footer>
    </>
  );
}

/**
 * 일터 탭 하나(행정 · 설비 · 운영): 이번 주 할 일(폰 · 태블릿 — 머리 오른쪽에 「문의 필요만 보기」) → 「단계 n」 블록 하나(단계들을 흰 면 하나에, sortCards 순서).
 * 두 블록 사이는 바탕 회색 8px(데일리 --gap), 「단계」 블록 안의 단계끼리는 1px 선. 머리로도 가른다: 형광 밑줄은 「이번 주 할 일」에만, 「단계」 머리는 밑줄 없음(BlockHead mark="none").
 * 단계는 처음에 모두 접혀 있고(머리 줄만), 펼친 단계 id 는 이 브라우저 탭에 기억한다(OPEN_KEY — sessionStorage, 새로 들어오면 다 접힘).
 * 다 끝낸 단계 · 행정의 1~3단계도 따로 묶지 않고 마감 순서 제자리에 접힌 채 둔다.
 * 「문의 필요만 보기」(ask — 상태는 SimpleHome)는 늘 「이번 주 할 일」 머리 오른쪽(폰 · 태블릿은 여기, PC는 곁 칸). 켜도 자리를 옮기지 않는다.
 * 이번 주가 비어 그 블록이 없으면 같은 자리(본문 맨 위 오른쪽)에 단추만 둔다.
 */
function WorkTab({ tab, groups, doc, steps, today, weekItems, weekTitle, onPickWeek, reveal, ask, askOn, onAskOff }: {
  tab: WorkTabId; groups: Record<string, TaskItem[]>; doc: ProgressDoc; steps: StepRef[]; today: string;
  weekItems: WeekItem[]; weekTitle: string; onPickWeek: (id: string, tab: WorkTabId) => void;
  reveal: Omit<Reveal, 'tab'> | null;
  ask: React.ReactNode; askOn: boolean; onAskOff: () => void;
}) {
  const uid = useId();
  const def = workTab(tab);
  const cards = def.cards;
  const sums = Object.fromEntries(cards.map((c) => [c.id, summarize(c, groups[c.id], doc, today)]));
  // 낱말 블록의 「그 밖에」는 할 일이 없으면 숨긴다
  const visible = cards.filter((c) => c.match || c.id !== 'other' || groups[c.id].length > 0);
  const list = sortCards(visible, sums);
  const [opened, setOpened] = useState<Set<string>>(savedOpen);
  const setOpen = (id: string, on: boolean) => setOpened((prev) => {
    if (prev.has(id) === on) return prev;
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    write(OPEN_KEY, JSON.stringify([...next]));
    return next;
  });
  // 「문의 필요만 보기」를 켠 동안은 문의 할 일이 있는 블록만, 그 안에 문의 할 일(과 세부 항목 · 부모)만 펼쳐 보인다
  // (켠 동안 접은 것만 따로 — 기기에 기억하지 않고, 껐다 켜면 다시 다 펼침)
  const [askClosed, setAskClosed] = useState<Set<string>>(() => new Set());
  const [askSeen, setAskSeen] = useState(askOn);
  if (askSeen !== askOn) { setAskSeen(askOn); setAskClosed(new Set()); }
  const titleOf = (c: CardDef) => (c.stepTitle ? steps.find((s) => s.id === c.stepTitle)?.title ?? c.title : c.title);
  const block = (c: CardDef, tasks = groups[c.id]) => {
    const id = blockId(tab, c.id);
    const on = askOn ? !askClosed.has(id) : opened.has(id);
    const toggle = askOn
      ? () => setAskClosed((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; })
      : () => setOpen(id, !on);
    return (
      <StepBlock key={c.id} blockId={id} card={c} cards={cards} title={titleOf(c)} tasks={tasks} summary={sums[c.id]} steps={steps} today={today}
        open={on} onToggle={toggle} reveal={reveal && c.id === revealCard?.id ? reveal : null} />
    );
  };

  // 이번 주 할 일에서 고른 할 일로: 그 할 일이 든 블록을 먼저 펼치고, 줄이 아직 없으면(방금 펼침 · 문의 거르기에 가림) 거르기를 끄고 다시
  const revealCard = reveal ? cards.find((c) => groups[c.id]?.some((t) => t.id === reveal.id)) : undefined;
  const revealBlock = revealCard ? blockId(tab, revealCard.id) : null;
  useEffect(() => {
    if (!reveal) return;
    // 건너가기를 누를 때마다 한 번: 이 탭의 다른 블록은 접고 그 블록 하나만 편다(다른 탭에서 펼친 것은 그대로)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 건너가기를 누를 때마다 한 번
    if (revealBlock) setOpened((prev) => {
      const next = new Set([...prev].filter((id) => !id.startsWith(`${tab}.`)));
      next.add(revealBlock);
      write(OPEN_KEY, JSON.stringify([...next]));
      return next;
    });
    let tries = 0;
    let raf = 0;
    const tryGo = () => {
      if (focusTask(reveal.id, { guide: reveal.guide }) || tries++ > 30) return;
      onAskOff();
      raf = window.requestAnimationFrame(tryGo);
    };
    raf = window.requestAnimationFrame(tryGo);
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reveal(누를 때마다 새 값)에만 반응한다
  }, [reveal]);

  const shown = askOn ? list.filter((c) => askOnly(groups[c.id]).length > 0) : list;
  return (
    <div className="flex flex-col gap-2">
      {weekItems.length > 0
        ? <WeekBlock title={weekTitle} items={weekItems} today={today} onPick={onPickWeek} headRight={ask} className="lg:hidden" stickyHead />
        : ask && <AskRow className="lg:hidden">{ask}</AskRow>}
      {askOn && shown.length === 0 && <p className={`${blockCls} px-5 py-4 text-base text-muted`}>문의할 일이 없어요.</p>}
      {/* 「단계 n」 블록: 단계들을 흰 면 하나에 — 블록 머리(형광 밑줄 없음) 밑에 단계 머리 줄끼리 1px 선 */}
      {shown.length > 0 && (
        <section aria-labelledby={`${uid}-steps`} className={blockCls}>
          <BlockHead id={`${uid}-steps`} title="단계" count={shown.length} mark="none" />
          {shown.map((c) => block(c, askOn ? askOnly(groups[c.id]) : groups[c.id]))}
        </section>
      )}
    </div>
  );
}

/** 「문의 필요만 보기」를 블록 밖에 둘 때의 자리(이번 주 할 일이 없어 그 블록이 숨었을 때 — 같은 자리 오른쪽, 띠 없이 단추만) */
function AskRow({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`-mb-1 flex justify-end px-2 md:px-0 ${className}`}>{children}</div>;
}

/**
 * 「문의 필요만 보기 n」 거르기(문의 할 일이 있을 때만): 작은 글자 단추(14). 켜면 굵게 + 아래 2px 검정 선(데일리 고르개 꼴).
 * 선은 글자 폭만큼(안쪽 span 이 단추 높이를 채워 단추 아래 끝에 긋는다) — 단추 상자 폭이면 오른쪽 20px 여백까지 넘어가서
 */
function AskToggle({ on, count, onToggle }: { on: boolean; count: number; onToggle: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onToggle}
      className={`-mr-3 inline-flex min-h-11 items-stretch px-3 text-sm transition-colors ${on ? 'font-bold text-ink' : 'font-semibold text-ink-soft hover:text-ink'}`}>
      <span className={`inline-flex items-center gap-1 ${on ? 'shadow-[inset_0_-2px_0_var(--color-ink)]' : ''}`}>
        문의 필요만 보기<span className="font-normal text-muted tabular-nums">{count}</span>
      </span>
    </button>
  );
}

type WeekItem = { task: TaskItem; tab: WorkTabId };
/** 「이번 주 할 일」에 처음 보이는 줄 수(넘으면 「n개 더 보기」로 펼친다) */
const WEEK_SHOWN = 5;

/**
 * 「이번 주 할 일 n」 블록: 기한 지남 + 7일 안 마감만, 줄은 간단히 [남은 날 꼬리표] 제목(메모 · 단추 없음). 5개까지 보이고 넘으면 「n개 더 보기」.
 * 누르면 아래 블록의 그 할 일 줄로 내려가 메모를 펼치고 잠깐 형광으로 칠한다(다른 탭이면 그 탭으로). 없으면 블록째 숨긴다.
 * showTab = 여러 탭을 모았을 때 줄 끝에 「행정」 같은 탭 이름(13 메타). headRight = 머리 오른쪽 작은 단추(「문의 필요만 보기」).
 */
function WeekBlock({ title, items, today, onPick, showTab = false, headRight, className = '', stickyHead = false }: {
  title: string; items: WeekItem[]; today: string; onPick: (id: string, tab: WorkTabId) => void; showTab?: boolean; headRight?: React.ReactNode; className?: string;
  /** 본문(폰 · 태블릿)의 이번 주 블록: 머리를 탭 줄 밑에 붙인다(펼친 단계 머리와 같은 규칙). 곁 칸(PC)은 곁 칸째 따라오므로 붙이지 않는다 */
  stickyHead?: boolean;
}) {
  const uid = useId();
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const label = (t: WorkTabId) => CARD_TABS.find((c) => c.tab === t)?.label ?? '';
  const shown = all ? items : items.slice(0, WEEK_SHOWN);
  const rest = items.length - WEEK_SHOWN;
  return (
    <section aria-labelledby={`${uid}-h`} className={`${blockCls} ${className}`}>
      <BlockHead id={`${uid}-h`} title={title} count={items.length} right={headRight} sticky={stickyHead} />
      <ul id={`${uid}-l`} className="border-t border-line px-5">
        {shown.map(({ task, tab }) => {
          const rel = relDay(task.due!, today);
          const tone: BadgeTone = rel.tone === 'late' ? 'danger' : daysBetween(today, task.due!) <= SOON_DAYS ? 'warn' : 'neutral';
          return (
            <li key={task.id} className="border-b border-line last:border-b-0">
              <button type="button" onClick={() => onPick(task.id, tab)}
                className="-mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-sunken">
                {/* 꼬리표는 내용 폭(고정 칸 없음) — PC 300px 곁 칸에서도 제목이 한 줄에 들게 */}
                <Badge tone={tone} className="shrink-0">{rel.text}</Badge>
                <span className="min-w-0 flex-1 text-base text-ink-soft">{task.text}</span>
                {showTab && <span className="shrink-0 text-meta text-muted">{label(tab)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {/* 5개를 넘으면 「n개 더 보기」(접는 줄 꼴 — 펼치면 「접기」) */}
      {rest > 0 && (
        <span className="block border-t border-line px-1">
          <FoldRow strongChevron label={all ? '접기' : `${rest}개 더 보기`} open={all} onToggle={() => setAll((v) => !v)} controls={`${uid}-l`} />
        </span>
      )}
    </section>
  );
}

/** 곁 칸 「연락처 바로 걸기」: 연락처 탭의 처음 5곳(번호가 있는 곳) — 누르면 바로 건다. 더 있으면 「더보기」 = 연락처 탭 */
function QuickCalls({ doc, onMore }: { doc: ProgressDoc; onMore: () => void }) {
  const uid = useId();
  const all = contacts(doc.property).filter((c) => c.phone);
  if (all.length === 0) return null;
  const list = all.slice(0, 5);
  return (
    <section aria-labelledby={`${uid}-h`} className={blockCls}>
      <BlockHead id={`${uid}-h`} title="연락처 바로 걸기" />
      <ul className="border-t border-line px-5">
        {list.map((c) => (
          <li key={c.item.id} className="border-b border-line last:border-b-0">
            <a href={telOf(c.phone!)} aria-label={`${c.name}에게 전화 걸기 ${c.phone}`}
              className="-mx-2 flex min-h-12 items-center gap-3 rounded-control px-2 py-2 transition-colors hover:bg-sunken">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-ink">{c.name}</span>
                {c.work && <span className="block truncate text-meta text-muted">{c.work}</span>}
              </span>
              <LineIcon name="phone" className="size-5 text-ink-soft" />
            </a>
          </li>
        ))}
      </ul>
      {all.length > list.length && (
        <button type="button" onClick={onMore} className="flex min-h-11 w-full items-center justify-center gap-1 border-t border-line text-cta text-ink-soft hover:text-ink">
          더보기<span className="text-meta text-muted">{all.length - list.length}</span>
        </button>
      )}
    </section>
  );
}
