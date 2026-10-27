'use client';

import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { TaskItem, UpdateItem } from '@/lib/core/types';
import { dayRangeLabel, shortDate, todayStr, updateWhen } from '@/lib/client/format';
import { manwon, PROJECT_LABEL, VIA_LABEL } from '@/lib/plan';
import { useProgress } from '@/components/progress/ProgressProvider';
import { Badge } from '@/components/ui/Badge';
import { Card, cardRowCls } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { Meta } from '@/components/ui/Meta';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Segmented } from '@/components/ui/Segmented';
import { TYPE_COLOR } from '@/components/TimelineChart';
import type { StepRef } from '@/components/tasks/TaskComposer';
import { TaskRow } from '@/components/tasks/TaskRow';
import { useEditingSet, useStickyDone } from '@/components/tasks/useTaskList';
import { toDate, type Pin, type TimelineStep } from './step-dates';
import { dLabel, guestFinish, logWhen, summaryOf, type OwnerFilter } from './summary-data';

// 홈 「요약」 탭(보기 고르기 [요약 | 단계 | 달력]의 첫 칸). 위에서 아래로 읽으면 브리핑이 끝나는 순서의 카드:
//   로그인 = ① 남은 날 → ② 할 일 → ③ 정할 것 → ④ 지금 하는 단계 → ⑤ 최근 기록 → ⑥ 돈 (계산은 summary-data.ts)
//   로그인 전 = 첫 손님까지(오늘 시작하면 n일쯤 걸려요 · 날짜 무렵) → 처음 세 단계 → 최근 바뀐 민박업 규정 — 공개 콘텐츠만 쓴다(현황을 받지 않는다)
// 편집은 할 일 줄만 공통 줄(TaskRow) 그대로(체크 · 그 자리 고치기 · 전화 · 지우기). 나머지는 누르면 원래 자리
//   (그날 창 · 단계 창 · 우리 집 › 질문 · 기록 · 돈)로 간다. 할 일 추가는 여기서 하지 않는다(그날 창 · 단계 창에서).
// 한 할 일은 요약에 한 번만 나온다(②가 먼저, ③은 남은 결정만). 폰은 한 줄로 쌓고, PC(768px 이상)는 ①④ · ⑤⑥만 두 칸으로 짝짓는다.
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const NEXT_SHOWN = 5;
const DECIDE_SHOWN = 4;
const colorOf = (type: string) => (TYPE_COLOR as Record<string, string>)[type] ?? 'var(--type-prep)';
const withDow = (iso: string) => `${shortDate(iso)} (${DOW[toDate(iso).getDay()]})`;
/** 「12월 11일(금)」 */
const longDate = (iso: string) => { const d = toDate(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일(${DOW[d.getDay()]})`; };
/** 할 일 카드 안 묶음 이름(기한 지남 · 오늘 · 다음 7일): 13px 700, 기한 지남만 빨강 */
const groupHeadCls = 'px-4 pt-3 text-sm font-bold';
/** 줄 전체가 누르는 칸인 한 줄(링크 · 단추 공통 모양) */
const goRowCls = 'flex min-h-11 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-sunken focus-visible:-outline-offset-2';
const Chevron = () => <i className="fas fa-chevron-right shrink-0 text-xs text-muted" aria-hidden />;

export function HomeSummary(props: {
  steps: TimelineStep[]; currentId: number | null;
  /** 단계 창 열기(steps 배열의 순번) */
  onStep: (index: number) => void;
  /** 그날 창 열기(로그인 전엔 없음) */
  onDay?: (date: string) => void;
  /** 「단계 전체 보기」: 단계 탭으로 바꾼다 */
  onShowSteps: () => void;
  marks?: Pin[];
  guest: boolean;
  /** 로그인 전: 최근 바뀐 규정(공개 콘텐츠)과 주의사항 창 열기 */
  updates?: UpdateItem[];
  onNotice?: (idx: number | null) => void;
}) {
  return props.guest || !props.onDay
    ? <GuestSummary steps={props.steps} onStep={props.onStep} onShowSteps={props.onShowSteps} updates={props.updates ?? []} onNotice={props.onNotice} />
    : <MemberSummary {...props} onDay={props.onDay} />;
}

// paired: PC 에서 옆 카드와 짝인데 요약 줄이 없으면 빈 줄을 깔아 두 카드의 위 끝을 맞춘다(폰에선 높이 0)
function Block({ id, title, summary, paired = false, className = '', children }: { id: string; title: string; summary?: ReactNode; paired?: boolean; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`min-w-0 ${className}`}>
      <SectionHeader id={id} as="h3" title={title} summary={summary || (paired ? <span className="hidden md:inline" aria-hidden>{'\u00a0'}</span> : undefined)} />
      {children}
    </section>
  );
}

function MemberSummary({ steps, currentId, onStep, onDay, onShowSteps, marks = [] }: {
  steps: TimelineStep[]; currentId: number | null; onStep: (index: number) => void; onDay: (date: string) => void; onShowSteps: () => void; marks?: Pin[];
}) {
  const { doc } = useProgress();
  const uid = useId();
  const { editing, reportEdit } = useEditingSet();
  const { isDone, onToggle } = useStickyDone();
  const [today] = useState(todayStr);
  const [owner, setOwner] = useState<OwnerFilter>('');
  const [moreNext, setMoreNext] = useState(false);
  const [moreDecide, setMoreDecide] = useState(false);
  const todoRef = useRef<HTMLDivElement>(null);
  // 줄이 사라지면(지움) 「할 일」 카드로 포커스를 돌린다
  const focusTodo = useCallback(() => { window.requestAnimationFrame(() => todoRef.current?.focus()); }, []);
  if (!doc) return null;

  const s = summaryOf(steps, doc, today, { currentId, owner, marks, isDone, editing });
  const stepRefs: StepRef[] = steps.map((x) => ({ id: x.id, title: x.title }));
  const row = (t: TaskItem, late = false) => (
    <TaskRow key={t.id} t={t} steps={stepRefs} listStepId={null} showStep={late} scope="page" inset
      quietLate={late} onEditChange={reportEdit} onToggle={onToggle} onGone={focusTodo} />
  );
  const nextOpen = moreNext || s.next7.slice(NEXT_SHOWN).some((t) => editing.has(t.id));
  const decideOpen = moreDecide || s.decide.slice(DECIDE_SHOWN).some((t) => editing.has(t.id));
  const nothingSoon = s.late.length + s.today.length + s.next7.length === 0;
  const hasPins = s.pins.length > 0;
  const stepsDone = `단계 ${s.stepsDone}/${s.stepsTotal} 끝`;
  const showDecide = s.decide.length > 0 || s.questions.open > 0 || s.questions.unread > 0;

  return (
    <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-x-4">
      {/* ① 남은 날 */}
      {hasPins && (
        <Block id={`${uid}-pins`} title="남은 날" paired className="md:order-1">
          <Card as="ul">
            {s.pins.map((p) => {
              const d = dLabel(p.date, today);
              return (
                <li key={`${p.date}${p.label}`} className={cardRowCls}>
                  <button type="button" onClick={() => onDay(p.date)} className={`${goRowCls} py-2`}>
                    <span className={`w-14 shrink-0 text-lg font-bold tabular-nums ${d === '오늘' ? 'text-accent-ink' : 'text-ink'}`}>{d}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-ink">{p.label}</span>
                      <span className="block text-sm font-normal tabular-nums text-ink-soft">{withDow(p.date)}</span>
                    </span>
                    <Chevron />
                  </button>
                </li>
              );
            })}
            {s.pinsMore > 0 && <li className={`${cardRowCls} px-4 py-3 text-sm font-normal text-muted`}>그 뒤 {s.pinsMore}개</li>}
          </Card>
        </Block>
      )}

      {/* ② 할 일 */}
      <Block id={`${uid}-todo`} title="할 일" className="md:order-3 md:col-span-2"
        summary={(
          <Meta>
            <span className={s.late.length ? 'font-bold text-danger-ink' : ''}>기한 지남 {s.late.length}</span>
            <span>오늘 {s.today.length}</span>
            <span>다음 7일 {s.next7.length}</span>
          </Meta>
        )}>
        <div ref={todoRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
          <Segmented label="담당으로 걸러 보기" value={owner} onChange={setOwner}
            options={[{ value: '', label: '전체' }, { value: '남편', label: '남편' }, { value: '아내', label: '아내' }]} />
          <Card>
            {nothingSoon && <p className={`${cardRowCls} px-4 py-3 text-base text-muted`}>기한 지난 일도, 7일 안에 할 일도 없어요.</p>}
            {s.late.length > 0 && (
              <section aria-labelledby={`${uid}-late`} className={cardRowCls}>
                <h4 id={`${uid}-late`} className={`${groupHeadCls} text-danger-ink`}>기한 지남</h4>
                <ul>{s.late.map((t) => row(t, true))}</ul>
              </section>
            )}
            {/* 「오늘」은 비어도 남긴다(다른 묶음이 하나라도 있을 때) — 오늘 마감이 없다는 것도 알릴 거리 */}
            {!nothingSoon && (
              <section aria-labelledby={`${uid}-today`} className={cardRowCls}>
                <h4 id={`${uid}-today`} className={`${groupHeadCls} text-ink`}>오늘</h4>
                {s.today.length > 0
                  ? <ul>{s.today.map((t) => row(t))}</ul>
                  : <p className="px-4 pt-1 pb-3 text-base text-muted">오늘 마감인 할 일이 없어요.</p>}
              </section>
            )}
            {s.next7.length > 0 && (
              <section aria-labelledby={`${uid}-next`} className={cardRowCls}>
                <h4 id={`${uid}-next`} className={`${groupHeadCls} text-ink`}>다음 7일</h4>
                <ul>{s.next7.slice(0, NEXT_SHOWN).map((t) => row(t))}</ul>
                {s.next7.length > NEXT_SHOWN && (
                  <>
                    {nextOpen && <ul id={`${uid}-next-more`} className="border-t border-line">{s.next7.slice(NEXT_SHOWN).map((t) => row(t))}</ul>}
                    <div className="border-t border-line">
                      <FoldRow label="다음 7일 나머지" count={s.next7.length - NEXT_SHOWN} open={nextOpen} onToggle={() => setMoreNext((v) => !v)} controls={`${uid}-next-more`} />
                    </div>
                  </>
                )}
              </section>
            )}
          </Card>
        </div>
      </Block>

      {/* ③ 정할 것 */}
      {showDecide && (
        <Block id={`${uid}-decide`} title="정할 것" className="md:order-4 md:col-span-2"
          summary={(s.decide.length > 0 || s.questions.open > 0) && (
            <Meta>
              {s.decide.length > 0 && <span>결정 {s.decide.length}</span>}
              {s.questions.open > 0 && <span>답 기다림 {s.questions.open}</span>}
            </Meta>
          )}>
          <Card>
            {s.decide.length > 0 && (
              <div className={cardRowCls}>
                <ul>{s.decide.slice(0, DECIDE_SHOWN).map((t) => row(t))}</ul>
                {s.decide.length > DECIDE_SHOWN && (
                  <>
                    {decideOpen && <ul id={`${uid}-decide-more`} className="border-t border-line">{s.decide.slice(DECIDE_SHOWN).map((t) => row(t))}</ul>}
                    <div className="border-t border-line">
                      <FoldRow label="결정 나머지" count={s.decide.length - DECIDE_SHOWN} open={decideOpen} onToggle={() => setMoreDecide((v) => !v)} controls={`${uid}-decide-more`} />
                    </div>
                  </>
                )}
              </div>
            )}
            {s.questions.open > 0 && (
              <Link href="/house/questions" className={`${goRowCls} ${cardRowCls} text-base font-semibold text-ink`}>
                <span className="min-w-0 flex-1">답 기다리는 질문<span className="ml-1.5 font-normal text-muted">{s.questions.open}개</span></span>
                <Chevron />
              </Link>
            )}
            {s.questions.unread > 0 && (
              <Link href="/house/questions" className={`${goRowCls} ${cardRowCls} text-base font-semibold text-ink`}>
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  새 답<span className="font-normal text-muted">{s.questions.unread}개</span>
                  <span className="size-2 rounded-full bg-accent-ink" aria-hidden /><span className="sr-only">(새 소식)</span>
                </span>
                <Chevron />
              </Link>
            )}
          </Card>
        </Block>
      )}

      {/* ④ 지금 하는 단계 */}
      <Block id={`${uid}-steps`} title="지금 하는 단계" summary={stepsDone} className={`md:order-2 ${hasPins ? '' : 'md:col-span-2'}`}>
        <Card as="ul">
          {s.active.length === 0 && <li className={`${cardRowCls} px-4 py-3 text-base text-muted`}>모든 단계를 끝냈어요.</li>}
          {s.active.map((a) => (
            <li key={a.id} className={cardRowCls}>
              <button type="button" onClick={() => onStep(a.index)} aria-current={a.current ? 'step' : undefined} className={`${goRowCls} py-2`}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(a.type) }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 truncate text-base font-semibold text-ink">{a.id}단계 {a.title}</span>
                    {a.current && <span className="shrink-0 text-sm font-bold text-accent-ink">지금</span>}
                  </span>
                  <Meta className="text-sm font-normal text-muted">
                    {!a.current && <span>진행 중</span>}
                    {a.target && <span className="tabular-nums text-ink-soft">목표 {shortDate(a.target)}</span>}
                    {a.target && <span>{dLabel(a.target, today)}</span>}
                    <span>남은 할 일 {a.openTasks}</span>
                  </Meta>
                </span>
                <Chevron />
              </button>
            </li>
          ))}
          <li className={cardRowCls}>
            <button type="button" onClick={onShowSteps} className={`${goRowCls} text-base font-semibold text-ink-soft`}>
              <span className="min-w-0 flex-1">단계 전체 보기</span><Chevron />
            </button>
          </li>
        </Card>
      </Block>

      {/* ⑤ 최근 기록 */}
      <Block id={`${uid}-log`} title="최근 기록" paired={!!s.money && balance(s.money.cash, s.money.credit).length > 0} className={`md:order-5 ${s.money ? '' : 'md:col-span-2'}`}>
        <Card as="ul">
          {s.recentLog.length === 0 && <li className={`${cardRowCls} px-4 py-3 text-base text-muted`}>아직 기록이 없어요.</li>}
          {s.recentLog.map((l) => (
            <li key={l.id} className={cardRowCls}>
              <Link href="/house/log" className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-sunken focus-visible:-outline-offset-2">
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-base font-normal text-ink">{l.text}</span>
                  <Meta className="mt-0.5 text-sm font-normal text-muted"><span className="tabular-nums text-ink-soft">{logWhen(l.at, today)}</span><span>{l.kind}</span></Meta>
                </span>
                <span className="pt-1"><Chevron /></span>
              </Link>
            </li>
          ))}
          <li className={cardRowCls}>
            <Link href="/house/log" className={`${goRowCls} text-base font-semibold text-ink-soft`}>
              <span className="min-w-0 flex-1">기록 전체 보기</span><Chevron />
            </Link>
          </li>
        </Card>
      </Block>

      {/* ⑥ 돈 */}
      {s.money && (
        <Block id={`${uid}-money`} title="돈" className="md:order-6"
          summary={balance(s.money.cash, s.money.credit).length > 0 && (
            <Meta>{balance(s.money.cash, s.money.credit).map((p, k) => <span key={k}>{k === 0 ? `지금 ${p}` : p}</span>)}</Meta>
          )}>
          <Card as="ul">
            {s.money.next.length === 0 && <li className={`${cardRowCls} px-4 py-3 text-base text-muted`}>다가오는 돈 흐름이 없어요.</li>}
            {s.money.next.map(({ item, cash, credit }) => {
              const out = item.amount !== null && item.amount < 0;
              const sub = [item.project === 'jisan' ? PROJECT_LABEL.jisan : '', ...balance(cash, credit).map((p, k) => (k === 0 ? `그 뒤 ${p}` : p))].filter(Boolean);
              return (
                <li key={item.id} className={`${cardRowCls} px-4 py-3`}>
                  <div className="flex items-start gap-3">
                    <span className="w-12 shrink-0 pt-0.5 text-sm tabular-nums text-ink-soft">{item.date ? shortDate(item.date) : '미정'}</span>
                    <span className="min-w-0 flex-1 text-base font-semibold text-ink">
                      {item.text}
                      {item.estimate && <span className="ml-1.5 inline-block align-middle"><Badge>추정</Badge></span>}
                    </span>
                    <span className="shrink-0 text-right">
                      {item.amount === null
                        ? <span className="block pt-0.5 text-sm text-muted">금액 미정</span>
                        : <span className={`block text-base font-bold tabular-nums ${out ? 'text-ink' : 'text-plus'}`}>{out ? '−' : '+'}{manwon(item.amount)}</span>}
                      <span className="block text-xs text-muted">{VIA_LABEL[item.via]}</span>
                    </span>
                  </div>
                  {sub.length > 0 && <Meta className="mt-0.5 pl-15 text-sm font-normal text-muted">{sub.map((x, k) => <span key={k}>{x}</span>)}</Meta>}
                </li>
              );
            })}
            <li className={cardRowCls}>
              <Link href="/money" className={`${goRowCls} text-base font-semibold text-ink-soft`}>
                <span className="min-w-0 flex-1">돈 흐름 전체 보기</span><Chevron />
              </Link>
            </li>
          </Card>
        </Block>
      )}
    </div>
  );
}

// 남은 돈 항목(현금 · 마이너스 통장 여유) — 돈 화면(MoneyApp)과 같은 글
function balance(cash: number | null, credit: number | null): string[] {
  const parts: string[] = [];
  if (cash !== null) parts.push(`현금 ${cash < 0 ? '−' : ''}${manwon(cash)}`);
  if (credit !== null) parts.push(`마이너스 통장 여유 ${credit < 0 ? '−' : ''}${manwon(credit)}`);
  return parts;
}

// 로그인 전: 공개 콘텐츠(단계 이름 · 공개 일정 날수 · 바뀐 규정)만 쓴다. 현황(할 일 · 기록 · 돈 · 고정 일정)은 받지도 않는다.
function GuestSummary({ steps, onStep, onShowSteps, updates, onNotice }: {
  steps: TimelineStep[]; onStep: (index: number) => void; onShowSteps: () => void; updates: UpdateItem[]; onNotice?: (idx: number | null) => void;
}) {
  const uid = useId();
  const [today] = useState(todayStr);
  const finish = guestFinish(steps, today);
  const firstSteps = steps.slice(0, 3);
  const recent = updates.map((u, idx) => ({ u, idx })).sort((a, b) => b.u.date.localeCompare(a.u.date) || a.idx - b.idx).slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      {/* 맨 위 구역 요약 문장(「오늘 시작하면 … 첫 손님을 받아요」)은 요약 탭에서 숨기고 이 카드 하나로 말한다 */}
      <Block id={`${uid}-finish`} title="첫 손님까지">
        <Card>
          <p className="px-4 py-3 text-lg font-bold tabular-nums text-ink">오늘 시작하면 {finish.days}일쯤 걸려요 · <span className="whitespace-nowrap">{longDate(finish.date)} 무렵</span></p>
        </Card>
      </Block>

      <Block id={`${uid}-first`} title="처음 세 단계">
        <Card as="ul">
          {firstSteps.map((st, i) => (
            <li key={st.id} className={cardRowCls}>
              <button type="button" onClick={() => onStep(i)} className={`${goRowCls} py-2`}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(st.type) }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-ink">{st.id}단계 {st.title}</span>
                  <span className="block text-sm font-normal tabular-nums text-muted">{dayRangeLabel(st.start, st.end)}</span>
                </span>
                <Chevron />
              </button>
            </li>
          ))}
          <li className={cardRowCls}>
            <button type="button" onClick={onShowSteps} className={`${goRowCls} text-base font-semibold text-ink-soft`}>
              <span className="min-w-0 flex-1">단계 전체 보기</span><Chevron />
            </button>
          </li>
        </Card>
      </Block>

      {recent.length > 0 && onNotice && (
        <Block id={`${uid}-rules`} title="최근 바뀐 민박업 규정">
          <Card as="ul">
            {recent.map(({ u, idx }) => (
              <li key={idx} className={cardRowCls}>
                <button type="button" onClick={() => onNotice(idx)} className={`${goRowCls} py-2`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-ink">{u.title}</span>
                    <span className="block text-sm font-normal tabular-nums text-ink-soft">{updateWhen(u.date, u.dateWord)}</span>
                  </span>
                  <Chevron />
                </button>
              </li>
            ))}
          </Card>
        </Block>
      )}
    </div>
  );
}
