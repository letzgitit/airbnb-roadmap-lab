'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Step } from '@/lib/core/types';
import { dayLabel } from '@/lib/client/format';
import { SECTION_ORDER, TAB_LABEL, sectionCount, type StepSection, type StepTab } from '@/lib/client/step-sections';
import { Sheet } from './Sheet';
import { TabBar, panelDomId, tabDomId, type TabItem } from './TabBar';
import { WarningList } from './WarningList';
import { StepInfo, StepTasks } from './progress/StepPanel';
import { useProgress } from './progress/ProgressProvider';
import { leadCls, rowCls } from './progress/bits';

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);
const sectionTitle = 'mb-1 text-[15px] font-bold text-slate-700';
const row = 'border-b border-slate-200 py-4 last:border-b-0';

// 단계 창: 탭 5개(챙길 것 · 주의 · 기준 · 필살기 · 사례). 한 열로만 보이고, 항목마다 따로 여는 상세 화면은 없다.
export function StepModal({ steps, index, section, open, shown, loggedIn, onClose, beforeClose, onGo }: {
  steps: Step[]; index: number; section: StepSection | null; open: boolean; shown: boolean; loggedIn: boolean;
  onClose: () => void; beforeClose: () => Promise<boolean>; onGo: (i: number) => void;
}) {
  const step = steps[index];
  const uid = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<StepTab>('todo');

  // 열 때·단계를 바꿀 때는 「챙길 것」부터. 검색에서 갈래를 달고 왔으면 그 탭을 바로 연다.
  const resetKey = `${open ? 1 : 0}|${index}|${section ?? ''}`;
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setTab(open && step && section && sectionCount(step, section) > 0 ? section : 'todo');
  }

  // 개수가 0 인 탭은 숨긴다
  const items: TabItem[] = [{ id: 'todo', label: TAB_LABEL.todo }];
  if (step) {
    SECTION_ORDER.forEach((k) => {
      const n = sectionCount(step, k);
      if (n > 0) items.push({ id: k, label: TAB_LABEL[k], count: n, tone: k === 'warnings' ? 'danger' : undefined });
    });
  }
  const cur: StepTab = items.some((t) => t.id === tab) ? tab : 'todo';

  // 탭을 바꾸거나 단계를 옮기면 본문을 맨 위로
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [cur, index]);

  if (!step) return null;
  const stepRefs = steps.map((s) => ({ id: s.id, title: s.title }));

  // 이전/다음 단계: 저장 안 한 편집이 있으면 확인 뒤에 옮긴다
  const go = async (i: number) => {
    if (!(await beforeClose())) return;
    onGo(i);
  };

  return (
    <Sheet open={open} shown={shown} onClose={onClose} beforeClose={beforeClose} bodyRef={bodyRef}
      eyebrow={<>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-bold text-slate-700">{step.id}단계</span>
        <span className="text-[12px] font-bold text-slate-500">{dayLabel(step.day)}</span>
      </>}
      title={step.title}
      tabs={<TabBar items={items} value={cur} onChange={(id) => setTab(id as StepTab)} label="단계 내용" idPrefix={uid} />}
      footer={
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button type="button" onClick={() => void go(index - 1)} style={{ visibility: index === 0 ? 'hidden' : 'visible' }}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-100 px-4 text-[15px] font-bold text-slate-700 transition-colors hover:bg-slate-200"><i className="fas fa-chevron-left" aria-hidden />이전 단계</button>
          <button type="button" onClick={() => void go(index + 1)} style={{ visibility: index === steps.length - 1 ? 'hidden' : 'visible' }}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-[15px] font-bold text-white transition-colors hover:bg-blue-700">다음 단계<i className="fas fa-chevron-right" aria-hidden /></button>
        </div>
      }>
      {/* 「챙길 것」은 다른 탭으로 옮겨도 그대로 둔다(안 보이게만): 쓰던 메모·할 일 입력과 저장 안 한 편집 보호가 끊기지 않게 */}
      <div role="tabpanel" id={panelDomId(uid, 'todo')} aria-labelledby={tabDomId(uid, 'todo')} hidden={cur !== 'todo'} className="flex flex-col gap-6 p-5">
        {step.summary && <div className="rounded-2xl bg-slate-50 px-4 py-3.5 text-[15px] leading-relaxed text-slate-800">{step.summary}</div>}
        {/* 위에서부터: 요약 → 우리 할 일 → 가이드 체크리스트 → 단계 정보(접힘) */}
        {loggedIn && <StepTasks key={`t${step.id}`} stepId={step.id} steps={stepRefs} />}
        {step.checklist.length > 0 && (
          <section aria-label="가이드 체크리스트">
            <h3 className={sectionTitle}>가이드 체크리스트</h3>
            {loggedIn && <p className="mb-1 text-[13px] leading-snug text-slate-500">필요한 건 ＋를 눌러 우리 할 일에 넣으세요.</p>}
            <ul>{step.checklist.map((c, i) => <ChecklistRow key={i} text={c} stepId={step.id} loggedIn={loggedIn} />)}</ul>
          </section>
        )}
        {loggedIn && <StepInfo key={`i${step.id}`} stepId={step.id} />}
      </div>
      {cur !== 'todo' && (
        <div role="tabpanel" id={panelDomId(uid, cur)} aria-labelledby={tabDomId(uid, cur)} className="px-5 pb-6 pt-1">
          <SectionList step={step} k={cur} />
        </div>
      )}
    </Sheet>
  );
}

// 고른 탭의 전체 목록(상자 없이 1px 선으로만 나눈다)
function SectionList({ step, k }: { step: Step; k: StepSection }) {
  if (k === 'warnings') return <WarningList items={step.warnings} />;
  if (k === 'official') {
    return (
      <ul>
        {step.official.map((o, i) => {
          const url = safeUrl(o.url);
          return (
            <li key={i} className={row}>
              <p className="text-[15px] font-semibold leading-relaxed text-slate-900">{o.text}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] font-semibold text-slate-600">
                {o.region && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-bold text-slate-700">{o.region}</span>}
                {o.checked && <span>확인일 {o.checked}</span>}
                {url
                  ? <a href={url} target="_blank" rel="noopener noreferrer" className="[overflow-wrap:anywhere] font-bold text-blue-700 underline underline-offset-2">{o.source || o.url}<i className="fas fa-arrow-up-right-from-square ml-1 text-[12px]" aria-hidden /></a>
                  : o.source && <span>출처 {o.source}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }
  if (k === 'tips') {
    return (
      <>
        <p className="pt-3 text-[13px] text-slate-500">대부분 현장 경험에서 나온 요령이에요.</p>
        <ul>
          {step.tips.map((t, i) => (
            <li key={i} className={row}>
              <p className="text-[15px] font-normal leading-relaxed text-slate-800">{t.text}</p>
              {t.from && t.from !== '현장 경험' && <p className="mt-1.5 text-[13px] font-semibold text-slate-500">출처: {t.from}</p>}
            </li>
          ))}
        </ul>
      </>
    );
  }
  return (
    <ul>
      {step.community.map((c, i) => {
        const chip = c.kind && c.kind !== '사례' ? c.kind : '';
        return (
          <li key={i} className={row}>
            {(chip || c.date) && (
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-500">
                {chip && <span className={`rounded-md px-2 py-0.5 text-[12px] font-bold ${chip === '주의' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}>{chip}</span>}
                {c.date && <span>{c.date}</span>}
              </div>
            )}
            <p className="text-[15px] font-normal leading-relaxed text-slate-800">{c.text}</p>
          </li>
        );
      })}
    </ul>
  );
}

// 가이드 체크리스트 한 줄. 로그인 전: 누를 수 없는 목록(앞 조작 없음). 로그인 후: 앞 44px 「＋」 한 가지 동작,
// 이미 우리 할 일에 있으면 초록 체크 + 옅은 글자(누를 수 없음). 줄 끝 단추는 없다.
function ChecklistRow({ text, stepId, loggedIn }: { text: string; stepId: number; loggedIn: boolean }) {
  const { doc, send, toast } = useProgress();
  const [busy, setBusy] = useState(false);
  const taskText = text.trim().slice(0, 200);
  const added = loggedIn && !!doc && Object.values(doc.tasks).some((t) => !t.deletedAt && t.stepId === stepId && t.text.trim() === taskText);
  if (!loggedIn) {
    return <li className="border-b border-slate-100 py-3 text-[15px] font-semibold leading-snug text-slate-800 last:border-b-0">{text}</li>;
  }
  return (
    <li className={rowCls}>
      {added ? (
        <span className={`${leadCls} text-emerald-600`} role="img" aria-label="이미 우리 할 일에 있어요"><i className="fas fa-check" aria-hidden /></span>
      ) : (
        <button type="button" disabled={busy} aria-label={`${text} 할 일에 추가`} className={`${leadCls} rounded-xl text-blue-700 hover:bg-slate-50 disabled:opacity-40`}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await send({ op: 'task.add', stepId, text: taskText });
              if (r.ok) toast('우리 할 일에 넣었어요.');
            } finally { setBusy(false); }
          }}><i className="fas fa-plus text-[14px]" aria-hidden /></button>
      )}
      <span className={`min-w-0 flex-1 py-3 text-[15px] font-semibold leading-snug ${added ? 'text-slate-500' : 'text-slate-800'}`}>{text}</span>
    </li>
  );
}
