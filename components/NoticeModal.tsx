'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Step, UpdateItem } from '@/lib/core/types';
import { Sheet } from './Sheet';
import { TabBar, panelDomId, tabDomId, type TabItem } from './TabBar';
import { WarningList } from './WarningList';
import { LineIcon } from './ui/LineIcon';

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);
type Tab = 'rules' | 'steps';

// 주의사항 창: 「바뀐 규정」(한 번에 한 항목만 펼치는 아코디언) | 「단계별 주의사항」(14단계의 주의 문장을 단계 이름 아래에 모아서)
export function NoticeModal({ steps, updates, open, shown, initialIndex, onClose }: {
  steps: Step[]; updates: UpdateItem[]; open: boolean; shown: boolean; initialIndex?: number | null; onClose: () => void;
}) {
  const uid = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('rules');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [wasOpen, setWasOpen] = useState(false);

  // 열릴 때마다 처음 상태로: 「바뀐 규정」 탭, 검색에서 왔으면 그 항목만 펼친 채
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTab('rules');
      setExpanded(initialIndex != null && initialIndex >= 0 && initialIndex < updates.length ? initialIndex : null);
    }
  }

  // 검색으로 열린 항목이 화면 밖이면 목록 안에서만 스크롤한다(scrollIntoView 는 창 전체를 밀 수 있어 쓰지 않는다)
  useEffect(() => {
    if (!open || initialIndex == null) return;
    const body = bodyRef.current;
    const el = body?.querySelector<HTMLElement>(`[data-notice="${initialIndex}"]`);
    if (body && el) body.scrollTop = Math.max(0, el.offsetTop - 12);
  }, [open, initialIndex]);

  // 탭을 바꾸면 본문을 맨 위로
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [tab]);

  const withWarnings = steps.filter((s) => s.warnings.length > 0);
  const warnCount = withWarnings.reduce((n, s) => n + s.warnings.length, 0);
  const items: TabItem[] = [
    { id: 'rules', label: '바뀐 규정', count: updates.length },
    { id: 'steps', label: '단계별 주의사항', count: warnCount },
  ];

  return (
    <Sheet open={open} shown={shown} onClose={onClose} bodyRef={bodyRef} bodyClassName="relative bg-surface" title="주의사항"
      tabs={<TabBar items={items} value={tab} onChange={(id) => setTab(id as Tab)} label="주의사항 종류" idPrefix={uid} />}>
      <div role="tabpanel" id={panelDomId(uid, tab)} aria-labelledby={tabDomId(uid, tab)} className="px-4 pb-6 pt-1">
        {tab === 'rules' ? (
          <ul>
            {updates.map((u, i) => {
              const on = expanded === i;
              const url = safeUrl(u.url);
              const src = u.source || (url ? u.url : '');
              return (
                <li key={i} data-notice={i} className="border-b border-line last:border-b-0">
                  <button type="button" aria-expanded={on} aria-controls={`${uid}-body-${i}`} onClick={() => setExpanded(on ? null : i)}
                    className="flex min-h-11 w-full items-center gap-3 py-3 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-normal tabular-nums text-muted">{u.date}</span>
                      <span className="block text-base font-semibold text-ink">{u.title}</span>
                    </span>
                    <LineIcon name="chevron" stroke={2} className={`size-5 shrink-0 text-ink-soft transition-transform ${on ? '-rotate-90' : 'rotate-90'}`} />
                  </button>
                  {on && (
                    <div id={`${uid}-body-${i}`} className="pb-4">
                      <p className="text-base leading-relaxed text-ink-soft">{u.text}</p>
                      {src && (
                        <p className="mt-3 text-sm font-normal text-muted">
                          출처{' '}
                          {url
                            ? <a href={url} target="_blank" rel="noopener noreferrer" className="[overflow-wrap:anywhere] text-accent-ink underline underline-offset-2">{src}<i className="fas fa-arrow-up-right-from-square ml-1 text-xs" aria-hidden /></a>
                            : src}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          withWarnings.map((s) => (
            <section key={s.id} aria-label={`${s.id}. ${s.title}`} className="pt-6 first:pt-4">
              <h3 className="text-lg font-bold text-ink">{s.id}. {s.title}</h3>
              <WarningList items={s.warnings} />
            </section>
          ))
        )}
      </div>
    </Sheet>
  );
}
