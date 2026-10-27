'use client';

import { useId, useState } from 'react';
import { usePhotos } from '@/components/progress/PhotosPanel';

/**
 * 할 일 메모 밑 사진: 작은 사진 줄(누르면 크게 — 그 할 일 사진 안에서만 넘김, 지우기도 크게 보기에서) + 「사진 추가」.
 * 사진은 사진 저장소에 taskId 를 달아 올린다(사진 화면 · 단계 창에는 안 나온다). 할 일을 지우면 같이 휴지통으로, 되살리면 같이(서버).
 */
export function TaskPhotos({ taskId, stepId }: { taskId: string; stepId: number }) {
  const uid = useId();
  const { taskPhotos, uploadToTask, view } = usePhotos();
  const [busy, setBusy] = useState(false);
  const list = taskPhotos.filter((p) => p.taskId === taskId);
  const ids = list.map((p) => p.id);
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      {list.map((p, i) => (
        <button key={p.id} type="button" onClick={() => view(p.id, undefined, ids)} aria-label={`메모 사진 ${i + 1} 크게 보기`}
          className="relative size-14 shrink-0 overflow-hidden rounded-control bg-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/photos/${p.id}?size=thumb`} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          <span className="pointer-events-none absolute inset-0 rounded-control ring-1 ring-inset ring-ink/10" aria-hidden />
        </button>
      ))}
      <input id={`${uid}-f`} type="file" accept="image/*" multiple className="sr-only" disabled={busy}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (!files.length) return;
          setBusy(true);
          void uploadToTask(taskId, stepId, files).finally(() => setBusy(false));
        }} />
      <label htmlFor={`${uid}-f`}
        className={`flex size-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-control border border-line-strong text-accent-ink transition-colors hover:bg-sunken ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-plus'} text-sm`} aria-hidden />
        <span className="text-xs font-bold">{busy ? '올리는 중' : '사진'}</span>
        <span className="sr-only">메모에 사진 추가</span>
      </label>
    </div>
  );
}
