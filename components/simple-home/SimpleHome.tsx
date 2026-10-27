'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import type { ProgressDoc } from '@/lib/core/types';
import { todayStr } from '@/lib/client/format';
import { useProgress } from '@/components/progress/ProgressProvider';
import { useSite } from '@/components/shell/SiteShell';
import { Card } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { ContactsTab } from './ContactsTab';
import { GuQuestions } from './GuQuestions';
import { PhotosTab } from './PhotosTab';
import { TaskCard } from './TaskCard';
import {
  AIRBNB_CARDS, DOC_CARDS, DONE_STEPS, INTERIOR_CARDS, TABS, dateParts, sortCards, summarize, tabCounts, tasksByCard, type CardDef, type TabId,
} from './home-model';

// 고른 탭 · 펼친 카드는 이 브라우저에만 기억한다(두 사람 화면이 서로 바뀌지 않게)
const TAB_KEY = 'home:sheet';
const OPEN_KEY = 'home:open-cards';
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장이 막혀도 이번 화면에는 적용 */ } };

/**
 * 새 홈(로그인한 두 사람): 엑셀 시트처럼 맨 위 탭 다섯 개 — 서류 · 인테리어 · 사진 · 에어비앤비 · 연락처.
 * 탭마다 큰 덩어리 카드(마감 날짜를 크게), 펼치면 그 자리에서 체크 · 추가 · 고치기 · 지우기 · 메모.
 * 예전 홈(준비 일정 · 간트 · 달력)은 /classic 에 그대로 있고, 맨 아래 작은 「예전 화면」 글자로만 들어간다.
 */
export function SimpleHome() {
  const { doc } = useProgress();
  const { steps } = useSite();
  const uid = useId();
  const [tab, setTab] = useState<TabId>(() => {
    const v = read(TAB_KEY);
    return TABS.some((t) => t.id === v) ? (v as TabId) : 'docs';
  });
  const pick = (t: TabId) => { setTab(t); write(TAB_KEY, t); window.scrollTo({ top: 0 }); };
  const today = todayStr();

  // 탭 이름 옆 빨강 점: 그 탭에 기한 지난 안 끝난 일이 있나
  const late = useMemo(() => {
    if (!doc) return {} as Record<TabId, number>;
    return {
      docs: tabCounts(tasksByCard(doc, DOC_CARDS), today).late,
      interior: tabCounts(tasksByCard(doc, INTERIOR_CARDS), today).late,
      airbnb: tabCounts(tasksByCard(doc, AIRBNB_CARDS), today).late,
      photos: 0, contacts: 0,
    } as Record<TabId, number>;
  }, [doc, today]);

  if (!doc) return null;
  return (
    <>
      <h1 className="sr-only">우리 준비 한눈에</h1>
      {/* 시트 탭: 머리글 띠 바로 밑에 붙어 따라온다. 고른 탭 = ink 700 + 3px 밑줄(SubNav 와 같은 모양) */}
      <div className="sticky top-[calc(56px+env(safe-area-inset-top))] z-30 -mx-4 -mt-4 mb-4 bg-page px-4 pt-1">
        <div role="tablist" aria-label="한눈에 보기" className="flex overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button key={t.id} type="button" role="tab" id={`${uid}-${t.id}`} aria-selected={on} aria-controls={`${uid}-panel`} onClick={() => pick(t.id)}
                className={`relative flex min-h-12 flex-1 shrink-0 items-center justify-center gap-1 whitespace-nowrap px-2 text-base transition-colors ${on ? 'font-bold text-ink' : 'font-semibold text-muted hover:text-ink'}`}>
                {t.label}
                {late[t.id] > 0 && <><span className="size-1.5 rounded-full bg-danger-ink" aria-hidden /><span className="sr-only">(기한 지남 있음)</span></>}
                {on && <span className="absolute inset-x-1 bottom-0 h-[3px] rounded-full bg-ink" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>

      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${tab}`}>
        {tab === 'docs' && <CardsTab key="docs" tab="docs" cards={DOC_CARDS} doc={doc} steps={steps} today={today} extra={<><GuQuestions /><DoneSteps doc={doc} steps={steps} today={today} /></>} />}
        {tab === 'interior' && <CardsTab key="interior" tab="interior" cards={INTERIOR_CARDS} doc={doc} steps={steps} today={today} />}
        {tab === 'photos' && <PhotosTab />}
        {tab === 'airbnb' && <CardsTab key="airbnb" tab="airbnb" cards={AIRBNB_CARDS} doc={doc} steps={steps} today={today} />}
        {tab === 'contacts' && <ContactsTab />}
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

function CardsTab({ tab, cards, doc, steps, today, extra }: {
  tab: TabId; cards: CardDef[]; doc: ProgressDoc; steps: StepRef[]; today: string; extra?: ReactNode;
}) {
  const groups = useMemo(() => tasksByCard(doc, cards), [doc, cards]);
  const sums = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, summarize(c, groups[c.id], doc, today)])), [cards, groups, doc, today]);
  // 낱말 카드의 「그 밖」은 할 일이 없으면 숨긴다
  // 마감 이른 순 → 날짜 없는 카드 → 다 끝낸 카드. 가장 급한 카드(맨 앞, 안 끝났고 날짜 있음) 하나만 청록 머리
  const shown = sortCards(cards.filter((c) => c.match || c.id !== 'other' || groups[c.id].length > 0), sums);
  const heroId = shown[0] && !sums[shown[0].id].finished && sums[shown[0].id].deadline ? shown[0].id : null;
  const { open, toggle } = useOpenCards(tab);
  const { wd } = dateParts(today);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-normal text-muted">오늘 {Number(today.slice(5, 7))}월 {Number(today.slice(8))}일 ({wd})</p>
      {shown.map((c) => (
        <TaskCard key={c.id} card={c} cards={cards} tasks={groups[c.id]} summary={sums[c.id]} steps={steps} today={today}
          open={open.has(c.id)} onToggleOpen={() => toggle(c.id)} hero={c.id === heroId} />
      ))}
      {extra}
    </div>
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
