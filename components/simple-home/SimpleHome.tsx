'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Content, ProgressDoc, TaskItem } from '@/lib/core/types';
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
import { CalendarTab } from './CalendarTab';
import { ContactsTab } from './ContactsTab';
import { PhotosTab, type PhotoSub } from './PhotosTab';
import { BlockHead, blockCls, StepBlock } from './StepBlock';
import {
  CARD_TABS, TABS, askOnly, contacts, daysBetween, isAsk, isWorkTab, relDay, splitBlocks, summarize, tabCounts, tasksByCard, telOf, weekTasks, workTab,
  type CardDef, type TabId, type WorkTabId,
} from './home-model';

// 고른 탭 · 갤러리 하위 탭은 이 브라우저에만 기억한다(두 사람 화면이 서로 바뀌지 않게)
const TAB_KEY = 'home:sheet';
const PHOTO_SUB_KEY = 'home:photos-sub';
// 2026-10-28 전 탭 이름(서류 · 인테리어 · 사진 · 에어비앤비)으로 기억된 값을 새 탭으로
const OLD_TAB: Record<string, TabId> = { docs: 'admin', interior: 'facility', photos: 'gallery', airbnb: 'ops' };
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장이 막혀도 이번 화면에는 적용 */ } };
const savedTab = (): TabId => {
  const v = read(TAB_KEY) ?? '';
  if (TABS.some((t) => t.id === v)) return v as TabId;
  return OLD_TAB[v] ?? 'admin';
};

/**
 * 분야 탭 줄(데일리 .tabs): 흰 면 줄 + 아래 1px 선, 글자 탭 16(아이콘 없음), 고른 탭 = 700 + 아래 2px 검정 선. 390px 폰에서 여섯 탭이 한 줄에 다 든다.
 * 화면 맨 위에 붙어 따라오고, 붙은 동안은 줄이 머리 띠와 같은 형광 면 + 검정 글자가 된다(데일리 .tabs--stuck).
 * 기한 지난 안 끝난 일이 있는 탭(고르지 않은 것)은 이름 옆 작은 빨강 점.
 */
export function HomeTabBar({ tab, onPick, late = {}, idBase }: {
  tab: TabId | null; onPick?: (t: TabId) => void; late?: Partial<Record<TabId, number>>; idBase?: string;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    bar.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);
  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px -mb-px" />
      <div className={`sticky top-0 z-30 border-b transition-colors ${stuck ? 'border-marker bg-marker text-on-marker [--tab-line:var(--color-on-marker)]' : 'border-line bg-surface text-ink [--tab-line:var(--color-ink)]'}`}>
        <div ref={bar} role={onPick ? 'tablist' : undefined} aria-label={onPick ? '분야' : undefined} aria-hidden={onPick ? undefined : true}
          className="mx-auto flex max-w-content overflow-x-auto px-2 [scrollbar-width:none] lg:max-w-wide [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => {
            const on = t.id === tab;
            const dot = !on && (late[t.id] ?? 0) > 0;
            const cls = `relative inline-flex h-11.5 shrink-0 items-center whitespace-nowrap px-3 text-base leading-none transition-opacity active:opacity-60 ${on ? 'font-bold' : 'font-semibold'}`;
            const body = (
              <>
                {t.label}
                {dot && <><span className="ml-0.5 size-1.5 self-start rounded-full bg-danger-ink mt-3" aria-hidden /><span className="sr-only">(기한 지남 있음)</span></>}
                {on && <span className={`absolute inset-x-3 bottom-0 bg-[var(--tab-line)] ${stuck ? 'h-[3px]' : 'h-0.5'}`} aria-hidden />}
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
 * - 일터 탭(행정 · 설비 · 운영): 「이번 주 할 일」 블록 → 「완료한 단계 n」 접는 줄 → 단계 블록들(마감 이른 순).
 * - PC(1024px 이상): 가운데 본문 + 오른쪽 곁 칸(「이번 주 할 일」 · 「연락처 바로 걸기」). 폰 · 태블릿에서는 「이번 주 할 일」이 본문 맨 위.
 * - 맨 아래 「간단히 보기 | 자세히 보기」 고르개(자세히 = /classic, 기기에 기억).
 * 홈 안에서 끝난다 — 「우리 집」(/house)으로 보내는 링크를 두지 않는다.
 */
export function SimpleHome({ content }: { content: Content }) {
  const { doc } = useProgress();
  const { steps } = useSite();
  const { ensure } = usePhotos();
  const uid = useId();
  // 할 일 사진 · 갤러리 개수를 보이려고 사진 목록도 처음에 한 번 받는다
  useEffect(() => { ensure(); }, [ensure]);
  const [tab, setTab] = useState<TabId>(savedTab);
  const [photoSub, setPhotoSub] = useState<PhotoSub>(() => (read(PHOTO_SUB_KEY) === 'docs' ? 'docs' : 'photos'));
  const pickSub = (s: PhotoSub) => { setPhotoSub(s); write(PHOTO_SUB_KEY, s); };
  // 「이번 주 할 일」에서 고른 할 일: 그 탭으로 가서(접힌 「완료한 단계」 안이면 펼쳐) 그 줄로 내려간다. 탭을 손으로 바꾸면 잊는다
  const [reveal, setReveal] = useState<{ id: string; tab: WorkTabId; n: number } | null>(null);
  const pick = (t: TabId) => { setTab(t); write(TAB_KEY, t); setReveal(null); window.scrollTo({ top: 0 }); };
  const today = todayStr();
  const goTask = (id: string, t: WorkTabId) => {
    if (t !== tab) { setTab(t); write(TAB_KEY, t); }
    setReveal((r) => ({ id, tab: t, n: (r?.n ?? 0) + 1 }));
  };

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

  if (!doc || !work) return null;
  const weekFor = (tabs: WorkTabId[]) => tabs.flatMap((t) => weekTasks(work[t], today).list.map((task) => ({ task, tab: t })))
    .sort((a, b) => (a.task.due ?? '').localeCompare(b.task.due ?? ''));
  const asideWeek = weekFor(isWorkTab(tab) ? [tab] : CARD_TABS.map((c) => c.tab));
  const weekTitle = '이번 주 할 일';

  return (
    <>
      <h1 className="sr-only">우리 준비 간단히 보기</h1>
      <HomeTabBar tab={tab} onPick={pick} late={late} idBase={uid} />

      <div className="mx-auto w-full max-w-content pt-2 md:px-safe md:pt-4 lg:grid lg:max-w-wide lg:grid-cols-[minmax(0,1fr)_18.75rem] lg:items-start lg:gap-x-6">
        <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${tab}`} className="min-w-0">
          {isWorkTab(tab) ? (
            <WorkTab key={tab} tab={tab} groups={work[tab]} doc={doc} steps={steps} today={today}
              week={<WeekBlock title={weekTitle} items={weekFor([tab])} today={today} onPick={goTask} className="lg:hidden" />}
              reveal={reveal?.tab === tab ? reveal : null} />
          ) : (
            <div className="px-safe pb-2 md:px-0">
              {tab === 'gallery' && <PhotosTab sub={photoSub} onSub={pickSub} />}
              {tab === 'contacts' && <ContactsTab />}
              {tab === 'calendar' && <CalendarTab steps={content.steps} rowSteps={steps} today={today} />}
            </div>
          )}
        </div>
        {/* 곁 칸(PC): 위에 붙어 따라온다(분야 탭 줄 아래) */}
        <aside aria-label="곁 칸" className="hidden lg:sticky lg:top-16 lg:flex lg:flex-col lg:gap-2">
          <WeekBlock title={weekTitle} items={asideWeek} today={today} onPick={goTask} showTab={!isWorkTab(tab)} />
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
 * 일터 탭 하나(행정 · 설비 · 운영): [문의 필요만 보기] → 이번 주 할 일(폰 · 태블릿) → 「완료한 단계 n」(접음) → 단계 블록들(마감 이른 순).
 * 블록 사이는 바탕 회색 8px(데일리 --gap). 행정의 1~3단계와 다 끝낸 블록은 「완료한 단계」 안에 접어 둔다.
 */
function WorkTab({ tab, groups, doc, steps, today, week, reveal }: {
  tab: WorkTabId; groups: Record<string, TaskItem[]>; doc: ProgressDoc; steps: StepRef[]; today: string; week: React.ReactNode;
  reveal: { id: string; n: number } | null;
}) {
  const uid = useId();
  const def = workTab(tab);
  const cards = def.cards;
  const sums = Object.fromEntries(cards.map((c) => [c.id, summarize(c, groups[c.id], doc, today)]));
  // 낱말 블록의 「그 밖에」는 할 일이 없으면 숨긴다
  const visible = cards.filter((c) => c.match || c.id !== 'other' || groups[c.id].length > 0);
  const { open, done } = splitBlocks(visible, sums, def.alwaysDone);
  const [showDone, setShowDone] = useState(false);
  // 「문의 필요만 보기」: 문의 할 일이 있는 블록만, 그 안에 문의 할 일(과 세부 항목 · 부모)만
  const [askOn, setAskOn] = useState(false);
  const askCount = Object.values(groups).flat().filter((t) => isAsk(t) && !t.done).length;
  const titleOf = (c: CardDef) => (c.stepTitle ? steps.find((s) => s.id === c.stepTitle)?.title ?? c.title : c.title);
  const block = (c: CardDef, list = groups[c.id]) => (
    <StepBlock key={c.id} card={c} cards={cards} title={titleOf(c)} tasks={list} summary={sums[c.id]} steps={steps} today={today} />
  );

  // 이번 주 할 일에서 고른 할 일로: 줄이 없으면(접힌 「완료한 단계」 안 · 문의 거르기에 가림) 펼친 뒤 다시
  useEffect(() => {
    if (!reveal) return;
    let tries = 0;
    let raf = 0;
    const tryGo = () => {
      if (focusTask(reveal.id) || tries++ > 30) return;
      setAskOn(false);
      setShowDone(true);
      raf = window.requestAnimationFrame(tryGo);
    };
    raf = window.requestAnimationFrame(tryGo);
    return () => window.cancelAnimationFrame(raf);
  }, [reveal]);

  if (askOn) {
    const shown = [...open, ...done].filter((c) => askOnly(groups[c.id]).length > 0);
    return (
      <div className="flex flex-col gap-2">
        <AskToggle on count={askCount} onToggle={() => setAskOn(false)} />
        {shown.length === 0 && <p className={`${blockCls} px-5 py-4 text-base text-muted`}>문의할 일이 없어요.</p>}
        {shown.map((c) => block(c, askOnly(groups[c.id])))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {askCount > 0 && <AskToggle on={false} count={askCount} onToggle={() => setAskOn(true)} />}
      {week}
      {done.length > 0 && (
        <div className={blockCls}>
          <span className="block px-1"><FoldRow label="완료한 단계" count={done.length} unit="" open={showDone} onToggle={() => setShowDone((v) => !v)} controls={`${uid}-done`} /></span>
        </div>
      )}
      {showDone && done.length > 0 && <div id={`${uid}-done`} className="flex flex-col gap-2">{done.map((c) => block(c))}</div>}
      {open.map((c) => block(c))}
    </div>
  );
}

/** 「문의 필요만 보기 n」 거르기(문의 할 일이 있을 때만): 블록 위 오른쪽 작은 글자 단추. 켜면 굵게 + 아래 2px 검정 선(데일리 고르개 꼴) */
function AskToggle({ on, count, onToggle }: { on: boolean; count: number; onToggle: () => void }) {
  return (
    <div className="flex justify-end px-2 md:px-0">
      <button type="button" aria-pressed={on} onClick={onToggle}
        className={`inline-flex min-h-11 items-center gap-1 px-3 text-sm transition-colors ${on ? 'font-bold text-ink shadow-[inset_0_-2px_0_var(--color-ink)]' : 'font-semibold text-ink-soft hover:text-ink'}`}>
        문의 필요만 보기<span className="font-normal text-muted tabular-nums">{count}</span>
      </button>
    </div>
  );
}

/**
 * 「이번 주 할 일 n」 블록: 기한 지남 + 7일 안 마감만, 줄은 간단히 [남은 날 꼬리표] 제목(메모 · 단추 없음).
 * 누르면 아래 블록의 그 할 일 줄로 내려가 메모를 펼치고 잠깐 형광으로 칠한다(다른 탭이면 그 탭으로). 없으면 블록째 숨긴다.
 * showTab = 여러 탭을 모았을 때 줄 끝에 「행정」 같은 탭 이름(13 메타).
 */
function WeekBlock({ title, items, today, onPick, showTab = false, className = '' }: {
  title: string; items: { task: TaskItem; tab: WorkTabId }[]; today: string; onPick: (id: string, tab: WorkTabId) => void; showTab?: boolean; className?: string;
}) {
  const uid = useId();
  if (items.length === 0) return null;
  const label = (t: WorkTabId) => CARD_TABS.find((c) => c.tab === t)?.label ?? '';
  return (
    <section aria-labelledby={`${uid}-h`} className={`${blockCls} ${className}`}>
      <BlockHead id={`${uid}-h`} title={title} count={items.length} />
      <ul className="border-t border-line px-5">
        {items.map(({ task, tab }) => {
          const rel = relDay(task.due!, today);
          const tone: BadgeTone = rel.tone === 'late' ? 'danger' : daysBetween(today, task.due!) <= SOON_DAYS ? 'warn' : 'neutral';
          return (
            <li key={task.id} className="border-b border-line last:border-b-0">
              <button type="button" onClick={() => onPick(task.id, tab)}
                className="-mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center gap-2 rounded-control px-2 py-2 text-left transition-colors hover:bg-sunken">
                <span className="w-18 shrink-0"><Badge tone={tone}>{rel.text}</Badge></span>
                <span className="min-w-0 flex-1 text-base text-ink-soft">{task.text}</span>
                {showTab && <span className="shrink-0 text-meta text-muted">{label(tab)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
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
