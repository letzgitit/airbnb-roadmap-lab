'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { devHeaders, useProgress } from '@/components/progress/ProgressProvider';
import { textBtn } from '@/components/progress/bits';
import { Badge } from '@/components/ui/Badge';
import { Card, cardRowCls } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { KeepText } from '@/components/ui/KeepText';
import { Meta } from '@/components/ui/Meta';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { todayStr } from '@/lib/client/format';
import { longDate } from '@/components/tasks/task-view';
import { PROJECT_LABEL, VIA_LABEL, manwon, moneyRows, splitMark, type PlanItem, type PlanPayload } from '@/lib/plan';
import { revealRow, useJump } from '@/components/search/jump';

// 「자금 계획」(메뉴 「자금」, 2026-10-28 전 이름 「돈 · 다른 집」): 돈 흐름 · 지산 · 원주 할 일 · 원주 갈림길. 로그인 확인은 LoginGate(페이지)가 하고,
// 여기선 로그인이 끝난 뒤에만 /api/plan 을 부른다. 외도민 할 일은 홈 「할 일」에 있다.

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: PlanPayload; today: string };

// 날짜는 어디서나 「10월 29일(목)」 꼴(longDate)
// 남은 돈 항목들(현금 · 마이너스 통장 여유). 화면에서는 점 없이 span 마다 12px 간격으로 나눠 보인다.
function balanceParts(cash: number | null, credit: number | null) {
  const parts: string[] = [];
  if (cash !== null) parts.push(`현금 ${cash < 0 ? '−' : ''}${manwon(cash)}`);
  if (credit !== null) parts.push(`마이너스 통장 여유 ${credit < 0 ? '−' : ''}${manwon(credit)}`);
  return parts;
}

export function MoneyApp() {
  const { status, doc } = useProgress();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reload, setReload] = useState(0);
  const docVersion = doc?.version;

  // 진행 현황 문서가 바뀌면(다른 화면 · 다른 사람이 돈 흐름을 고침) 다시 받는다. 받는 동안은 앞의 화면을 그대로 둔다.
  useEffect(() => {
    if (status !== 'ready') return;
    let alive = true;
    fetch('/api/plan', { cache: 'no-store', headers: devHeaders() })
      .then(async (r) => {
        if (!alive) return;
        if (!r.ok) return setState((s) => (s.kind === 'ready' ? s : { kind: 'error' }));
        const data = (await r.json()) as PlanPayload;
        if (alive) setState({ kind: 'ready', data, today: todayStr() });
      })
      .catch(() => alive && setState((s) => (s.kind === 'ready' ? s : { kind: 'error' })));
    return () => { alive = false; };
  }, [status, docVersion, reload]);
  // 검색 결과에서 고른 자금 줄: 「돈 흐름」을 받아 그린 뒤 그 줄로 내려가 잠깐 칠한다(받기 전이면 그린 뒤에)
  const [target, setTarget] = useState<string | null>(null);
  useJump('money', (j) => setTarget(j.id));
  const ready = state.kind === 'ready';
  useEffect(() => {
    if (!target || !ready) return;
    revealRow(`money-${target}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 한 번 갔으면 잊는다
    setTarget(null);
  }, [target, ready]);

  return (
    <>
      <PageHeader title="자금 계획" />
      {state.kind === 'loading' && <p className="py-4 text-base text-muted" role="status">불러오는 중…</p>}
      {state.kind === 'error' && (
        <p className="flex flex-wrap items-center gap-x-3 py-2 text-base text-ink-soft">
          불러오지 못했어요.
          <button type="button" className={textBtn} onClick={() => { setState({ kind: 'loading' }); setReload((n) => n + 1); }}>다시 불러오기</button>
        </p>
      )}
      {state.kind === 'ready' && (
        <div className="flex flex-col gap-6">
          <MoneySection data={state.data} />
          <JisanSection data={state.data} today={state.today} onReload={() => setReload((n) => n + 1)} />
          <ForkSection fork={state.data.plan?.fork ?? ''} />
        </div>
      )}
    </>
  );
}

function MoneySection({ data }: { data: PlanPayload }) {
  const rows = useMemo(() => moneyRows(data.money, data.plan), [data.money, data.plan]);
  const now = data.plan ? balanceParts(data.plan.cash, data.plan.credit) : [];
  return (
    <section aria-labelledby="money-flow">
      <SectionHeader id="money-flow" title="돈 흐름"
        summary={now.length ? <Meta>{now.map((p, k) => <span key={k}>{k === 0 ? `지금 ${p}` : p}</span>)}</Meta> : undefined} />
      <Card>
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-base text-muted">돈 흐름이 아직 없어요.</p>
        ) : (
          <ul>
            {rows.map(({ item, cash, credit }, i) => {
              const out = item.amount !== null && item.amount < 0;
              // 「마이너스 통장 여유」는 값이 바뀐 줄에서만(바로 앞 줄 — 첫 줄은 지금 값 — 과 다를 때)
              const prevCredit = i === 0 ? (data.plan?.credit ?? null) : rows[i - 1].credit;
              const after = balanceParts(cash, credit !== prevCredit ? credit : null).map((p, k) => (k === 0 ? `그 뒤 ${p}` : p));
              const sub = [item.project === 'jisan' ? PROJECT_LABEL.jisan : '', ...after].filter(Boolean);
              return (
                <li key={item.id} id={`money-${item.id}`} className={`px-5 py-4 ${cardRowCls}`}>
                  {/* 날짜는 「10월 29일(목)」 꼴로 제목 위에, 「추정」 배지는 늘 금액 옆 */}
                  <p className="text-sm text-muted">{item.date ? longDate(item.date) : '날짜 미정'}</p>
                  <div className="mt-0.5 flex items-start gap-3">
                    <span className="min-w-0 flex-1 text-base font-semibold text-ink">{item.text}</span>
                    <span className="shrink-0 text-right">
                      <span className="flex items-center justify-end gap-1.5">
                        {item.estimate && <Badge className="py-0.5">추정</Badge>}
                        {item.amount === null ? (
                          <span className="text-base text-muted">금액 미정</span>
                        ) : (
                          <span className={`text-base font-bold tabular-nums ${out ? 'text-ink' : 'text-plus'}`}>
                            {out ? '−' : '+'}{manwon(item.amount)}
                          </span>
                        )}
                      </span>
                      <span className="block text-sm text-muted">{VIA_LABEL[item.via]}</span>
                    </span>
                  </div>
                  {sub.length > 0 && <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">{sub.map((s, k) => <span key={k}>{s}</span>)}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}

function JisanSection({ data, today, onReload }: { data: PlanPayload; today: string; onReload: () => void }) {
  const [showPast, setShowPast] = useState(false);
  const items = useMemo(
    () => data.items.filter((i) => i.src === 'jisan').sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id)),
    [data.items],
  );
  const open = items.filter((i) => !i.done);
  const late = open.filter((i) => i.due < today).length;
  const pastDone = items.filter((i) => i.done && i.due < today);
  const rest = items.filter((i) => !(i.done && i.due < today));

  const summary = data.jisan === 'ok' && items.length > 0 ? (
    <Meta>
      <span>남은 {open.length}개</span>
      {late > 0 && <span className="font-bold text-danger-ink">기한 지남 {late}</span>}
    </Meta>
  ) : undefined;

  return (
    <section aria-labelledby="money-jisan">
      <SectionHeader id="money-jisan" title="지산 · 원주 할 일" summary={summary} />
      {data.jisan !== 'ok' ? (
        // 오류 줄 = 한 문장 + 「다시 불러오기」(DESIGN.md 8.2). 다시 받는 동안 위 돈 흐름은 그대로 둔다.
        <p className="flex flex-wrap items-center gap-x-3 text-base text-ink-soft">
          지산 · 원주 일정을 불러오지 못했어요.
          <button type="button" className={textBtn} onClick={onReload}>다시 불러오기</button>
        </p>
      ) : (
        <Card>
          {items.length === 0 ? (
            <p className="px-4 py-3 text-base text-muted">지산 · 원주 일정이 없어요.</p>
          ) : (
            // 「완료 n」은 다른 할 일 목록(단계 블록 · 단계 창)처럼 안 끝난 일 밑, 펼치면 그 밑에 지난 끝낸 일
            <>
              <Timeline id="money-jisan-list" className={cardRowCls} items={rest} today={today} />
              {pastDone.length > 0 && (
                <div className={cardRowCls}>
                  <FoldRow label="완료" count={pastDone.length} unit="" open={showPast} onToggle={() => setShowPast((v) => !v)} controls="money-jisan-done" />
                </div>
              )}
              {showPast && pastDone.length > 0 && <Timeline id="money-jisan-done" className={cardRowCls} items={pastDone} today={today} noToday />}
            </>
          )}
        </Card>
      )}
    </section>
  );
}

// 한 줄 흐름: 달마다 묶고, 오늘 자리에 강조색 선. 끝낸 일은 흐리게 줄긋기.
function Timeline({ id, className, items, today, noToday = false }: { id: string; className?: string; items: PlanItem[]; today: string; noToday?: boolean }) {
  // noToday = 「완료 n」 밑 지난 끝낸 일(오늘 줄 없이 달 머리 · 줄만)
  const todayAt = noToday ? -2 : items.findIndex((i) => i.due >= today);
  const todayMonth = today.slice(0, 7);
  const out: ReactNode[] = [];
  const todayLine = (
    <li key="today" className={`flex items-center gap-2 px-4 py-2 ${cardRowCls}`} aria-label={`오늘 ${longDate(today)}`}>
      <span className="text-sm font-semibold text-ink">오늘 {longDate(today)}</span>
      <span className="h-0.5 flex-1 rounded-full bg-accent" aria-hidden />
    </li>
  );
  const monthRow = (m: string) => (
    <li key={`m-${m}`} className={`bg-sunken px-4 py-2 text-sm font-bold text-ink-soft ${cardRowCls}`}>{Number(m.slice(5))}월</li>
  );
  let month = '';
  items.forEach((it, k) => {
    const m = it.due.slice(0, 7);
    const newMonth = m !== month;
    month = m;
    if (k === todayAt) {
      // 오늘이 새 달 머리 앞에 오는지 뒤에 오는지: 오늘이 그 달 안이면 달 이름 다음, 아니면(앞 달) 달 이름 앞
      if (newMonth && m === todayMonth) { out.push(monthRow(m)); out.push(todayLine); }
      else { out.push(todayLine); if (newMonth) out.push(monthRow(m)); }
    } else if (newMonth) {
      out.push(monthRow(m));
    }
    const t = splitMark(it.text);
    const isLate = !it.done && it.due < today;
    out.push(
      <li key={`${it.src}-${it.id}`} className={`flex items-start gap-3 px-4 py-3 ${cardRowCls}`}>
        <span className={`w-25 shrink-0 whitespace-nowrap pt-0.5 text-sm tabular-nums ${isLate ? 'font-semibold text-danger-ink' : 'text-muted'}`}>
          {longDate(it.due)}
        </span>
        <span className={`min-w-0 flex-1 break-keep text-base [overflow-wrap:anywhere] ${it.done ? 'text-muted line-through' : 'font-semibold text-ink'}`}>
          {it.done && <span className="sr-only">끝남 </span>}
          {isLate && <span className="sr-only">기한 지남 </span>}
          <KeepText text={t.text} />
          {t.mark && <span className="ml-1.5 inline-block align-middle"><Badge>{t.mark}</Badge></span>}
        </span>
      </li>,
    );
  });
  if (todayAt === -1) out.push(todayLine);
  return <ul id={id} className={className}>{out}</ul>;
}

function ForkSection({ fork }: { fork: string }) {
  const lines = fork.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <section aria-labelledby="money-fork">
      <SectionHeader id="money-fork" title="원주 집, 경우별 할 일" />
      <Card>
        <ul>
          {lines.map((line, k) => {
            const [cond, ...rest] = line.split('→');
            return (
              <li key={k} className={`px-4 py-3 ${cardRowCls}`}>
                {rest.length ? (
                  <>
                    <p className="text-base font-bold text-ink">{cond.trim()}</p>
                    <p className="mt-0.5 text-base text-ink-soft"><span className="text-faint" aria-hidden>→ </span>{rest.join('→').trim()}</p>
                  </>
                ) : <p className="text-base font-semibold text-ink">{line}</p>}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
