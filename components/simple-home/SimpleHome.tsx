'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Content, ProgressDoc, TaskItem } from '@/lib/core/types';
import { usePhotos } from '@/components/progress/PhotosPanel';
import { todayStr } from '@/lib/client/format';
import { useProgress } from '@/components/progress/ProgressProvider';
import { useSite } from '@/components/shell/SiteShell';
import { Card } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { TaskRow } from '@/components/tasks/TaskRow';
import { useEditingSet, useStickyDone } from '@/components/tasks/useTaskList';
import { CalendarTab } from './CalendarTab';
import { ContactsTab } from './ContactsTab';
import { PhotosTab } from './PhotosTab';
import { ReceivedDocs } from './ReceivedDocs';
import { TaskCard } from './TaskCard';
import {
  AIRBNB_CARDS, DOC_CARDS, DONE_STEPS, INTERIOR_CARDS, TABS, WEEK_MAX, askOnly, dateParts, isAsk, sortCards, summarize, tabCounts, tasksByCard, weekTasks,
  type CardDef, type TabId,
} from './home-model';

// 고른 탭 · 펼친 카드는 이 브라우저에만 기억한다(두 사람 화면이 서로 바뀌지 않게)
const TAB_KEY = 'home:sheet';
const OPEN_KEY = 'home:open-cards';
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장이 막혀도 이번 화면에는 적용 */ } };

/**
 * 새 홈(로그인한 두 사람): 엑셀 시트처럼 맨 위 탭 여섯 개 — 서류 · 인테리어 · 사진 · 에어비앤비 · 연락처 · 달력(뉴스는 2026-10-28 뺌).
 * 홈 안에서 끝난다 — 「우리 집」(/house)으로 보내는 링크를 두지 않는다(사진 전체도 사진 탭 안).
 * 탭마다 큰 덩어리 카드(마감 날짜를 크게), 펼치면 그 자리에서 체크 · 추가 · 고치기 · 지우기 · 메모.
 * 서류 · 인테리어 · 에어비앤비 탭 맨 위에는 「일주일 안에 할 일」(기한 지남 + 일주일 안 마감, 급한 순 5개).
 * 달력 탭은 카드 마감 날짜만 — 날짜를 눌러 카드를 고르면 그 탭으로 가서 그 카드를 펼친다.
 * 예전 홈(준비 일정 · 간트 · 달력)은 /classic 에 그대로 있고, 맨 아래 작은 「예전 화면」 글자로만 들어간다.
 */
export function SimpleHome({ content }: { content: Content }) {
  const { doc } = useProgress();
  const { steps } = useSite();
  const { ensure } = usePhotos();
  const uid = useId();
  const tabsRef = useRef<HTMLDivElement>(null);
  // 할 일 메모 사진을 보이려고 사진 목록도 처음에 한 번 받는다
  useEffect(() => { ensure(); }, [ensure]);
  const [tab, setTab] = useState<TabId>(() => {
    const v = read(TAB_KEY);
    return TABS.some((t) => t.id === v) ? (v as TabId) : 'docs';
  });
  const pick = (t: TabId) => { setTab(t); write(TAB_KEY, t); window.scrollTo({ top: 0 }); };
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

  // 탭 이름 옆 빨강 점: 그 탭에 기한 지난 안 끝난 일이 있나
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
      {/* 시트 탭: 머리글 띠 바로 밑에 붙어 따라온다. 고른 탭 = ink 700 + 3px 밑줄(SubNav 와 같은 모양) */}
      <div className="sticky top-[calc(56px+env(safe-area-inset-top))] z-30 -mx-4 -mt-4 mb-4 bg-page px-4 pt-1">
        <div ref={tabsRef} role="tablist" aria-label="한눈에 보기" className="flex overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button key={t.id} type="button" role="tab" id={`${uid}-${t.id}`} aria-selected={on} aria-controls={`${uid}-panel`} onClick={() => pick(t.id)}
                className={`relative flex min-h-12 flex-1 shrink-0 items-center justify-center gap-1 whitespace-nowrap px-3 text-base transition-colors ${on ? 'font-bold text-ink' : 'font-semibold text-muted hover:text-ink'}`}>
                {t.label}
                {/* 빨강 점은 지금 고른 탭이 아닐 때만(고른 탭은 카드가 「기한 지난 일 n개」로 말한다) */}
                {!on && late[t.id] > 0 && <><span className="size-1.5 rounded-full bg-danger-ink" aria-hidden /><span className="sr-only">(기한 지남 있음)</span></>}
                {on && <span className="absolute inset-x-1 bottom-0 h-[3px] rounded-full bg-ink" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>

      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${tab}`}>
        {tab === 'docs' && <CardsTab key="docs" tab="docs" cards={DOC_CARDS} doc={doc} steps={steps} today={today} focus={focus} onFocused={() => setFocus(null)}
          afterFirst={<ReceivedDocs />} extra={<DoneSteps doc={doc} steps={steps} today={today} />} />}
        {tab === 'interior' && <CardsTab key="interior" tab="interior" cards={INTERIOR_CARDS} doc={doc} steps={steps} today={today} focus={focus} onFocused={() => setFocus(null)} />}
        {tab === 'photos' && <PhotosTab />}
        {tab === 'airbnb' && <CardsTab key="airbnb" tab="airbnb" cards={AIRBNB_CARDS} doc={doc} steps={steps} today={today} focus={focus} onFocused={() => setFocus(null)} />}
        {tab === 'contacts' && <ContactsTab />}
        {tab === 'calendar' && <CalendarTab steps={content.steps} today={today} onOpenCard={openCard} />}
      </div>

      <footer className="mt-12 flex justify-center">
        <Link href="/classic" className="inline-flex min-h-11 items-center px-3 text-sm font-normal text-muted hover:text-ink-soft hover:underline">예전 화면으로 보기</Link>
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
  // 마감 이른 순 → 날짜 없는 카드 → 다 끝낸 카드. 가장 급한 카드(맨 앞, 안 끝났고 날짜 있음) 하나만 청록 머리
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
  useEffect(() => {
    if (!focus) return;
    const raf = window.requestAnimationFrame(() => {
      const el = document.getElementById(anchor(focus));
      el?.scrollIntoView({ block: 'start' });
      el?.querySelector<HTMLElement>('h3 button')?.focus({ preventScroll: true });
      onFocused?.();
    });
    return () => window.cancelAnimationFrame(raf);
    // 탭이 열릴 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-sm font-normal text-muted">오늘 {Number(today.slice(5, 7))}월 {Number(today.slice(8))}일 ({wd})</p>
        {/* 거르기 단추: 켜면 ink 면(고른 거르기 = ink, DESIGN 2.2), 끄면 테두리만 */}
        {(askCount > 0 || askOn) && (
          <button type="button" aria-pressed={askOn} onClick={() => setAskOn((v) => !v)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-bold transition-colors ${askOn ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink hover:bg-sunken'}`}>
            <i className="fas fa-circle-question" aria-hidden />문의 필요만 보기<span className="font-normal tabular-nums">{askCount}</span>
          </button>
        )}
      </div>
      {askOn && shown.length === 0 && <p className="text-base text-muted">문의할 일이 없어요.</p>}
      {!askOn && <WeekBundle groups={groups} doc={doc} steps={steps} today={today} />}
      {shown.map((c, i) => (
        <Fragment key={c.id}>
          <TaskCard card={c} cards={cards} tasks={askOn ? askGroups[c.id] : groups[c.id]} summary={sums[c.id]} steps={steps} today={today}
            open={askOn || open.has(c.id)} onToggleOpen={() => toggle(c.id)} hero={c.id === heroId} anchorId={anchor(c.id)} />
          {/* 가장 급한 카드 바로 밑(서류 탭: 받아 둔 서류) */}
          {i === 0 && !askOn && afterFirst}
        </Fragment>
      ))}
      {!askOn && extra}
    </div>
  );
}

/**
 * 「일주일 안에 할 일」: 그 탭의 기한 지남 + 일주일 안 마감, 급한 순 WEEK_MAX 개. 그 줄에서 바로 체크 · 고치기(같은 TaskRow 쉬운 모양).
 * 없으면 숨긴다. 같은 할 일이 아래 카드에도 있다. 경고는 줄마다 남은 날 배지 한 번만 — 묶음 이름에는 개수만.
 */
function WeekBundle({ groups, doc, steps, today }: { groups: Record<string, TaskItem[]>; doc: ProgressDoc; steps: StepRef[]; today: string }) {
  const uid = useId();
  const { isDone, onToggle } = useStickyDone();
  const { editing, reportEdit } = useEditingSet();
  const { list, total } = useMemo(() => weekTasks(groups, today, (t) => isDone(t) && !editing.has(t.id)), [groups, today, isDone, editing]);
  if (list.length === 0) return null;
  return (
    <Card as="section" aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className="flex flex-wrap items-baseline gap-x-2 px-4 pt-4 pb-3 text-lg font-bold text-ink">
        일주일 안에 할 일
        <span className="text-sm font-normal text-muted">{total > WEEK_MAX ? `${total}개 중 ${list.length}개만 보여요` : `${total}개`}</span>
      </h3>
      <ul className="border-t border-line">
        {list.map((t) => (
          <TaskRow key={t.id} t={t} steps={steps} listStepId={null} scope="page" inset simple
            parentTitle={t.parentId ? doc.tasks[t.parentId]?.text : undefined}
            onEditChange={reportEdit} onToggle={onToggle} onGone={() => undefined} />
        ))}
      </ul>
    </Card>
  );
}

/** 서류 탭 맨 아래: 이미 끝난 앞 단계(집 고르기 · 구청 확인 · 계약)는 「끝난 일」로 접어 둔다 */
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
