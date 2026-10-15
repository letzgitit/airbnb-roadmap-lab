'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Step } from '@/lib/core/types';
import { SECTION_ORDER, TAB_LABEL, sectionCount, type StepSection, type StepTab } from '@/lib/client/step-sections';
import { Sheet } from './Sheet';
import { StepPanel } from './progress/StepPanel';
import { useProgress } from './progress/ProgressProvider';

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);
const sectionTitle = 'mb-3 flex items-center gap-2 text-[14px] font-bold text-slate-700';
const cardBase = 'rounded-[20px] border px-[18px] py-4 mb-3.5';

// 단계 창: 탭 5개(챙길 것 · 주의 · 기준 · 필살기 · 사례). 한 줄(한 열)로만 보이고, 항목마다 따로 여는 상세 화면은 없다.
export function StepModal({ steps, index, section, open, shown, loggedIn, onClose, beforeClose, onGo }: {
  steps: Step[]; index: number; section: StepSection | null; open: boolean; shown: boolean; loggedIn: boolean;
  onClose: () => void; beforeClose: () => Promise<boolean>; onGo: (i: number) => void;
}) {
  const step = steps[index];
  const uid = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<StepTab, HTMLButtonElement | null>>>({});
  const [tab, setTab] = useState<StepTab>('todo');

  // 열 때·단계를 바꿀 때는 「챙길 것」부터. 검색에서 갈래를 달고 왔으면 그 탭을 바로 연다.
  const resetKey = `${open ? 1 : 0}|${index}|${section ?? ''}`;
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setTab(open && step && section && sectionCount(step, section) > 0 ? section : 'todo');
  }

  // 개수가 0 인 탭은 숨긴다
  const tabs: StepTab[] = step ? ['todo', ...SECTION_ORDER.filter((k) => sectionCount(step, k) > 0)] : ['todo'];
  const cur: StepTab = tabs.includes(tab) ? tab : 'todo';

  // 탭을 바꾸거나 단계를 옮기면 본문을 맨 위로
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [cur, index]);
  // 탭 줄이 넘칠 때 고른 탭이 보이게(스크롤은 탭 줄 안에서만)
  useEffect(() => {
    const list = listRef.current;
    const el = tabRefs.current[cur];
    if (!list || !el || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({ left: el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [cur, open]);

  if (!step) return null;
  const stepRefs = steps.map((s) => ({ id: s.id, title: s.title }));

  // 좌우 화살표 · Home · End 로 탭 이동(고르는 즉시 열림)
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.indexOf(cur);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    if (n < 0) return;
    e.preventDefault();
    setTab(tabs[n]);
    tabRefs.current[tabs[n]]?.focus();
  };
  // 이전/다음 단계: 저장 안 한 편집이 있으면 확인 뒤에 옮긴다
  const go = async (i: number) => {
    if (!(await beforeClose())) return;
    onGo(i);
  };

  const tabBar = (
    <div ref={listRef} role="tablist" aria-label="단계 내용" onKeyDown={onTabKey}
      className="relative flex overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((k) => {
        const on = cur === k;
        const warn = k === 'warnings';
        const n = k === 'todo' ? 0 : sectionCount(step, k);
        const tone = warn
          ? (on ? 'text-red-700 font-bold' : 'text-red-600 font-semibold')
          : (on ? 'text-blue-700 font-bold' : 'text-slate-600 font-semibold hover:text-slate-800');
        return (
          <button key={k} ref={(el) => { tabRefs.current[k] = el; }} type="button" role="tab" id={`${uid}-tab-${k}`}
            aria-selected={on} aria-controls={on || k === 'todo' ? `${uid}-panel-${k}` : undefined} tabIndex={on ? 0 : -1} onClick={() => setTab(k)}
            className={`relative flex min-h-11 flex-1 shrink-0 items-center justify-center whitespace-nowrap px-3 text-[14px] ${tone}`}>
            {warn && !on && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />}
            {TAB_LABEL[k]}
            {n > 0 && <span className="ml-1">{n}</span>}
            {on && <span className={`absolute inset-x-3 bottom-0 h-[3px] rounded-full ${warn ? 'bg-red-600' : 'bg-blue-600'}`} aria-hidden />}
          </button>
        );
      })}
    </div>
  );

  return (
    <Sheet open={open} shown={shown} onClose={onClose} beforeClose={beforeClose} bodyRef={bodyRef}
      eyebrow={<>
        <span className="rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-[12px] font-black text-blue-700">{step.id}단계</span>
        <span className="text-[12px] font-bold text-slate-500">{step.day}</span>
      </>}
      title={step.title}
      tabs={tabBar}
      footer={
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button type="button" onClick={() => void go(index - 1)} style={{ visibility: index === 0 ? 'hidden' : 'visible' }}
            className="flex min-h-11 items-center gap-2 rounded-2xl bg-slate-100 px-4 font-bold text-slate-600 transition-colors hover:bg-slate-200"><i className="fas fa-chevron-left" aria-hidden />이전 단계</button>
          <button type="button" onClick={() => void go(index + 1)} style={{ visibility: index === steps.length - 1 ? 'hidden' : 'visible' }}
            className="flex min-h-11 items-center gap-2 rounded-2xl bg-blue-600 px-5 font-bold text-white shadow-lg shadow-blue-200 transition-colors hover:bg-blue-700">다음 단계<i className="fas fa-chevron-right" aria-hidden /></button>
        </div>
      }>
      {/* 「챙길 것」은 다른 탭으로 옮겨도 그대로 둔다(안 보이게만): 쓰던 메모·할 일 입력과 저장 안 한 편집 보호가 끊기지 않게 */}
      <div role="tabpanel" id={`${uid}-panel-todo`} aria-labelledby={`${uid}-tab-todo`} hidden={cur !== 'todo'} className="flex flex-col gap-6 p-5">
        {step.summary && <div className="note-box m-0">{step.summary}</div>}
        {loggedIn && <StepPanel key={step.id} stepId={step.id} steps={stepRefs} />}
        {step.checklist.length > 0 && (
          <section aria-label="필수 체크리스트">
            <h3 className={sectionTitle}><i className="fas fa-check-circle text-slate-500" aria-hidden /> 필수 체크리스트</h3>
            {step.checklist.map((c, i) => <ChecklistRow key={i} text={c} stepId={step.id} loggedIn={loggedIn} />)}
          </section>
        )}
      </div>
      {cur !== 'todo' && (
        <div role="tabpanel" id={`${uid}-panel-${cur}`} aria-labelledby={`${uid}-tab-${cur}`} className="p-5">
          <SectionCards step={step} k={cur} />
        </div>
      )}
    </Sheet>
  );
}

// 고른 탭의 전체 목록
function SectionCards({ step, k }: { step: Step; k: StepSection }) {
  if (k === 'warnings') {
    return (
      <>
        {step.warnings.map((w, i) => (
          <div key={i} className={`${cardBase} border-red-100 bg-red-50/60`}>
            <p className="text-[14px] font-semibold leading-relaxed text-red-700">{w}</p>
          </div>
        ))}
      </>
    );
  }
  if (k === 'official') {
    return (
      <>
        {step.official.map((o, i) => {
          const url = safeUrl(o.url);
          return (
            <div key={i} className={`${cardBase} border-slate-200 bg-white`}>
              <p className="text-[15px] font-semibold leading-relaxed text-slate-900">{o.text}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] font-semibold text-slate-600">
                {o.region && <span className="rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-[12px] font-bold text-blue-700">{o.region}</span>}
                {o.checked && <span>확인일 {o.checked}</span>}
                {url
                  ? <a href={url} target="_blank" rel="noopener noreferrer" className="break-all font-bold text-blue-700 underline underline-offset-2">{o.source || o.url}<i className="fas fa-arrow-up-right-from-square ml-1 text-[12px]" aria-hidden /></a>
                  : o.source && <span>출처 {o.source}</span>}
              </div>
            </div>
          );
        })}
      </>
    );
  }
  if (k === 'tips') {
    return (
      <>
        {step.tips.map((t, i) => (
          <div key={i} className={`${cardBase} border-slate-200 bg-white`}>
            <p className="text-[15px] font-medium leading-relaxed text-slate-800">{t.text}</p>
            {t.from && <p className="mt-2 text-[13px] font-semibold text-slate-600">출처: {t.from}</p>}
          </div>
        ))}
      </>
    );
  }
  return (
    <>
      {step.community.map((c, i) => (
        <div key={i} className={`${cardBase} border-slate-200 bg-white`}>
          {(c.kind || c.date) && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-600">
              {c.kind && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-bold text-slate-700">{c.kind}</span>}
              {c.date && <span>{c.date}</span>}
            </div>
          )}
          <p className="text-[15px] font-medium leading-relaxed text-slate-800">{c.text}</p>
        </div>
      ))}
    </>
  );
}

// 필수 체크리스트 한 줄: 로그인했을 때만 「할 일로 추가」 한 가지 동작. 로그인 전엔 누를 수 없는 줄.
function ChecklistRow({ text, stepId, loggedIn }: { text: string; stepId: number; loggedIn: boolean }) {
  const { doc, send, toast } = useProgress();
  const [busy, setBusy] = useState(false);
  const taskText = text.trim().slice(0, 200);
  const added = loggedIn && !!doc && Object.values(doc.tasks).some((t) => !t.deletedAt && t.stepId === stepId && t.text.trim() === taskText);
  return (
    <div className="mb-2.5 flex min-h-[52px] items-center gap-3 rounded-[20px] border border-slate-200 bg-white py-2 pl-[18px] pr-2">
      <span className="min-w-0 flex-1 py-1.5 text-[14px] font-semibold leading-relaxed text-slate-800">{text}</span>
      {loggedIn && (added ? (
        <span className="inline-flex min-h-11 shrink-0 items-center gap-1 px-3 text-[13px] font-bold text-emerald-700"><i className="fas fa-check" aria-hidden />할 일에 있음</span>
      ) : (
        <button type="button" disabled={busy} className="min-h-11 shrink-0 whitespace-nowrap rounded-xl bg-slate-100 px-3 text-[13px] font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            try {
              const r = await send({ op: 'task.add', stepId, text: taskText });
              if (r.ok) toast(`${stepId}단계 할 일에 추가했어요.`);
            } finally { setBusy(false); }
          }}>할 일로 추가</button>
      ))}
    </div>
  );
}
