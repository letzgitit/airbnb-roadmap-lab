'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { PhotoView } from '@/lib/core/photos';
import { usePhotos } from '@/components/progress/PhotosPanel';
import { textBtn } from '@/components/progress/bits';
import { AddButton } from '@/components/ui/AddButton';
import { Card, cardRowCls } from '@/components/ui/Card';
import { DOC_ALBUM, docGroups, docPhotos } from './home-model';

/**
 * 서류 탭 「받아 둔 서류」(가장 급한 카드 바로 밑): 사진 저장소의 PDF와 서류 사진(등기 · 계약서 · 건축물대장 · 도면 · 안내문 같은 것)을
 * 단계별 묶음으로, 묶음마다 64px 칸 한 줄(넘치면 옆으로 밀림). 사진은 누르면 크게 보기(그 묶음 안에서만 넘김), PDF는 새 창.
 * 「＋ 서류 올리기」는 묶음 이름 「서류」로 올린다(설명에 서류 낱말이 없어도 여기에 잡히게).
 */
export function ReceivedDocs() {
  const uid = useId();
  const { ordered, data, state, ensure, reload, view, upload, steps } = usePhotos();
  useEffect(() => { ensure(); }, [ensure]);
  const list = useMemo(() => docPhotos(ordered), [ordered]);
  const groups = useMemo(() => docGroups(list), [list]);
  const stepName = (id: number) => (id === 0 ? '단계 없음' : `${id}. ${steps.find((s) => s.id === id)?.title ?? ''}`);
  return (
    <Card as="section" aria-labelledby={`${uid}-t`}>
      <div className="flex items-baseline gap-2 px-4 pb-2 pt-3">
        <h3 id={`${uid}-t`} className="text-lg font-bold text-ink">받아 둔 서류</h3>
        {data && <span className="text-sm font-normal text-muted tabular-nums">{list.length}개</span>}
      </div>
      <div className="border-t border-line">
        <div className={cardRowCls}><AddButton label="서류 올리기" onClick={() => upload(undefined, DOC_ALBUM)} /></div>
        {state === 'error' ? (
          <div className="px-4 py-3">
            <p className="text-base text-ink-soft">서류를 불러오지 못했어요.</p>
            <button type="button" className={textBtn} onClick={() => void reload()}>다시 불러오기</button>
          </div>
        ) : !data ? (
          <div className="flex gap-2 p-3" aria-hidden>{Array.from({ length: 4 }, (_, i) => <span key={i} className="skeleton size-16 rounded-control" />)}</div>
        ) : groups.length === 0 ? (
          <p className="px-4 py-3 text-base text-muted">아직 올린 서류가 없어요.</p>
        ) : (
          groups.map((g) => (
            <div key={g.stepId} className={`${cardRowCls} px-4 py-3`}>
              <p className="mb-2 truncate text-sm font-bold text-ink-soft">{stepName(g.stepId)} <span className="font-normal text-muted tabular-nums">{g.items.length}개</span></p>
              <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
                {g.items.map((p) => (
                  <li key={p.id} className="w-16 shrink-0">
                    <DocTile p={p} onOpen={() => view(p.id, undefined, g.items.filter((x) => x.kind !== 'pdf').map((x) => x.id))} />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

/** 칸 하나: 사진 = 작은 그림(누르면 크게 보기), PDF = 파일 그림 + 「PDF」(누르면 새 창). 밑에 설명 한 줄 */
function DocTile({ p, onOpen }: { p: PhotoView; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const name = p.caption || p.album || (p.kind === 'pdf' ? 'PDF' : '서류');
  const face = p.kind === 'pdf' && !p.hasImage
    ? <span className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-control bg-sunken text-ink-soft"><i className="fas fa-file-pdf text-xl" aria-hidden /><span className="text-sm font-bold">PDF</span></span>
    : (
      <span className="relative block size-16 overflow-hidden rounded-control bg-sunken">
        {!failed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/photos/${p.id}?size=thumb`} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        )}
        {p.kind === 'pdf' && <span className="keep-light absolute left-0.5 top-0.5 rounded-control bg-ink/80 px-1 text-sm font-bold text-on-accent">PDF</span>}
        <span className="pointer-events-none absolute inset-0 rounded-control ring-1 ring-inset ring-ink/10" aria-hidden />
      </span>
    );
  const label = <span className="mt-1 block truncate text-sm font-normal text-ink-soft">{name}</span>;
  return p.kind === 'pdf'
    ? <a href={`/api/photos/${p.id}?size=file`} target="_blank" rel="noopener" aria-label={`${name} PDF 새 창으로 열기`} className="block">{face}{label}</a>
    : <button type="button" onClick={onOpen} aria-label={`${name} 크게 보기`} className="block w-full text-left">{face}{label}</button>;
}
