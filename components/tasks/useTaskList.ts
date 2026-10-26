'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskItem } from '@/lib/core/types';

// 홈 「할 일」과 단계 시트 「우리 할 일」이 같이 쓰는 목록 상태 두 가지.

/** 방금 체크한 줄이 제자리를 지키는 시간(되돌리기 알림과 같은 길이) */
export const STICKY_MS = 8000;

/**
 * 방금 체크 · 해제한 줄(id → 토글 직전 done): 알림 시간 동안은 직전 값 기준으로 줄을 세워 자리가 안 바뀐다.
 * isDone(t) 로 줄 세우기 · 묶기를 하고, 체크박스를 누를 때 onToggle(t) 를 먼저 부른다.
 */
export function useStickyDone() {
  const [sticky, setSticky] = useState<Record<string, boolean>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const m = timers.current;
    return () => { m.forEach((t) => clearTimeout(t)); m.clear(); };
  }, []);
  const onToggle = useCallback((t: TaskItem) => {
    setSticky((s) => (t.id in s ? s : { ...s, [t.id]: t.done }));
    const old = timers.current.get(t.id);
    if (old) clearTimeout(old);
    timers.current.set(t.id, setTimeout(() => {
      timers.current.delete(t.id);
      setSticky((s) => { if (!(t.id in s)) return s; const n = { ...s }; delete n[t.id]; return n; });
    }, STICKY_MS));
  }, []);
  const isDone = useCallback((t: TaskItem) => sticky[t.id] ?? t.done, [sticky]);
  /** 방금 체크 · 해제해 제자리를 지키는 줄이 있는가(홈 「할 일」이 그동안 접히지 않게) */
  const hasSticky = Object.keys(sticky).length > 0;
  return { isDone, onToggle, hasSticky };
}

/**
 * 편집 폼이 열려 있는 할 일 id 묶음: 상대가 그 사이 지우거나 옮겨도 목록에서 그 줄(폼)을 빼지 않는다.
 * TaskRow 가 reportEdit(id, open) 으로 알린다.
 */
export function useEditingSet() {
  const [editing, setEditing] = useState<Set<string>>(() => new Set());
  const reportEdit = useCallback((id: string, open: boolean) => {
    setEditing((s) => {
      if (open === s.has(id)) return s;
      const n = new Set(s);
      if (open) n.add(id); else n.delete(id);
      return n;
    });
  }, []);
  return { editing, reportEdit };
}

/** 마감까지 남은 날수(오늘 = 0, 지났으면 음수). lib/client/format 의 dueLabel 과 같은 기준 */
export function daysUntil(due: string, today: string): number {
  return Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
}
