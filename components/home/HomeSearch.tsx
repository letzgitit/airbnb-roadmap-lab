'use client';

import { useMemo, useState } from 'react';
import type { ScriptItem, Step, UpdateItem } from '@/lib/core/types';
import { SECTION_ORDER, TAB_LABEL, type StepSection } from '@/lib/client/step-sections';
import { cardCls } from '@/components/ui/Card';

// 홈 「단계」 구역 맨 위 검색: 단계(제목 · 요약 · 추천 할 일 · 네 갈래) · 바뀐 규정 · 대화 예시를 찾는다.
// 결과는 최대 8줄. 단계 글이 많아도 바뀐 규정 · 대화 예시가 묻히지 않게 각각 2칸까지는 먼저 잡아 둔다.
type Hit =
  | { kind: 'step'; i: number; section: StepSection | null; label: string; tag?: string; text: string }
  | { kind: 'update'; idx: number; label: string; tag?: string; text: string }
  | { kind: 'script'; idx: number; label: string; tag?: string; text: string };
const MAX_HITS = 8;
const RESERVE = 2;

export function HomeSearch({ steps, updates, scripts, onStep, onNotice, onScript }: {
  steps: Step[]; updates: UpdateItem[]; scripts: ScriptItem[];
  onStep: (i: number, section: StepSection | null) => void; onNotice: (idx: number) => void; onScript: (idx: number) => void;
}) {
  const [query, setQuery] = useState('');

  const results = useMemo<Hit[] | null>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    const has = (t: string) => t.toLowerCase().includes(q);
    const stepHits: Hit[] = [];
    steps.forEach((s, i) => {
      const base = `${s.id}. ${s.title}`;
      // 제목 · 요약 · 추천 할 일에 걸리면 단계만 연다(「할 일」 탭)
      const head = [s.title, s.summary, ...s.checklist].find(has);
      if (head) stepHits.push({ kind: 'step', i, section: null, label: base, text: head });
      // 네 갈래 목록에 걸리면 그 탭까지 연다(갈래마다 첫 번째 걸린 글 하나). 라벨은 탭 이름 그대로.
      const pool: Record<StepSection, string[]> = {
        warnings: s.warnings, official: s.official.map((o) => o.text), tips: [...s.tips.map((t) => t.text), ...s.community.map((c) => c.text)], refs: s.refs.flatMap((r) => [r.title, r.summary]),
      };
      SECTION_ORDER.forEach((k) => {
        const hit = pool[k].find(has);
        if (hit) stepHits.push({ kind: 'step', i, section: k, label: base, tag: TAB_LABEL[k], text: hit });
      });
    });
    const updateHits: Hit[] = [];
    updates.forEach((u, idx) => {
      const hit = [u.title, u.text].find(has);
      if (hit) updateHits.push({ kind: 'update', idx, label: '주의사항', tag: '바뀐 규정', text: hit });
    });
    // 대화 예시: 상대(who) · 상황 · 말할 문장. 상황이 걸리면 상황을, 문장만 걸리면 그 문장을 보인다(상대만 걸리면 상황).
    const scriptHits: Hit[] = [];
    scripts.forEach((s, idx) => {
      const line = s.lines.find(has);
      if (has(s.situation) || has(s.who) || line) {
        scriptHits.push({ kind: 'script', idx, label: '대화 예시', tag: s.who, text: has(s.situation) || !line ? s.situation : line });
      }
    });
    const u0 = Math.min(updateHits.length, RESERVE);
    const s0 = Math.min(scriptHits.length, RESERVE);
    const stepTake = Math.min(stepHits.length, MAX_HITS - u0 - s0);
    let left = MAX_HITS - stepTake - u0 - s0;
    const uTake = u0 + Math.min(updateHits.length - u0, left);
    left -= uTake - u0;
    const sTake = s0 + Math.min(scriptHits.length - s0, left);
    return [...stepHits.slice(0, stepTake), ...updateHits.slice(0, uTake), ...scriptHits.slice(0, sTake)];
  }, [query, steps, updates, scripts]);

  const go = (r: Hit) => {
    if (r.kind === 'step') onStep(r.i, r.section);
    else if (r.kind === 'update') onNotice(r.idx);
    else onScript(r.idx);
    setQuery('');
  };

  return (
    <div className="relative z-30">
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="검색 · 예: 임대인 설득" aria-label="검색"
        onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery(''); } }}
        className="min-h-11 w-full rounded-control border border-line-strong bg-surface py-2 pl-11 pr-3 text-lg font-semibold text-ink placeholder:font-normal placeholder:text-muted focus:border-accent-ink focus:outline-none focus:ring-1 focus:ring-accent-ink [&::-webkit-search-cancel-button]:hidden" />
      <i className="fas fa-search pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-muted" aria-hidden />
      {results && (
        <div className={`${cardCls} absolute left-0 top-full z-50 mt-2 max-h-[60vh] w-full overflow-y-auto shadow-xl dark:shadow-black/50`} role="region" aria-label="검색 결과">
          {results.length === 0 && <p className="px-4 py-3 text-base text-muted" role="status">검색 결과가 없어요.</p>}
          {results.map((r, k) => (
            <button key={k} type="button" onClick={() => go(r)}
              className="block min-h-11 w-full border-b border-line px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-sunken active:bg-sunken">
              <span className="mb-0.5 flex flex-wrap gap-x-3 text-sm font-normal text-muted">
                <span>{r.label}</span>{r.tag && <span>{r.tag}</span>}
              </span>
              <span className="line-clamp-2 text-base font-semibold text-ink">{r.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
