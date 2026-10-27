'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { PhotoView } from '@/lib/core/photos';
import { useProgress } from '@/components/progress/ProgressProvider';
import { PhotosPanel, usePhotos } from '@/components/progress/PhotosPanel';
import { textBtn } from '@/components/progress/bits';
import { AddButton } from '@/components/ui/AddButton';
import { Card, cardRowCls } from '@/components/ui/Card';
import { AFTER_ALBUM, housePhotos, ourUnits } from './home-model';

/** 「공사 후」 사진을 올릴 때 고를 단계(인테리어 & 스타일링). 올리기 창에서 바꿀 수 있다 */
const AFTER_STEP = 7;

/**
 * 사진 탭: 우리 집 사진만 「우리 집 지금(공사 전)」 · 「공사 후」 두 칸으로.
 * 거르기(home-model housePhotos): PDF · 참고 사진(0단계) · 설명에 참고/다른 집/서류 낱말 · 우리 호수가 아닌 「n호」는 뺀다.
 * 공사 후 = 묶음 이름이 「공사 후」(이 칸의 「＋ 사진 올리기」가 그 이름으로 올린다). 크게 보기는 그 칸 사진 안에서만 넘긴다.
 * 그 밑 「모든 사진」 = 사진 저장소 전체(PhotosPanel) — 홈 밖(/house)으로 보내지 않는다(2026-10-28 「우리 집」 메뉴를 뺐다).
 */
export function PhotosTab() {
  const { doc } = useProgress();
  const { ordered, data, state, ensure, reload, view, upload } = usePhotos();
  useEffect(() => { ensure(); }, [ensure]);
  const units = useMemo(() => (doc ? ourUnits(doc.property) : []), [doc]);
  const { before, after } = useMemo(() => housePhotos(ordered, units), [ordered, units]);
  const loading = !data;
  const uid = useId();

  if (state === 'error') {
    return (
      <Card className="px-4 py-3">
        <p className="text-base text-ink-soft">사진을 불러오지 못했어요.</p>
        <button type="button" className={textBtn} onClick={() => void reload()}>다시 불러오기</button>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <PhotoBlock title="공사 전" sub={`${before.length}장`} list={before} loading={loading}
        empty="아직 사진이 없어요." onUpload={() => upload()} onOpen={(id) => view(id, undefined, before.map((p) => p.id))} />
      <PhotoBlock title="공사 후" sub={`${after.length}장`} list={after} loading={loading}
        empty="공사가 끝나면 여기에 올려 주세요." onUpload={() => upload(AFTER_STEP, AFTER_ALBUM)} onOpen={(id) => view(id, undefined, after.map((p) => p.id))} />
      {/* 모든 사진(참고 · 서류 사진 포함): 예전 「우리 집 › 사진」과 같은 화면을 홈 안에 그대로 — 단계별 묶음 · 찾기 · 올리기 · 크게 보기 · 지우기 · 삭제한 사진 */}
      <section aria-labelledby={`${uid}-all`} className="mt-4 flex flex-col gap-3">
        <h2 id={`${uid}-all`} className="text-xl font-bold text-ink">모든 사진</h2>
        <PhotosPanel active />
      </section>
    </div>
  );
}

function PhotoBlock({ title, sub, list, loading, empty, onUpload, onOpen }: {
  title: string; sub: string; list: PhotoView[]; loading: boolean; empty: string; onUpload: () => void; onOpen: (id: string) => void;
}) {
  const uid = useId();
  // 묶음 제목은 카드 안 머리로(「구청에 물어볼 것」과 같은 모양)
  return (
    <Card as="section" aria-labelledby={`${uid}-t`}>
      <div className="px-4 pb-2 pt-4">
        <h3 id={`${uid}-t`} className="text-lg font-bold text-ink">{title}</h3>
        {!loading && <p className="mt-0.5 text-sm font-normal text-muted">{sub}</p>}
      </div>
      <div className="border-t border-line">
        <div className={cardRowCls}><AddButton label="사진 올리기" onClick={onUpload} /></div>
        {loading ? (
          <div className="grid grid-cols-3 gap-2 p-3 md:grid-cols-4" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton aspect-square rounded-control" />)}
          </div>
        ) : list.length === 0 ? (
          <p className="px-4 py-3 text-base text-muted">{empty}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 p-3 md:grid-cols-4">
            {list.map((p) => <li key={p.id}><Thumb p={p} onOpen={() => onOpen(p.id)} /></li>)}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Thumb({ p, onOpen }: { p: PhotoView; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <button type="button" onClick={onOpen} aria-label={`${p.caption || '사진'} 크게 보기`}
      className="relative block aspect-square w-full overflow-hidden rounded-control bg-sunken">
      {failed ? (
        <span className="flex h-full w-full items-center justify-center px-1 text-center text-sm text-muted">못 불러왔어요</span>
      ) : (
        <>
          {!loaded && <span className="skeleton absolute inset-0" aria-hidden />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/photos/${p.id}?size=thumb`} alt="" loading="lazy" decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
            className="h-full w-full object-cover" />
        </>
      )}
      <span className="pointer-events-none absolute inset-0 rounded-control ring-1 ring-inset ring-ink/10" aria-hidden />
    </button>
  );
}
