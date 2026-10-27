'use client';

import { useId, useMemo } from 'react';
import type { Content } from '@/lib/core/types';
import { Card } from '@/components/ui/Card';
import { newsGroups, type NewsItem } from './home-model';

/**
 * 뉴스 탭: 사이트에 이미 있는 민박업 규정 소식과 단계별 참고 자료(고정 + 6시간마다 자동 수집)를 한 목록으로.
 * 맨 위 「구청 · 정책」(규정 소식 · 공지 · 구청 · 법령 낱말), 그 아래 「기사 · 영상」. 각 묶음은 최근 순, 누르면 원문을 새 창으로.
 */
export function NewsTab({ content }: { content: Content }) {
  const { policy, other } = useMemo(() => newsGroups(content.updates, content.steps.flatMap((s) => s.refs)), [content]);
  return (
    <div className="flex flex-col gap-4">
      <NewsCard title="구청 · 정책" sub="규정이 바뀐 것, 구청 안내" list={policy} />
      <NewsCard title="기사 · 영상" sub="준비하면서 볼 만한 것" list={other} />
    </div>
  );
}

function NewsCard({ title, sub, list }: { title: string; sub: string; list: NewsItem[] }) {
  const uid = useId();
  return (
    <Card as="section" aria-labelledby={`${uid}-t`}>
      <div className="px-4 pb-2 pt-4">
        <h3 id={`${uid}-t`} className="text-lg font-bold text-ink">{title}</h3>
        <p className="mt-0.5 text-sm font-normal text-muted">{list.length > 0 ? `${sub} (${list.length}개)` : sub}</p>
      </div>
      <ul className="border-t border-line">
        {list.length === 0 && <li className="px-4 py-3 text-base text-muted">아직 없어요.</li>}
        {list.map((n) => (
          <li key={n.key} className="border-b border-line last:border-b-0">
            {n.url ? (
              <a href={n.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-start gap-3 px-4 py-3 transition-colors hover:bg-sunken">
                <Body n={n} />
                <i className="fas fa-arrow-up-right-from-square mt-1 shrink-0 text-xs text-muted" aria-hidden />
                <span className="sr-only">(새 창)</span>
              </a>
            ) : (
              <div className="flex items-start gap-3 px-4 py-3"><Body n={n} /></div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Body({ n }: { n: NewsItem }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block break-words text-base font-semibold text-ink">{n.title}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm font-normal text-muted">
        <span className="whitespace-nowrap text-ink-soft">{n.dateText}</span>
        {n.status && <span className="whitespace-nowrap">{n.status}</span>}
        <span className="min-w-0 break-words">{n.source}</span>
      </span>
    </span>
  );
}
