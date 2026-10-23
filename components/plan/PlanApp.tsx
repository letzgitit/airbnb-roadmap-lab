'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { signIn, signOut } from 'next-auth/react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { devHeaders } from '@/components/progress/ProgressProvider';
import { dueLabel, todayStr } from '@/lib/client/format';
import type { PlanProject } from '@/lib/core/types';
import {
  PLAN_FROM, PLAN_TO, PROJECT_LABEL, VIA_LABEL, manwon, moneyRows, nextItem, splitMark,
  type PlanItem, type PlanPayload,
} from '@/lib/plan';

type State =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'forbidden' }
  | { kind: 'error' }
  | { kind: 'ready'; data: PlanPayload; today: string };

const DOT: Record<PlanProject, string> = { oedomin: 'bg-blue-500', jisan: 'bg-emerald-500' };
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

function md(iso: string) {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}
function week(iso: string) {
  return WEEK[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

export function PlanApp({ loginReady }: { loginReady: boolean }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    fetch('/api/plan', { cache: 'no-store', headers: devHeaders() })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 401) return setState({ kind: 'anon' });
        if (r.status === 403) return setState({ kind: 'forbidden' });
        if (!r.ok) return setState({ kind: 'error' });
        setState({ kind: 'ready', data: (await r.json()) as PlanPayload, today: todayStr() });
      })
      .catch(() => alive && setState({ kind: 'error' }));
    return () => { alive = false; };
  }, []);

  return (
    <div className="app-container">
      <header className="border-b border-slate-200 bg-white">
        <div className="px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="min-w-0 text-2xl font-bold leading-tight text-slate-900">11월~1월 일정</h1>
            <ThemeToggle />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3">
            <Link href="/" className="-ml-1 inline-flex min-h-9 items-center gap-1.5 px-1 text-[13px] font-semibold text-slate-600 hover:underline">
              <i className="fas fa-chevron-left text-[12px]" aria-hidden />외도민 타임 라인
            </Link>
            {state.kind === 'ready' && (
              <button type="button" onClick={() => void signOut({ redirect: true, callbackUrl: '/plan' })}
                className="-mr-2 inline-flex min-h-9 items-center px-2 text-[13px] font-semibold text-slate-600 hover:underline">로그아웃</button>
            )}
          </div>
        </div>
      </header>

      <main className="chart-wrapper mx-auto w-full max-w-[720px] gap-4">
        {state.kind === 'loading' && <p className="px-1 text-[15px] text-slate-500">불러오는 중…</p>}
        {state.kind === 'error' && <p className="px-1 text-[15px] text-slate-600">불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>}
        {state.kind === 'forbidden' && (
          <Card>
            <p className="text-[15px] font-semibold text-slate-800">허용되지 않은 계정이에요.</p>
            <button type="button" onClick={() => void signOut({ callbackUrl: '/plan' })} className="mt-2 inline-flex min-h-11 items-center text-[15px] font-bold text-blue-700 underline underline-offset-4 dark:text-blue-300">로그아웃</button>
          </Card>
        )}
        {state.kind === 'anon' && (
          <Card>
            <p className="text-[15px] font-semibold text-slate-800">로그인한 사람만 볼 수 있어요.</p>
            {loginReady ? (
              <button type="button" onClick={() => void signIn('google', { callbackUrl: '/plan' })}
                className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-4 text-[15px] font-bold text-snow hover:bg-blue-700">구글로 로그인</button>
            ) : <p className="mt-2 text-[13px] text-slate-500">로그인 준비 중</p>}
          </Card>
        )}
        {state.kind === 'ready' && <Ready data={state.data} today={state.today} />}
      </main>
    </div>
  );
}

function Ready({ data, today }: { data: PlanPayload; today: string }) {
  const items = useMemo(
    () => data.items.filter((i) => i.due >= PLAN_FROM && i.due <= PLAN_TO).sort((a, b) => a.due.localeCompare(b.due) || a.src.localeCompare(b.src)),
    [data.items],
  );
  const { next, late } = useMemo(() => nextItem(data.items, today), [data.items, today]);
  const rows = useMemo(() => moneyRows(data.money, data.plan), [data.money, data.plan]);
  const fork = (data.plan?.fork ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

  return (
    <>
      <Hero next={next} late={late} today={today} />

      <section aria-labelledby="plan-timeline">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
          <h2 id="plan-timeline" className="text-[17px] font-bold text-slate-900">일정</h2>
          <ul className="flex gap-x-4 text-[13px] font-semibold text-slate-700" aria-label="색 설명">
            {(['oedomin', 'jisan'] as const).map((p) => (
              <li key={p} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${DOT[p]}`} aria-hidden />{PROJECT_LABEL[p]}</li>
            ))}
          </ul>
        </div>
        <Card pad={false}>
          <Timeline items={items} today={today} />
        </Card>
        {data.jisan !== 'ok' && <p className="mt-2 px-1 text-[13px] text-slate-500">지산 · 원주 일정은 불러오지 못했어요.</p>}
      </section>

      {rows.length > 0 && (
        <section aria-labelledby="plan-money">
          <h2 id="plan-money" className="mb-2 px-1 text-[17px] font-bold text-slate-900">돈 흐름</h2>
          <Card pad={false}>
            {data.plan && (data.plan.cash !== null || data.plan.credit !== null) && (
              <p className="border-b border-slate-100 px-4 py-3 text-[13px] font-semibold text-slate-600">
                지금 {balanceText(data.plan.cash, data.plan.credit)}
              </p>
            )}
            <ul>
              {rows.map(({ item, cash, credit }) => {
                const out = item.amount !== null && item.amount < 0;
                return (
                  <li key={item.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
                    <div className="flex items-start gap-3">
                      <span className="w-12 shrink-0 pt-px text-[13px] font-bold text-slate-500">{item.date ? md(item.date) : '미정'}</span>
                      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[item.project]}`} aria-label={PROJECT_LABEL[item.project]} />
                      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-slate-800">
                        {item.text}{item.estimate && <Mark>추정</Mark>}
                      </span>
                      <span className={`shrink-0 text-right text-[15px] font-bold tabular-nums ${out ? 'text-slate-900' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {item.amount === null ? <span className="text-[13px] text-slate-500">금액 미정</span> : `${out ? '−' : '+'}${manwon(item.amount)}`}
                        <span className="block text-[12px] font-semibold text-slate-500">{VIA_LABEL[item.via]}</span>
                      </span>
                    </div>
                    <p className="mt-0.5 pl-[84px] text-[13px] font-semibold text-slate-500">그 뒤 {balanceText(cash, credit)}</p>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      {fork.length > 0 && (
        <section aria-labelledby="plan-fork">
          <h2 id="plan-fork" className="mb-2 px-1 text-[17px] font-bold text-slate-900">원주 갈림길</h2>
          <Card pad={false}>
            <ul>
              {fork.map((line, k) => {
                const [cond, ...rest] = line.split('→');
                return (
                  <li key={k} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
                    {rest.length ? (
                      <>
                        <p className="text-[15px] font-bold leading-snug text-slate-900">{cond.trim()}</p>
                        <p className="mt-0.5 text-[15px] font-semibold leading-snug text-slate-700"><span className="text-slate-400" aria-hidden>→ </span>{rest.join('→').trim()}</p>
                      </>
                    ) : <p className="text-[15px] font-semibold leading-snug text-slate-800">{line}</p>}
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}
    </>
  );
}

function balanceText(cash: number | null, credit: number | null) {
  const parts: string[] = [];
  if (cash !== null) parts.push(`현금 ${cash < 0 ? '−' : ''}${manwon(cash)}`);
  if (credit !== null) parts.push(`마통 여유 ${credit < 0 ? '−' : ''}${manwon(credit)}`);
  return parts.join(' · ');
}

function Hero({ next, late, today }: { next: PlanItem | null; late: number; today: string }) {
  const due = next ? dueLabel(next.due, today) : null;
  const t = next ? splitMark(next.text) : null;
  return (
    <section aria-labelledby="plan-next" className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-[13px] font-bold text-slate-500">오늘 {md(today)} ({week(today)})</p>
      <h2 id="plan-next" className="sr-only">다음 할 일</h2>
      {next && t && due ? (
        <>
          <p className="mt-1 text-[22px] font-bold leading-snug text-slate-900">{t.text}{t.mark && <Mark>{t.mark}</Mark>}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[15px] font-semibold text-slate-600">
            <span>{due.date} ({week(next.due)})</span>
            <span className={due.late ? 'text-red-600 dark:text-red-400' : 'text-blue-700 dark:text-blue-300'}>{due.rel}</span>
            <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${DOT[next.src]}`} aria-hidden />{PROJECT_LABEL[next.src]}</span>
          </p>
        </>
      ) : <p className="mt-1 text-[22px] font-bold text-slate-900">남은 할 일이 없어요</p>}
      {late > 0 && <p className="mt-2 text-[13px] font-bold text-red-600 dark:text-red-400">날짜 지났는데 안 끝난 일 {late}개</p>}
    </section>
  );
}

// 한 줄 흐름: 달마다 묶고, 오늘 자리에 파란 줄. 끝난 일은 흐리게.
function Timeline({ items, today }: { items: PlanItem[]; today: string }) {
  if (items.length === 0) return <p className="px-4 py-4 text-[15px] text-slate-500">날짜 있는 할 일이 아직 없어요.</p>;
  const todayAt = items.findIndex((i) => i.due >= today);
  const out: ReactNode[] = [];
  let month = '';
  const todayLine = (
    <li key="today" className="flex items-center gap-2 px-4 py-1.5" aria-label="오늘">
      <span className="text-[12px] font-bold text-blue-700 dark:text-blue-300">오늘 {md(today)}</span>
      <span className="h-[2px] flex-1 rounded-full bg-blue-500" aria-hidden />
    </li>
  );
  items.forEach((it, k) => {
    const m = it.due.slice(0, 7);
    if (m !== month) {
      month = m;
      out.push(<li key={`m-${m}`} className="bg-slate-50 px-4 py-1.5 text-[13px] font-bold text-slate-600">{Number(m.slice(5))}월</li>);
    }
    if (k === todayAt) out.push(todayLine);
    const t = splitMark(it.text);
    out.push(
      <li key={`${it.src}-${it.id}`} className={`flex items-start gap-3 border-b border-slate-100 px-4 py-2.5 ${it.done ? 'opacity-45' : ''}`}>
        <span className="w-12 shrink-0 pt-px text-[13px] font-bold text-slate-500">{md(it.due)} <span className="font-semibold">{week(it.due)}</span></span>
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[it.src]}`} aria-label={PROJECT_LABEL[it.src]} />
        <span className={`min-w-0 flex-1 text-[15px] font-semibold leading-snug text-slate-800 ${it.done ? 'line-through' : ''}`}>
          {it.done && <span className="sr-only">끝남 </span>}{t.text}{t.mark && <Mark>{t.mark}</Mark>}
        </span>
      </li>,
    );
  });
  if (todayAt === -1) out.push(todayLine);
  return <ul>{out}</ul>;
}

function Mark({ children }: { children: ReactNode }) {
  return <span className="ml-1.5 inline-block whitespace-nowrap rounded-md border border-slate-200 bg-slate-100 px-1.5 py-px align-[2px] text-[12px] font-bold text-slate-600">{children}</span>;
}

function Card({ children, pad = true }: { children: ReactNode; pad?: boolean }) {
  return <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-white ${pad ? 'px-4 py-4' : ''}`}>{children}</div>;
}
