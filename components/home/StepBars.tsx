'use client';

import { useState } from 'react';
import { dayRangeLabel, shortDate } from '@/lib/client/format';
import { cardRowCls } from '@/components/ui/Card';
import { FoldRow } from '@/components/ui/FoldRow';
import { TYPE_COLOR } from '@/components/TimelineChart';
import { DAY, DateStrip } from './DateStrip';
import { axisOf, type DocLike, type Pin, type StepRange, type TimelineStep } from './step-dates';

// 홈 「단계」 탭: 날짜 띠 + 단계 막대가 한 상자에서 같이 가로로 넘어간다(하루 30px).
//   단계 줄(48px) 두 줄 모양은 모든 단계가 같다:
//     윗줄 = 이름 · 기간 · 「지금」/완료 체크 — 늘 상자 왼쪽 끝에 붙어 있다(가로로 넘겨도 자리가 그대로, 왼쪽에 빈칸이 생기지 않는다).
//     아랫줄 = 그 기간의 막대(16px 색면, 최소 14px). 막대가 화면 밖이면 그쪽 가장자리에 같은 색 조각 + 화살표만(기간은 윗줄에 이미 있다).
//   줄을 누르면 단계 창. 「끝난 단계 n개」는 접어 둔다.
//   로그인 전(guest)은 날짜 대신 공개 일정 날수(「13~14일째」)를 기간 자리에 적고, 날짜 칸은 누를 수 없다.
const MIN_BAR = 14;
const colorOf = (type: string) => (TYPE_COLOR as Record<string, string>)[type] ?? 'var(--prep-bar)';

export function StepBars({ steps, doc, today, types, currentId, onStep, onPick, picked, fixedDay0, marks, guest }: {
  steps: TimelineStep[]; doc: DocLike; today: string; types: string[]; currentId: number | null;
  onStep: (index: number) => void; onPick?: (date: string) => void; picked: string | null;
  fixedDay0?: string; marks: Pin[]; guest: boolean;
}) {
  const [showDone, setShowDone] = useState(false);
  const { ranges, pins, first, last, openDues, beyond, dayInfo } = axisOf(steps, doc, today, { fixedDay0, marks, showDone, types });
  // 처음엔 「남아 있는 일」부터: 안 끝난 할 일 마감일 중 가장 이른 날(없으면 오늘)을 왼쪽 끝 한두 칸 안쪽에
  const anchor = openDues.filter((d) => d >= first && d <= last).sort()[0] ?? (today >= first && today <= last ? today : first);
  const doneRanges = ranges.filter((r) => r.done);
  const shownRanges = ranges.filter((r) => !r.done || showDone);
  const period = (r: StepRange) => (guest ? dayRangeLabel(r.start, r.end) : `${shortDate(r.from)}~${shortDate(r.to)}`);

  return (
    // 거르기 · 펼치기로 축이 바뀌면 처음 자리를 다시 잡는다
    <DateStrip key={`${first}${last}`} first={first} last={last} today={today} picked={picked} pins={pins} dayInfo={dayInfo} beyond={beyond}
      onPick={onPick} startAt={anchor} align="lead">
      {({ x, sl, viewW }) => {
        const vw = viewW || 360;
        const leftEdge = sl;
        const rightEdge = sl + vw;
        return (
          <ol aria-label="단계별 기간">
            {doneRanges.length > 0 && (
              <li className={`${cardRowCls} relative z-20 bg-surface`}>
                <div className="sticky left-0" style={{ width: vw }}>
                  <FoldRow label="끝난 단계" count={doneRanges.length} open={showDone} onToggle={() => setShowDone((v) => !v)} />
                </div>
              </li>
            )}
            {shownRanges.length === 0 && (
              <li className={cardRowCls}><p className="sticky left-0 px-4 py-3 text-base text-muted" style={{ width: vw }}>고른 종류의 단계가 없어요. 다른 종류를 켜 보세요.</p></li>
            )}
            {shownRanges.map((r) => {
              const cur = currentId === r.id;
              const barL = x(r.from);
              const barR = x(r.to) + DAY;
              const after = barL > rightEdge - 24; // 막대가 오른쪽 화면 밖(거의 안 보임)
              const before = barR < leftEdge + 24; // 막대가 왼쪽 화면 밖
              const face = cur ? 'bg-accent-soft' : 'bg-surface group-hover:bg-sunken';
              return (
                // overflow-clip: 축 끝 뒤로 늘어난 막대를 자르되, 스크롤 상자가 아니어서 윗줄 sticky 가 그대로 된다
                <li key={r.id} className={`${cardRowCls} group relative h-12 overflow-clip`}>
                  <button type="button" onClick={() => onStep(steps.findIndex((s) => s.id === r.id))} aria-current={cur ? 'step' : undefined}
                    aria-label={`${r.id}. ${r.title}, ${guest ? period(r) : `${shortDate(r.from)}부터 ${shortDate(r.to)}까지`}${cur ? ', 지금' : ''}${r.done ? ', 완료' : ''}`}
                    className={`absolute inset-0 block transition-colors focus-visible:-outline-offset-2 ${cur ? 'bg-accent-soft' : 'hover:bg-sunken'}`} />
                  {/* 막대 */}
                  <span className="pointer-events-none absolute top-7 block h-4 rounded-control" aria-hidden
                    style={{ left: barL, width: Math.max(barR - barL, MIN_BAR), backgroundColor: colorOf(r.type), opacity: r.done ? 0.4 : 1 }} />
                  {/* 윗줄: 이름 · 기간 · 지금(상자 왼쪽 끝 고정, 세로선보다 위에 면 바탕으로) */}
                  <div className="pointer-events-none sticky left-0 z-20 flex h-7 items-end px-4" style={{ width: vw }} aria-hidden>
                    <span className={`-mx-1 flex min-w-0 max-w-full items-baseline gap-x-2 px-1 transition-colors ${face}`}>
                      <span className={`min-w-0 truncate text-sm ${r.done ? 'font-normal text-muted' : cur ? 'font-bold text-ink' : 'font-semibold text-ink'}`}>{r.id}. {r.title}</span>
                      <span className="shrink-0 whitespace-nowrap text-xs font-normal tabular-nums text-muted">{period(r)}</span>
                      {cur && <span className="shrink-0 text-xs font-bold text-accent-ink">지금</span>}
                      {r.done && <span className="shrink-0 text-xs text-muted"><i className="fas fa-check" aria-hidden /></span>}
                    </span>
                  </div>
                  {/* 아랫줄: 막대가 화면 밖이면 그쪽 가장자리에 같은 색 조각 + 화살표 */}
                  {(after || before) && (
                    <div className={`pointer-events-none sticky left-0 z-20 flex h-5 items-center pt-1 ${after ? 'justify-end' : 'justify-start'}`} style={{ width: vw }} aria-hidden>
                      {before && <span className="block h-4 w-3 rounded-r-control" style={{ backgroundColor: colorOf(r.type), opacity: r.done ? 0.4 : 1 }} />}
                      <i className={`fas ${after ? 'fa-chevron-right' : 'fa-chevron-left'} mx-1.5 text-xs text-muted`} />
                      {after && <span className="block h-4 w-3 rounded-l-control" style={{ backgroundColor: colorOf(r.type), opacity: r.done ? 0.4 : 1 }} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        );
      }}
    </DateStrip>
  );
}
