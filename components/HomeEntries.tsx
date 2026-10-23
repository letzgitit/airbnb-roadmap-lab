'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

// 홈 맨 위의 바로 가기 두 칸. 왼쪽 = 주의사항(빨강은 「주의」를 뜻하므로 이 칸만 빨간 바탕),
// 오른쪽 = 집 정보 · 기록(로그인했을 때만, 중립). 목록은 홈에 펼치지 않고 눌러서 창(시트)으로 본다.
// 두 칸은 같은 폭 · 같은 높이이고, 아주 좁은 화면(340px 미만)에서만 위아래로 쌓인다. 익명은 주의사항 한 칸만, 가로 가득.
export function HomeEntries({ ruleCount, warnCount, loggedIn, onOpenNotice, onOpenRecords }: {
  ruleCount: number; warnCount: number; loggedIn: boolean; onOpenNotice: () => void; onOpenRecords: () => void;
}) {
  const hasNotice = ruleCount + warnCount > 0;
  if (!hasNotice && !loggedIn) return null;
  return (
    <div className={`mb-5 grid max-w-[720px] grid-cols-1 gap-2.5 ${loggedIn ? 'min-[340px]:grid-cols-2' : ''}`}>
      {hasNotice && (
        <Tile tone="danger" title="주의사항" onOpen={onOpenNotice}
          icon={<i className="fas fa-triangle-exclamation shrink-0 text-[15px] text-red-600 dark:text-red-400" aria-hidden />}>
          {/* 좁은 칸에서는 쉼표 뒤에서만 줄이 바뀌도록 두 덩어리로 묶는다 */}
          <span className="inline-block">바뀐 규정 {ruleCount}건,</span>{' '}<span className="inline-block">단계별 주의사항 {warnCount}건</span>
        </Tile>
      )}
      {loggedIn && (
        <Tile tone="plain" title="집 정보 · 기록" onOpen={onOpenRecords} full={!hasNotice}>
          주소 · 조건 · 통화 기록 · 사진 · 꾸미기 참고
        </Tile>
      )}
      {/* 「11월~1월 일정」 한 장(/plan): 외도민 · 지산 할 일과 돈 흐름. 로그인했을 때만 */}
      {loggedIn && (
        <Link href="/plan" className="flex min-h-14 w-full flex-col gap-0.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-left hover:border-slate-400 min-[340px]:col-span-2">
          <span className="flex items-center gap-2">
            <i className="fas fa-calendar-days shrink-0 text-[15px] text-slate-500" aria-hidden />
            <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-slate-900">11월~1월 일정</span>
            <i className="fas fa-chevron-right shrink-0 text-[13px] text-slate-500" aria-hidden />
          </span>
          <span className="block text-[13px] leading-snug text-slate-600">외도민 · 지산 할 일과 돈 흐름을 한 장에</span>
        </Link>
      )}
    </div>
  );
}

function Tile({ tone, title, icon, full, onOpen, children }: {
  tone: 'danger' | 'plain'; title: string; icon?: ReactNode; full?: boolean; onOpen: () => void; children: ReactNode;
}) {
  const color = tone === 'danger' ? 'border-red-200 bg-red-50 hover:border-red-400' : 'border-slate-200 bg-white hover:border-slate-400';
  return (
    <button type="button" onClick={onOpen}
      className={`flex h-full min-h-14 w-full flex-col gap-0.5 rounded-2xl border px-3.5 py-2.5 text-left ${color} ${full ? 'min-[340px]:col-span-2' : ''}`}>
      <span className="flex items-center gap-2">
        {icon}
        <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-slate-900">{title}</span>
        <i className="fas fa-chevron-right shrink-0 text-[13px] text-slate-500" aria-hidden />
      </span>
      <span className="block text-[13px] leading-snug text-slate-600">{children}</span>
    </button>
  );
}
