'use client';

import { DEFAULT_RANGE, TIMELINE, type TimelineType } from '@/lib/timeline';
import type { StepStatus } from '@/lib/core/types';
import { dayRangeLabel } from '@/lib/client/format';
import { Card, cardRowCls } from './ui/Card';

export interface ChartStep { id: number; label: string }
/** 단계별 할 일 개수: 끝낸 것 / 전체, 그리고 안 끝난 것 중 마감이 오늘인 것 · 이미 지난 것 */
export interface StepCounts { done: number; total: number; today: number; late: number }

// 단계 종류 색(분류색). 단계 기간 막대와 그 범례에만 쓰고, 다른 곳에서 뜻 색으로 빌려 쓰지 않는다(DESIGN.md 2.2).
// 「준비」 · 「계약」은 화면 모드에 따라 바뀌어야 해서 CSS 변수로 둔다(계약 = 본문 글자색과 같은 짙은 색).
export const TYPE_COLOR: Record<TimelineType, string> = {
  prep: 'var(--prep-bar)', milestone: 'var(--color-ink)', critical: '#f97316', setup: '#eab308', admin: '#a855f7', open: '#10b981',
};
export const TYPE_DOT: Record<TimelineType, string> = {
  prep: 'bg-[var(--prep-bar)]', milestone: 'bg-ink', critical: 'bg-[#f97316]', setup: 'bg-[#eab308]', admin: 'bg-[#a855f7]', open: 'bg-[#10b981]',
};
export const TYPE_LABEL: Record<TimelineType, string> = {
  prep: '준비', milestone: '계약', critical: '중요', setup: '설비', admin: '행정', open: '운영',
};
export const TYPE_ORDER: TimelineType[] = ['prep', 'milestone', 'critical', 'setup', 'admin', 'open'];

const rangeOf = (id: number) => TIMELINE[id] ?? DEFAULT_RANGE;
const PERIOD_DAYS = 45; // 전체 일정 길이(약 45일)

// 14단계 목록(폰 · PC 같은 모양): 줄마다 제목 + 보조 줄(「13~14일째 · 할 일 1/7 · 오늘 2 · 기한 지남 1」) + 45일 눈금 위 기간 막대.
// 지금 하는 단계 = 강조색 옅은 바탕 + 「지금」, 끝낸 단계 = 흐린 글자 + 체크 + 옅은 막대. 할 일 개수는 로그인했을 때만.
// 제목 줄 오른쪽 표시는 「지금」과 완료 체크 두 가지뿐이다. 「지금」이 아닌데 진행 중인 단계는 보조 줄에 「진행 중」을 조용히(muted 400) 적는다
// — 「지금」과 「진행 중」이 같은 자리에 나란히 보여 어느 게 지금인지 헷갈리지 않게.
export function TimelineChart({ steps, statuses, onSelect, counts, currentId }: {
  steps: ChartStep[];
  statuses: Record<number, StepStatus | undefined> | null;
  counts: Record<number, StepCounts> | null;
  onSelect: (index: number) => void;
  /** 지금 하는 단계(진행 중인 첫 단계, 없으면 시작 안 한 첫 단계). 로그인 전엔 null */
  currentId: number | null;
}) {
  return (
    <Card as="ol" aria-label="단계별 기간">
      {steps.map((s, i) => {
        const r = rangeOf(s.id);
        const st = statuses?.[s.id];
        const cur = currentId === s.id;
        const done = st === 'done';
        const c = counts?.[s.id];
        const title = cur ? 'font-bold text-ink' : done ? 'font-semibold text-muted' : 'font-semibold text-ink';
        const sub = [
          <span key="d" className="text-ink-soft">{dayRangeLabel(r.start, r.end)}</span>,
          !cur && st === 'doing' ? <span key="s">진행 중</span> : null,
          c && c.total > 0 ? <span key="n">할 일 {c.done}/{c.total}</span> : null,
          c && c.today > 0 ? <span key="t" className="font-bold text-ink">오늘 {c.today}</span> : null,
          c && c.late > 0 ? <span key="l" className="font-bold text-danger-ink">기한 지남 {c.late}</span> : null,
        ].filter((x) => x !== null);
        return (
          <li key={s.id} className={cardRowCls}>
            <button type="button" onClick={() => onSelect(i)} aria-current={cur ? 'step' : undefined}
              className={`block min-h-11 w-full px-4 py-3 text-left transition-colors ${cur ? 'bg-accent-soft' : 'hover:bg-sunken active:bg-sunken'}`}>
              {/* 오른쪽 표시(지금 · 완료)는 제목 줄에만 둔다 — 막대는 모든 줄이 같은 폭이라야 45일 눈금이 맞는다 */}
              <span className="flex items-start gap-3">
                <span className={`min-w-0 flex-1 text-base ${title}`}>{s.label}</span>
                {cur
                  ? <span className="shrink-0 text-sm font-bold text-accent-ink">지금</span>
                  : done
                    ? <span className="shrink-0 text-sm text-muted"><i className="fas fa-check" aria-hidden /><span className="sr-only">완료</span></span>
                    : null}
              </span>
              {/* 보조 줄: 항목 사이는 점 없이 12px 간격(날짜는 ink-soft) */}
              <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm font-normal text-muted">{sub}</span>
              <span className="relative mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-sunken" aria-hidden>
                <span className="absolute inset-y-0 block rounded-full"
                  style={{ left: `${(r.start / PERIOD_DAYS) * 100}%`, width: `${Math.max(((r.end - r.start) / PERIOD_DAYS) * 100, 2)}%`, backgroundColor: TYPE_COLOR[r.type], opacity: done ? 0.4 : 1 }} />
              </span>
            </button>
          </li>
        );
      })}
    </Card>
  );
}
