'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { RefItem, Step } from '@/lib/core/types';
import { dayLabel, shortDate, todayStr } from '@/lib/client/format';
import { stepRanges } from './home/step-dates';
import { FIXED_DAY0, PLAN_WORD, toTimelineSteps } from './home/timeline-config';
import { SECTION_ORDER, TAB_LABEL, sectionCount, type StepSection, type StepTab } from '@/lib/client/step-sections';
import { Sheet } from './Sheet';
import { TabBar, panelDomId, tabDomId, type TabItem } from './TabBar';
import { WarningList } from './WarningList';
import { StepInfo, StepStatusPill, StepTasks } from './progress/StepPanel';
import { useProgress } from './progress/ProgressProvider';
import { StepPhotos } from './progress/PhotosPanel';
import { btnGhost, btnPrimary, rowCls } from './progress/bits';
import { Badge } from './ui/Badge';
import { FoldRow } from './ui/FoldRow';
import { LineIcon } from './ui/LineIcon';

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);
const sectionTitle = 'mb-1 text-lg font-bold text-ink';
const row = 'border-b border-line py-4 last:border-b-0';
const meta = 'mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-normal text-muted';
// YYYY-MM-DD → YYYY.MM.DD, YYYY-MM → YYYY.MM. 다른 꼴의 글자는 그대로 둔다.
const fmtDate = (d: string) => (/^\d{4}-\d{2}(-\d{2})?$/.test(d) ? d.replace(/-/g, '.') : d);

// 단계 창: 탭 5개(할 일 · 주의사항 · 규정 · 노하우 · 참고 자료). 한 열로만 보이고, 항목마다 따로 여는 상세 화면은 없다.
export function StepModal({ steps, index, section, open, shown, loggedIn, onClose, beforeClose, onGo }: {
  steps: Step[]; index: number; section: StepSection | null; open: boolean; shown: boolean; loggedIn: boolean;
  onClose: () => void; beforeClose: () => Promise<boolean>; onGo: (i: number) => void;
}) {
  const step = steps[index];
  const { doc: progressDoc } = useProgress();
  // 로그인했으면 머리 줄에 우리 실제 기간(홈 타임라인 막대와 같은 계산)
  const real = loggedIn && progressDoc && step ? stepRanges(toTimelineSteps(steps), progressDoc, todayStr(), FIXED_DAY0).find((r) => r.id === step.id) : null;
  const uid = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<StepTab>('todo');

  // 열 때·단계를 바꿀 때는 「할 일」부터. 검색에서 갈래를 달고 왔으면 그 탭을 바로 연다.
  const resetKey = `${open ? 1 : 0}|${index}|${section ?? ''}`;
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setTab(open && step && section && sectionCount(step, section) > 0 ? section : 'todo');
  }

  // 개수가 0 인 탭은 숨긴다(「참고 자료」만 0 개여도 늘 보이고, 0 개일 땐 숫자를 달지 않는다)
  const items: TabItem[] = [{ id: 'todo', label: TAB_LABEL.todo }];
  if (step) {
    SECTION_ORDER.forEach((k) => {
      const n = sectionCount(step, k);
      if (n > 0 || k === 'refs') items.push({ id: k, label: TAB_LABEL[k], count: n > 0 ? n : undefined, tone: k === 'warnings' ? 'danger' : undefined });
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
      eyebrow={
        <span className="flex flex-wrap gap-x-3 text-sm font-normal text-muted">
          <span>{step.id}단계</span>
          {/* 로그인했으면 앞말을 붙여 공개 일정과 우리 실제 기간을 나란히(「보통 13~18일째」 「우리 일정 10/13~11/3」) */}
          {dayLabel(step.day) && <span className="text-ink-soft">{real ? `${PLAN_WORD} ` : ''}{dayLabel(step.day)}</span>}
          {real && <span className="text-ink-soft">우리 일정 {shortDate(real.from)}~{shortDate(real.to)}</span>}
        </span>
      }
      title={step.title}
      // 진행 상태: 로그인했을 때만(단추 → 작은 메뉴). 탭 막대와 닮지 않게, 머리 줄이 아니라 제목 아래 줄에 둔다
      belowTitle={loggedIn ? <StepStatusPill key={step.id} stepId={step.id} /> : undefined}
      tabs={<TabBar items={items} value={cur} onChange={(id) => setTab(id as StepTab)} label="단계 내용" idPrefix={uid} />}
      footer={
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button type="button" onClick={() => void go(index - 1)} style={{ visibility: index === 0 ? 'hidden' : 'visible' }} className={btnGhost}>
            <i className="fas fa-chevron-left text-sm" aria-hidden />이전 단계
          </button>
          <button type="button" onClick={() => void go(index + 1)} style={{ visibility: index === steps.length - 1 ? 'hidden' : 'visible' }} className={btnPrimary}>
            다음 단계<i className="fas fa-chevron-right text-sm" aria-hidden />
          </button>
        </div>
      }>
      {/* 「할 일」은 다른 탭으로 옮겨도 그대로 둔다(안 보이게만): 쓰던 메모·할 일 입력과 저장 안 한 편집 보호가 끊기지 않게 */}
      <div role="tabpanel" id={panelDomId(uid, 'todo')} aria-labelledby={tabDomId(uid, 'todo')} hidden={cur !== 'todo'} className="flex flex-col gap-6 px-4 py-4">
        {step.summary && <div className="rounded-control bg-sunken px-4 py-3 text-base leading-relaxed text-ink">{step.summary}</div>}
        {/* 위에서부터: 요약 → 우리 할 일 → 사진 → 추천 할 일 → 목표일 · 메모(접힘) */}
        {loggedIn && <StepTasks key={`t${step.id}`} stepId={step.id} steps={stepRefs} />}
        {/* 이 단계 사진(로그인했을 때만): 작은 썸네일 줄 + 「＋ 사진」 */}
        {loggedIn && <StepPhotos stepId={step.id} />}
        {step.checklist.length > 0 && (
          <section aria-label="추천 할 일">
            <h3 className={sectionTitle}>추천 할 일</h3>
            {loggedIn && <p className="mb-1 text-sm font-normal text-muted">＋를 누르면 우리 할 일에 들어가요.</p>}
            <ul className="border-t border-line">{step.checklist.map((c, i) => <ChecklistRow key={i} text={c} stepId={step.id} loggedIn={loggedIn} />)}</ul>
          </section>
        )}
        {loggedIn && <StepInfo key={`i${step.id}`} stepId={step.id} />}
      </div>
      {cur !== 'todo' && (
        <div role="tabpanel" id={panelDomId(uid, cur)} aria-labelledby={tabDomId(uid, cur)} className="px-4 pb-6 pt-1">
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
              <p className="text-base font-semibold leading-relaxed text-ink">{o.text}</p>
              <div className={meta}>
                {o.region && <span>{o.region}</span>}
                {o.checked && <span>확인일 {fmtDate(o.checked)}</span>}
                {url
                  ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center [overflow-wrap:anywhere] text-accent-ink underline underline-offset-2 -my-3">{o.source || o.url}<i className="fas fa-arrow-up-right-from-square ml-1 text-xs" aria-hidden /></a>
                  : o.source && <span>출처 {o.source}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }
  if (k === 'tips') {
    // 노하우(tips) 먼저, 이어서 「실제 사례」(community) 묶음.
    const hasTips = step.tips.length > 0;
    const hasCases = step.community.length > 0;
    return (
      <>
        {hasTips && (
          <ul>
            {step.tips.map((t, i) => (
              <li key={`t${i}`} className={row}>
                <p className="text-base font-normal leading-relaxed text-ink">{t.text}</p>
                {t.from && t.from !== '현장 경험' && <p className="mt-1.5 text-sm font-normal text-muted">출처: {t.from}</p>}
              </li>
            ))}
          </ul>
        )}
        {hasCases && (
          <div className={hasTips ? 'mt-6' : 'pt-3'}>
            <h3 className={sectionTitle}>실제 사례</h3>
            <ul>
              {step.community.map((c, i) => {
                const kind = (c.kind || '').trim();
                const chip = kind && kind !== '사례' ? kind : null;
                return (
                  <li key={`c${i}`} className={row}>
                    <p className="text-base font-normal leading-relaxed text-ink">{c.text}</p>
                    {(chip || c.date) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-normal text-muted">
                        {chip && (chip === '주의' ? <Badge tone="danger">주의</Badge> : <span>{chip}</span>)}
                        {c.date && <span>{fmtDate(c.date)}</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </>
    );
  }
  return <RefList step={step} />;
}

const REF_FIRST = 10;

// 참고 자료: 최신순, 처음 10개만 보이고 나머지는 「n개 더 보기」(접는 줄 FoldRow — 새 홈 · 검색과 같은 이름 · 모양, 펼치면 「접기」).
// 단계를 옮기면 접힌 상태로(key={step.id} 로 새로 시작).
function RefList({ step }: { step: Step }) {
  return <RefListInner key={step.id} refs={step.refs} />;
}
function RefListInner({ refs }: { refs: RefItem[] }) {
  const uid = useId();
  const [all, setAll] = useState(false);
  // date 내림차순 안정 정렬(같은 날짜는 들어온 순서 유지)
  const sorted = useMemo(() => refs.map((r, i) => ({ r, i })).sort((a, b) => (a.r.date === b.r.date ? a.i - b.i : a.r.date < b.r.date ? 1 : -1)).map((x) => x.r), [refs]);
  if (sorted.length === 0) return <p className="pt-3 text-base text-muted">아직 이 단계에 맞는 참고 자료가 없어요.</p>;
  const shown = all ? sorted : sorted.slice(0, REF_FIRST);
  const rest = sorted.length - REF_FIRST;
  return (
    <>
      {sorted.some((r) => r.auto) && <p className="pt-3 text-sm font-normal text-muted">자동으로 모은 자료는 틀릴 수 있어요. 원문을 확인하세요.</p>}
      <ul id={`${uid}-refs`}>
        {shown.map((r, i) => {
          const url = safeUrl(r.url);
          return (
            <li key={`${r.url}|${i}`} className={row}>
              <p className="text-base font-semibold leading-relaxed text-ink">
                {url
                  ? <a href={url} target="_blank" rel="noopener noreferrer" className="block py-2.5 -my-2.5 [overflow-wrap:anywhere] hover:underline">{r.title}<i className="fas fa-arrow-up-right-from-square ml-1 text-xs text-muted" aria-hidden /></a>
                  : r.title}
              </p>
              <p className="mt-1 text-base font-normal leading-relaxed text-ink-soft">{r.summary}</p>
              <div className={meta}>
                <span>{r.source}</span>
                <span>{fmtDate(r.date)}</span>
                {r.auto && <span>자동 수집</span>}
              </div>
            </li>
          );
        })}
      </ul>
      {rest > 0 && (
        <div className="border-t border-line [&>button]:px-0">
          <FoldRow label={all ? '접기' : `${rest}개 더 보기`} open={all} onToggle={() => setAll((v) => !v)} controls={`${uid}-refs`} />
        </div>
      )}
    </>
  );
}

// 추천 할 일 한 줄. 로그인 전: 누를 수 없는 목록(앞 조작 없음). 로그인 후: 「＋ 제목」 줄 전체가 한 단추(바로 위 「＋ 할 일」
// AddTextButton 과 같은 자리 · 모양 — 18px ＋ 선 아이콘 검정, 글자 앞 6px, 누르면 옅은 면 · 모서리 10 — 2026-10-29 「모두 다 동일하게」),
// 이미 우리 할 일에 있으면 같은 자리에 흐린 체크 + 흐린 글자(누를 수 없음). 줄 끝 단추는 없다.
function ChecklistRow({ text, stepId, loggedIn }: { text: string; stepId: number; loggedIn: boolean }) {
  const { doc, send, toast } = useProgress();
  const [busy, setBusy] = useState(false);
  const taskText = text.trim().slice(0, 200);
  const added = loggedIn && !!doc && Object.values(doc.tasks).some((t) => !t.deletedAt && t.stepId === stepId && t.text.trim() === taskText);
  if (!loggedIn) {
    return <li className="border-b border-line py-3 text-base font-semibold text-ink last:border-b-0">{text}</li>;
  }
  return (
    <li className={rowCls}>
      {added ? (
        <span className="flex min-w-0 flex-1 items-start gap-1.5 text-muted">
          <span className="flex h-11 shrink-0 items-center" role="img" aria-label="이미 우리 할 일에 있어요"><LineIcon name="check" className="size-4.5" stroke={2.2} /></span>
          <span className="min-w-0 flex-1 py-2.5 text-base font-semibold">{text}</span>
        </span>
      ) : (
        <button type="button" disabled={busy} aria-label={`${text} 할 일에 추가`}
          className="-mx-3 flex min-h-11 min-w-0 flex-1 items-start gap-1.5 rounded-control px-3 text-left text-ink transition-colors hover:bg-sunken disabled:text-faint"
          onClick={async () => {
            setBusy(true);
            try {
              const r = await send({ op: 'task.add', stepId, text: taskText });
              if (r.ok) toast('우리 할 일에 넣었어요.');
            } finally { setBusy(false); }
          }}>
          <span className="flex h-11 shrink-0 items-center"><LineIcon name="plus" className="size-4.5" stroke={2.2} /></span>
          <span className="min-w-0 flex-1 py-2.5 text-base font-semibold">{text}</span>
        </button>
      )}
    </li>
  );
}
