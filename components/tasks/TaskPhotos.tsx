'use client';

import { useId, useState } from 'react';
import { usePhotos } from '@/components/progress/PhotosPanel';
import { addBtnCls } from '@/components/ui/buttonCls';
import { LineIcon } from '@/components/ui/LineIcon';

/**
 * 할 일 메모 밑 사진: 64px 사진 줄(누르면 크게 — 그 할 일 사진 안에서만 넘김, 지우기도 크게 보기에서) + 「＋ 사진」 글자 단추(블록 단추 줄과 같은 모양).
 * 사진은 사진 저장소에 taskId 를 달아 올린다(사진 화면 · 단계 창에는 안 나온다). 할 일을 지우면 같이 휴지통으로, 되살리면 같이(서버).
 * flush = 펼친 메모 밑(보기): 위 글 ~ 사진 줄 · 「＋ 사진」 글자 8px, 「＋ 사진」 글자 아래는 줄 아래 여백만 — 44px 누르는 칸은
 *   글자 위아래 11px 씩 바깥(위 3px 겹침 · 아래 11px 를 줄 여백과 겹침)으로 걸친다. 고치는 폼 안에서는 flush 없이 예전 간격.
 */
export function TaskPhotos({ taskId, stepId, flush = false }: { taskId: string; stepId: number; flush?: boolean }) {
  const uid = useId();
  const { taskPhotos, uploadToTask, view } = usePhotos();
  const [busy, setBusy] = useState(false);
  const list = taskPhotos.filter((p) => p.taskId === taskId);
  const ids = list.map((p) => p.id);
  return (
    <div className={flush ? 'flex flex-col items-start' : 'py-1'}>
      {list.length > 0 && (
        <div className={`flex flex-wrap gap-2 ${flush ? 'pt-2' : 'pb-1'}`}>
          {list.map((p, i) => (
            <button key={p.id} type="button" onClick={() => view(p.id, undefined, ids)} aria-label={`메모 사진 ${i + 1} 크게 보기`}
              className="relative size-16 shrink-0 overflow-hidden rounded-thumb bg-strong">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photos/${p.id}?size=thumb`} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              <span className="pointer-events-none absolute inset-0 rounded-thumb ring-1 ring-inset ring-ink/10" aria-hidden />
            </button>
          ))}
        </div>
      )}
      <input id={`${uid}-f`} type="file" accept="image/*" multiple className="peer sr-only" disabled={busy}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (!files.length) return;
          setBusy(true);
          void uploadToTask(taskId, stepId, files).finally(() => setBusy(false));
        }} />
      <label htmlFor={`${uid}-f`} className={`${addBtnCls} -ml-3 ${flush ? '-mb-[11px] -mt-[3px]' : ''} cursor-pointerpeer-focus-visible:outline-2 peer-focus-visible:outline-accent-ink ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        <LineIcon name="plus" className="size-4.5" stroke={2.2} />{busy ? '올리는 중' : '사진'}
        <span className="sr-only">: 메모에 사진 추가</span>
      </label>
    </div>
  );
}
