'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Content, ProgressDoc, TaskItem } from '@/lib/core/types';
import { usePhotos } from '@/components/progress/PhotosPanel';
import { todayStr } from '@/lib/client/format';
import { useProgress } from '@/components/progress/ProgressProvider';
import { useSite } from '@/components/shell/SiteShell';
import { Card, softCardCls } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { LineIcon } from '@/components/ui/LineIcon';
import { TaskRow } from '@/components/tasks/TaskRow';
import { useEditingSet, useStickyDone } from '@/components/tasks/useTaskList';
import { CalendarTab } from './CalendarTab';
import { ContactsTab } from './ContactsTab';
import { PhotosTab, type PhotoSub } from './PhotosTab';
import { DocsLink } from './ReceivedDocs';
import { TaskCard } from './TaskCard';
import {
  AIRBNB_CARDS, DOC_CARDS, DONE_STEPS, INTERIOR_CARDS, TABS, WEEK_MAX, askOnly, dateParts, isAsk, sortCards, summarize, tabCounts, tasksByCard, weekTasks,
  type CardDef, type TabId,
} from './home-model';

// 고른 탭 · 펼친 카드 · 사진 · 문서 하위 탭은 이 브라우저에만 기억한다(두 사람 화면이 서로 바뀌지 않게)
const TAB_KEY = 'home:sheet';
const OPEN_KEY = 'home:open-cards';
const PHOTO_SUB_KEY = 'home:photos-sub';
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장이 막혀도 이번 화면에는 적용 */ } };

/** 위 탭 줄(시안 B): 선 아이콘 26 위 + 14px 이름, 고른 탭 = ink + 2px 검정 밑줄, 나머지 muted. 폰에서 넘치면 옆으로 밀린다 */
export function HomeTabBar({ tab, onPick, late = {}, idBase, tabsRef }: {
  tab: TabId | null; onPick?: (t: TabId) => void; late?: Partial<Record<TabId, number>>; idBase?: string; tabsRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={tabsRef} role={onPick ? 'tablist' : undefined} aria-label={onPick ? '한눈에 보기' : undefined} aria-hidden={onPick ? undefined : true}
      className="flex gap-6.5 overflow-x-auto border-b border-line px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => {
        const on = t.id === tab;
        const cls = `relative flex shrink-0 flex-col items-center gap-1.5 whitespace-nowrap pb-2.5 pt-1 text-sm font-semibold transition-colors ${on ? 'text-ink' : 'text-muted hover:text-ink'}`;
        const body = (
          <>
            <span className="relative">
              <LineIcon name={t.icon} className="size-6.5" stroke={on ? 1.9 : 1.5} />
              {/* 빨강 점: 고르지 않은 탭에 기한 지난 안 끝난 일이 있을 때(고른 탭은 카드가 「기한 지난 일 n개」로 말한다) */}
              {!on && (late[t.id] ?? 0) > 0 && <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-danger-ink ring-2 ring-page" aria-hidden />}
            </span>
            <span>{t.label}</span>
            {!on && (late[t.id] ?? 0) > 0 && <span className="sr-only">(기한 지남 있음)</span>}
            {on && <span className="absolute -inset-x-0.5 -bottom-px h-0.5 bg-ink" aria-hidden />}
          </>
        );
        return onPick
          ? <button key={t.id} type="button" role="tab" id={`${idBase}-${t.id}`} aria-selected={on} aria-controls={`${idBase}-panel`} onClick={() => onPick(t.id)} className={cls}>{body}</button>
          : <span key={t.id} className={cls}>{body}</span>;
      })}
    </div>
  );
}

/**
 * 새 홈(로그인한 두 사람): 맨 위 탭 여섯 개 — 서류 · 인테리어 · 사진 · 문서 · 에어비앤비 · 연락처 · 달력(뉴스는 2026-10-28 뺌).
 * 홈 안에서 끝난다 — 「우리 집」(/house)으로 보내는 링크를 두지 않는다(사진 전체 · 받아 둔 문서도 「사진 · 문서」 탭 안).
 * 서류 · 인테리어 · 에어비앤비 탭: 「오늘 / 10월 28일 (수)」 → 「일주일 안에 할 일」(옅은 카드) → 가장 급한 카드(빨강 「남은 일 보기」) → 나머지 카드.
 * 달력 탭은 카드 마감 날짜만 — 날짜를 눌러 카드를 고르면 그 탭으로 가서 그 카드를 펼친다.
 * 예전 홈(준비 일정 · 간트 · 달력)은 /classic 에 그대로 있고, 맨 아래 작은 「예전 화면」 글자로만 들어간다.
 */
export function SimpleHome({ content }: { content: Content }) {
  const { doc } = useProgress();
  const { steps } = useSite();
  const { ensure } = usePhotos();
  const uid = useId();
  const tabsRef = useRef<HTMLDivElement>(null);
  // 할 일 메모 사진 · 받아 둔 문서 개수를 보이려고 사진 목록도 처음에 한 번 받는다
  useEffect(() => { ensure(); }, [ensure]);
  const [tab, setTab] = useState<TabId>(() => {
    const v = read(TAB_KEY);
    return TABS.some((t) => t.id === v) ? (v as TabId) : 'docs';
  });
  const [photoSub, setPhotoSub] = useState<PhotoSub>(() => (read(PHOTO_SUB_KEY) === 'docs' ? 'docs' : 'photos'));
  const pickSub = (s: PhotoSub) => { setPhotoSub(s); write(PHOTO_SUB_KEY, s); };
  const pick = (t: TabId) => { setTab(t); write(TAB_KEY, t); window.scrollTo({ top: 0 }); };
  // 서류 탭 「받아 둔 문서 n개 보기」 → 사진 · 문서 › 문서
  const goDocs = () => { pickSub('docs'); pick('photos'); };
  // 달력에서 고른 카드: 그 탭의 펼친 카드 기억에 더해 두고(탭이 열릴 때 펼친 채로 그려진다) 탭을 바꾼 뒤 그 카드로 내려간다
  const [focus, setFocus] = useState<string | null>(null);
  const openCard = (t: TabId, cardId: string) => {
    const key = `${OPEN_KEY}:${t}`;
    let ids: string[] = [];
    try { ids = JSON.parse(read(key) ?? '[]') as string[]; } catch { /* 처음처럼 */ }
    if (!ids.includes(cardId)) write(key, JSON.stringify([...ids, cardId]));
    setFocus(cardId);
    pick(t);
  };
  const today = todayStr();
  // 폰에서 탭 줄이 옆으로 밀릴 때 고른 탭이 화면 안에 오게
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

  // 탭 아이콘 옆 빨강 점: 그 탭에 기한 지난 안 끝난 일이 있나
  const late = useMemo(() => {
    if (!doc) return {} as Record<TabId, number>;
    return {
      docs: tabCounts(tasksByCard(doc, DOC_CARDS), today).late,
      interior: tabCounts(tasksByCard(doc, INTERIOR_CARDS), today).late,
      airbnb: tabCounts(tasksByCard(doc, AIRBNB_CARDS), today).late,
      photos: 0, contacts: 0, calendar: 0,
    } as Record<TabId, number>;
  }, [doc, today]);

  if (!doc) return null;
  return (
    <>
      <h1 className="sr-only">우리 준비 한눈에</h1>
      {/* 탭 줄: 머리글(60px) 바로 밑에 붙어 따라온다. 화면 양옆 24px 여백 밖까지 선을 긋는다 */}
      <div className="sticky top-[calc(60px+env(safe-area-inset-top))] z-30 -mx-6 -mt-4 mb-2 bg-page">
        <HomeTabBar tab={tab} onPick={pick} late={late} idBase={uid} tabsRef={tabsRef} />
      </div>

      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${tab}`}>
        {tab === 'docs' && <CardsTab key="docs" tab="docs" cards={DOC_CARDS} doc={doc} steps={steps} today={today} focus={focus} onFocused={() => setFocus(null)}
          afterFirst={<DocsLink onOpen={goDocs} />} extra={<DoneSteps doc={doc} steps={steps} today={today} />} />}
        {tab === 'interior' && <CardsTab key="interior" tab="interior" cards={INTERIOR_CARDS} doc={doc} steps={steps} today={today} focus={focus} onFocused={() => setFocus(null)} />}
        {tab === 'photos' && <PhotosTab sub={photoSub} onSub={pickSub} />}
        {tab === 'airbnb' && <CardsTab key="airbnb" tab="airbnb" cards={AIRBNB_CARDS} doc={doc} steps={steps} today={today} focus={focus} onFocused={() => setFocus(null)} />}
        {tab === 'contacts' && <ContactsTab />}
        {tab === 'calendar' && <CalendarTab steps={content.steps} today={today} onOpenCard={openCard} />}
      </div>

      <footer className="mt-12 flex justify-center">
        <Link href="/classic" className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-muted underline underline-offset-[3px] hover:text-ink">예전 화면으로 보기</Link>
      </footer>
    </>
  );
}

type StepRef = { id: number; title: string };

/** 펼친 카드 기억: 처음엔 모두 접는다(마감 목록이 첫 화면에 다 보이게) */
function useOpenCards(tab: string) {
  const [open, setOpen] = useState<Set<string>>(() => {
    const raw = read(`${OPEN_KEY}:${tab}`);
    if (raw) { try { return new Set(JSON.parse(raw) as string[]); } catch { /* 처음처럼 */ } }
    return new Set();
  });
  useEffect(() => { write(`${OPEN_KEY}:${tab}`, JSON.stringify([...open])); }, [tab, open]);
  const toggle = useCallback((id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  return { open, toggle };
}

/** 묶음 제목 줄(시안 B): 제목 20/600 + 오른쪽 개수 16 muted */
function SecHead({ id, title, count }: { id?: string; title: ReactNode; count?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 id={id} className="text-xl font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      {count != null && <span className="shrink-0 text-base font-medium text-muted tabular-nums">{count}</span>}
    </div>
  );
}

function CardsTab({ tab, cards, doc, steps, today, extra, afterFirst, focus = null, onFocused }: {
  tab: TabId; cards: CardDef[]; doc: ProgressDoc; steps: StepRef[]; today: string; extra?: ReactNode;
  /** 맨 앞(가장 급한) 카드 바로 밑에 둘 것 */
  afterFirst?: ReactNode;
  /** 달력에서 고른 카드 id: 그 카드로 내려가 머리에 포커스를 둔다 */
  focus?: string | null; onFocused?: () => void;
}) {
  const groups = useMemo(() => tasksByCard(doc, cards), [doc, cards]);
  const sums = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, summarize(c, groups[c.id], doc, today)])), [cards, groups, doc, today]);
  // 낱말 카드의 「그 밖」은 할 일이 없으면 숨긴다
  // 마감 이른 순 → 날짜 없는 카드 → 다 끝낸 카드. 가장 급한 카드(맨 앞, 안 끝났고 날짜 있음) 하나만 큰 옅은 카드
  const sorted = sortCards(cards.filter((c) => c.match || c.id !== 'other' || groups[c.id].length > 0), sums);
  const heroId = sorted[0] && !sums[sorted[0].id].finished && sums[sorted[0].id].deadline ? sorted[0].id : null;
  const { open, toggle } = useOpenCards(tab);
  // 「문의 필요만 보기」: 문의 할 일이 있는 카드만, 그 카드는 펼친 채 문의 할 일(과 세부 항목 · 부모)만
  const [askOn, setAskOn] = useState(false);
  const askGroups = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, askOnly(groups[c.id])])), [cards, groups]);
  const askCount = Object.values(groups).flat().filter((t) => isAsk(t) && !t.done).length;
  const shown = askOn ? sorted.filter((c) => askGroups[c.id].length > 0) : sorted;
  const { wd } = dateParts(today);
  const anchor = (id: string) => `home-card-${tab}-${id}`;
  const heroFirst = !askOn && !!heroId && shown[0]?.id === heroId;
  const rest = heroFirst ? shown.slice(1) : shown;
  const card =(c: CardDef) => (
    <TaskCard key={c.id} card={c} cards={cards} tasks={askOn ? askGroups[c.id] : groups[c.id]} summary={sums[c.id]} steps={steps} today={today}
      open={askOn || open.has(c.id)} onToggleOpen={() => toggle(c.id)} hero={!askOn && c.id === heroId} anchorId={anchor(c.id)} />
  );
  useEffect(() => {
    if (!focus) return;
    const raf = window.requestAnimationFrame(() => {
      const el = document.getElementById(anchor(focus));
      el?.scrollIntoView({ block: 'start' });
      el?.querySelector<HTMLElement>('h3 button, button[aria-expanded]')?.focus({ preventScroll: true });
      onFocused?.();
    });
    return () => window.cancelAnimationFrame(raf);
    // 탭이 열릴 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  return (
    <div className="flex flex-col gap-7">
      {/* 오늘: 「오늘」 16/500 muted + 「10월 28일 (수)」 28/700. 거르기 단추는 오른쪽 */}
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 pt-5">
        <div>
          <p className="text-base font-medium text-muted">오늘</p>
          <p className="mt-1 text-display font-bold tracking-[-0.015em] text-ink">{Number(today.slice(5, 7))}월 {Number(today.slice(8))}일 ({wd})</p>
        </div>
        {/* 거르기 단추: 켜면 검정 면, 끄면 테두리만(동그란 알약) */}
        {(askCount > 0 || askOn) && (
          <button type="button" aria-pressed={askOn} onClick={() => setAskOn((v) => !v)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors ${askOn ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink hover:border-ink'}`}>
            문의 필요만 보기<span className="font-normal tabular-nums">{askCount}</span>
          </button>
        )}
      </div>
      {askOn && shown.length === 0 && <p className="text-base text-muted">문의할 일이 없어요.</p>}
      {!askOn && <WeekBundle groups={groups} doc={doc} steps={steps} today={today} />}
      {/* 「가장 급한 일」 카드가 있으면 따로 세우고 바로 밑에 afterFirst(서류 탭: 받아 둔 문서 보기 한 줄), 나머지 카드는 16px 간격으로 한 묶음 */}
      {heroFirst && <Fragment key={shown[0].id}>{card(shown[0])}{afterFirst}</Fragment>}
      {rest.length > 0 && <div className="flex flex-col gap-4">{rest.map(card)}</div>}
      {!heroFirst && !askOn && afterFirst}
      {!askOn && extra}
    </div>
  );
}

/**
 * 「일주일 안에 할 일」(시안 B): 묶음 제목(20/600) + 개수, 그 밑 옅은 회색 카드에 줄들. 그 탭의 기한 지남 + 일주일 안 마감, 급한 순 WEEK_MAX 개.
 * 그 줄에서 바로 체크 · 고치기 · 지우기(같은 TaskRow 쉬운 모양). 없으면 숨긴다. 같은 할 일이 아래 카드에도 있다.
 */
function WeekBundle({ groups, doc, steps, today }: { groups: Record<string, TaskItem[]>; doc: ProgressDoc; steps: StepRef[]; today: string }) {
  const uid = useId();
  const { isDone, onToggle } = useStickyDone();
  const { editing, reportEdit } = useEditingSet();
  const { list, total } = useMemo(() => weekTasks(groups, today, (t) => isDone(t) && !editing.has(t.id)), [groups, today, isDone, editing]);
  if (list.length === 0) return null;
  return (
    <section aria-labelledby={`${uid}-h`}>
      <SecHead id={`${uid}-h`} title="일주일 안에 할 일" count={total > WEEK_MAX ? `${total}개 중 ${list.length}개` : `${total}개`} />
      <ul className={`${softCardCls} mt-3.5 px-5 py-1 [&>li]:border-line-strong`}>
        {list.map((t) => (
          <TaskRow key={t.id} t={t} steps={steps} listStepId={null} scope="page" inset simple
            parentTitle={t.parentId ? doc.tasks[t.parentId]?.text : undefined}
            onEditChange={reportEdit} onToggle={onToggle} onGone={() => undefined} />
        ))}
      </ul>
    </section>
  );
}

/** 서류 탭 맨 아래: 이미 끝난 앞 단계(집 고르기 · 구청 확인 · 계약)는 「다 끝낸 것」으로 접어 둔다 */
function DoneSteps({ doc, steps, today }: { doc: ProgressDoc; steps: StepRef[]; today: string }) {
  const uid = useId();
  const [show, setShow] = useState(false);
  const cards: CardDef[] = useMemo(() => DONE_STEPS.map((id) => ({ id: `step-${id}`, title: steps.find((s) => s.id === id)?.title ?? `${id}단계`, steps: [id], addStep: id })), [steps]);
  const groups = useMemo(() => tasksByCard(doc, cards), [doc, cards]);
  const { open, toggle } = useOpenCards('done');
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <FoldRow label="다 끝낸 것" count={cards.length} open={show} onToggle={() => setShow((v) => !v)} controls={`${uid}-done`} />
      </Card>
      {show && (
        <div id={`${uid}-done`} className="flex flex-col gap-4">
          {cards.map((c) => (
            <TaskCard key={c.id} card={c} cards={cards} tasks={groups[c.id]} summary={summarize(c, groups[c.id], doc, today)} steps={steps} today={today}
              open={open.has(c.id)} onToggleOpen={() => toggle(c.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
