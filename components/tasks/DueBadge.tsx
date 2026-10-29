import { Badge } from '@/components/ui/Badge';
import { dueTag } from './task-view';

/**
 * 남은 날 꼬리표 — 어느 화면이든 이것 하나(DESIGN.md 8.2): 기한 지남 = 위험 「5일 지남」, 0~3일 = 주의 「오늘」 · 「D-3」, 그 밖 = 회색 「D-12」.
 * 끝낸 일 · 마감 없음은 그리지 않는다. 쓰는 곳: 할 일 줄(TaskRow) · 새 홈 이번 주 · 단계 블록 머리 · 간트 할 일 줄 · 자금 할 일 목록 · 요약 「지금 하는 단계」.
 */
export function DueBadge({ due, today, done = false, className = '' }: { due: string | null | undefined; today: string; done?: boolean; className?: string }) {
  const d = dueTag(due, today, done);
  return d ? <Badge tone={d.tone} className={className}>{d.text}</Badge> : null;
}
