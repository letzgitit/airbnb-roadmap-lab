'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { PhotoView } from '@/lib/core/photos';
import { usePhotos } from '@/components/progress/PhotosPanel';
import { AddButton } from '@/components/ui/AddButton';
import { textBtn } from '@/components/ui/buttonCls';
import { LineIcon } from '@/components/ui/LineIcon';
import { DOC_ALBUM, docGroups, docPhotos } from './home-model';

/**
 * 「갤러리」 탭 › 「문서」(2026-10-28 서류 탭 「받아 둔 서류」에서 옮겨 옴 — 행정 탭의 「받아 둔 문서 n개 보기」 줄은 없앴다): 사진 저장소의 PDF와 서류 사진(등기 · 계약서 · 건축물대장 · 도면 · 안내문 같은 것)을
 * 단계별 묶음으로, 묶음마다 두 칸씩 큰 둥근 카드(4:3, 모서리 18, 실제 썸네일 — 시안 B). 사진은 누르면 크게 보기(그 묶음 안에서만 넘김), PDF는 새 창.
 * 「＋ 문서 올리기」는 묶음 이름 「서류」로 올린다(설명에 서류 낱말이 없어도 여기에 잡히게).
 */
export function DocsPanel() {
  const uid = useId();
  const { ordered, data, state, ensure, reload, view, upload, steps } = usePhotos();
  useEffect(() => { ensure(); }, [ensure]);
  const list = useMemo(() => docPhotos(ordered), [ordered]);
  const groups = useMemo(() => docGroups(list), [list]);
  const stepName = (id: number) => (id === 0 ? '단계 없음' : `${id}. ${steps.find((s) => s.id === id)?.title ?? ''}`);
  return (
    <section aria-labelledby={`${uid}-t`} className="flex flex-col gap-7">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`${uid}-t`} className="text-xl font-semibold tracking-[-0.01em] text-ink">받아 둔 문서</h2>
        {data && state === 'idle' && <span className="text-base font-medium text-muted tabular-nums">{list.length}개</span>}
      </div>
      {/* 올리기 단추는 앱 전체 한 모양(AddButton 「＋ ○○ 올리기」) */}
      <div className="-mx-2.5 -my-5"><AddButton label="문서 올리기" onClick={() => upload(undefined, DOC_ALBUM)} /></div>
      {state === 'error' ? (
        <div>
          <p className="text-base text-ink-soft">문서를 불러오지 못했어요.</p>
          <button type="button" className={textBtn} onClick={() => void reload()}>다시 불러오기</button>
        </div>
      ) : !data ? (
        <div className="grid grid-cols-2 gap-3" aria-hidden>{Array.from({ length: 4 }, (_, i) => <span key={i} className="skeleton aspect-[4/3] rounded-thumb" />)}</div>
      ) : groups.length === 0 ? (
        <p className="text-base text-muted">아직 올린 문서가 없어요.</p>
      ) : (
        groups.map((g) => (
          <div key={g.stepId}>
            <p className="mb-3 truncate text-base font-semibold text-ink">{stepName(g.stepId)} <span className="font-medium text-muted tabular-nums">{g.items.length}개</span></p>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-4 md:grid-cols-3">
              {g.items.map((p) => (
                <li key={p.id} className="min-w-0">
                  <DocTile p={p} onOpen={() => view(p.id, undefined, g.items.filter((x) => x.kind !== 'pdf').map((x) => x.id))} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

/** 칸 하나: 사진 = 큰 썸네일(누르면 크게 보기), PDF = 문서 아이콘 + 「PDF」(그림이 있으면 그림 + 「PDF」 표시, 누르면 새 창). 밑에 설명 한 줄 */
function DocTile({ p, onOpen }: { p: PhotoView; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const name = p.caption || p.album || (p.kind === 'pdf' ? 'PDF' : '서류');
  const face = p.kind === 'pdf' && !p.hasImage
    ? (
      <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-thumb bg-strong text-ink-soft">
        <LineIcon name="doc" className="size-9" stroke={1.4} /><span className="text-sm font-semibold">PDF</span>
      </span>
    ) : (
      <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-thumb bg-strong">
        {!failed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/photos/${p.id}?size=thumb`} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        )}
        {failed && <span className="absolute inset-0 flex items-center justify-center text-sm text-muted">못 불러왔어요</span>}
        {p.kind === 'pdf' && <span className="keep-light absolute left-2 top-2 rounded-chip bg-surface px-1.5 py-0.5 text-meta font-semibold text-ink">PDF</span>}
      </span>
    );
  const label = <span className="mt-2 block truncate text-sm font-medium text-ink">{name}</span>;
  return p.kind === 'pdf'
    ? <a href={`/api/photos/${p.id}?size=file`} target="_blank" rel="noopener" aria-label={`${name} PDF 새 창으로 열기`} className="block">{face}{label}</a>
    : <button type="button" onClick={onOpen} aria-label={`${name} 크게 보기`} className="block w-full text-left">{face}{label}</button>;
}
