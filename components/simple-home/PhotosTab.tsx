'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { PhotoView } from '@/lib/core/photos';
import { useProgress } from '@/components/progress/ProgressProvider';
import { PhotosPanel, usePhotos } from '@/components/progress/PhotosPanel';
import { AddButton } from '@/components/ui/AddButton';
import { textBtn } from '@/components/ui/buttonCls';
import { Card } from '@/components/ui/Card';
import { DocsPanel } from './ReceivedDocs';
import { AFTER_ALBUM, housePhotos, ourUnits } from './home-model';

/** 「공사 후」 사진을 올릴 때 고를 단계(인테리어 & 스타일링). 올리기 창에서 바꿀 수 있다 */
const AFTER_STEP = 7;

export type PhotoSub = 'photos' | 'docs';
const SUBS: { id: PhotoSub; label: string }[] = [{ id: 'photos', label: '사진' }, { id: 'docs', label: '문서' }];

/**
 * 「사진」 탭: 맨 위 하위 탭 「사진」 「문서」(시안 페이지 하위 탭 SubNav 와 같은 밑줄 모양 — 고른 것 = ink 600 + 2px 검정 밑줄).
 * - 사진: 우리 집 사진만 「공사 전」 · 「공사 후」 두 칸 + 그 밑 「모든 사진」(사진 저장소 전체 PhotosPanel).
 *   거르기(home-model housePhotos): PDF · 참고 사진(0단계) · 설명에 참고/다른 집/서류 낱말 · 우리 호수가 아닌 「n호」는 뺀다.
 *   공사 후 = 묶음 이름이 「공사 후」(이 칸의 「＋ 사진 올리기」가 그 이름으로 올린다). 크게 보기는 그 칸 사진 안에서만 넘긴다.
 * - 문서: 받아 둔 서류 사진 · PDF(ReceivedDocs DocsPanel). 서류 탭의 「받아 둔 문서 n개 보기」가 이리로 온다.
 * 홈 밖(/house)으로 보내지 않는다.
 */
export function PhotosTab({ sub, onSub }: { sub: PhotoSub; onSub: (s: PhotoSub) => void }) {
  return (
    <div className="flex flex-col gap-7 pt-3">
      <div role="group" aria-label="사진 · 문서 고르기" className="flex gap-6 border-b border-line">
        {SUBS.map((s) => {
          const on = s.id === sub;
          return (
            <button key={s.id} type="button" aria-pressed={on} onClick={() => onSub(s.id)}
              className={`relative flex min-h-12 items-center text-base transition-colors ${on ? 'font-semibold text-ink' : 'font-medium text-muted hover:text-ink'}`}>
              {s.label}
              {on && <span className="absolute -inset-x-0.5 -bottom-px h-0.5 bg-ink" aria-hidden />}
            </button>
          );
        })}
      </div>
      {sub === 'docs' ? <DocsPanel /> : <HousePhotos />}
    </div>
  );
}

function HousePhotos() {
  const { doc } = useProgress();
  const { ordered, data, state, ensure, reload, view, upload } = usePhotos();
  useEffect(() => { ensure(); }, [ensure]);
  const units = useMemo(() => (doc ? ourUnits(doc.property) : []), [doc]);
  const { before, after } = useMemo(() => housePhotos(ordered, units), [ordered, units]);
  const loading = !data;
  const uid = useId();

  if (state === 'error') {
    return (
      <Card className="px-5 py-4">
        <p className="text-base text-ink-soft">사진을 불러오지 못했어요.</p>
        <button type="button" className={textBtn} onClick={() => void reload()}>다시 불러오기</button>
      </Card>
    );
  }
  return (
    <>
      <PhotoBlock title="공사 전" sub={`${before.length}장`} list={before} loading={loading}
        empty="아직 사진이 없어요." onUpload={() => upload()} onOpen={(id) => view(id, undefined, before.map((p) => p.id))} />
      <PhotoBlock title="공사 후" sub={`${after.length}장`} list={after} loading={loading}
        empty="공사가 끝나면 여기에 올려 주세요." onUpload={() => upload(AFTER_STEP, AFTER_ALBUM)} onOpen={(id) => view(id, undefined, after.map((p) => p.id))} />
      {/* 모든 사진(참고 · 서류 사진 포함): 예전 「우리 집 › 사진」과 같은 화면을 홈 안에 그대로 — 단계별 묶음 · 찾기 · 올리기 · 크게 보기 · 지우기 · 삭제한 사진 */}
      <section aria-labelledby={`${uid}-all`} className="flex flex-col gap-3.5">
        <h2 id={`${uid}-all`} className="text-xl font-semibold tracking-[-0.01em] text-ink">모든 사진</h2>
        {/* 올리기는 위 공사 전 · 후 두 곳에만(이 카드 안 「＋ 사진 올리기」는 뺀다) */}
        <PhotosPanel active noUpload />
      </section>
    </>
  );
}

/** 묶음 하나(시안 B): 제목 20/600 + 개수, 「＋ 사진 올리기」, 세 칸씩 둥근 썸네일 */
function PhotoBlock({ title, sub, list, loading, empty, onUpload, onOpen }: {
  title: string; sub: string; list: PhotoView[]; loading: boolean; empty: string; onUpload: () => void; onOpen: (id: string) => void;
}) {
  const uid = useId();
  return (
    <section aria-labelledby={`${uid}-t`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`${uid}-t`} className="text-xl font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        {!loading && <span className="text-base font-medium text-muted tabular-nums">{sub}</span>}
      </div>
      <div className="-mx-2.5 mt-1"><AddButton label="사진 올리기" onClick={onUpload} /></div>
      {loading ? (
        <div className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-4" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton aspect-square rounded-thumb" />)}
        </div>
      ) : list.length === 0 ? (
        <p className="mt-1 text-base text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-4">
          {list.map((p) => <li key={p.id}><Thumb p={p} onOpen={() => onOpen(p.id)} /></li>)}
        </ul>
      )}
    </section>
  );
}

function Thumb({ p, onOpen }: { p: PhotoView; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <button type="button" onClick={onOpen} aria-label={`${p.caption || '사진'} 크게 보기`}
      className="relative block aspect-square w-full overflow-hidden rounded-thumb bg-strong">
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
    </button>
  );
}
