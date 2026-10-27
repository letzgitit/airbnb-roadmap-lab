'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { PhotoView } from '@/lib/core/photos';
import { REF_LABEL, REF_STEP } from '@/lib/core/photo-order';
import { useProgress } from '@/components/progress/ProgressProvider';
import { PhotoSearchFields, PhotoTrash, usePhotos } from '@/components/progress/PhotosPanel';
import { addBtnCls, textBtn } from '@/components/ui/buttonCls';
import { LineIcon } from '@/components/ui/LineIcon';
import { BlockHead, blockCls } from './StepBlock';
import {
  AFTER_ALBUM, DOC_ALBUM, DOC_KINDS, FIELD_TABS, docKind, docKindGroups, fieldLabel, galleryParts, ourUnits, photoMatches, sortPhotos, taskTabs,
  type WorkTabId,
} from './home-model';

/** 「공사 후」 사진을 올릴 때 고를 단계(인테리어 & 스타일링). 올리기 창에서 바꿀 수 있다 */
const AFTER_STEP = 7;

export type PhotoSub = 'photos' | 'docs' | 'etc';
const SUBS: { id: PhotoSub; label: string }[] = [{ id: 'photos', label: '사진' }, { id: 'docs', label: '문서' }, { id: 'etc', label: '기타' }];

interface Group {
  key: string; title: string; list: PhotoView[]; upload?: () => void; empty?: string; doc?: boolean;
  /** 한 장짜리 문서 묶음을 한 블록에 모을 때의 소제목 묶음(이때 list = 전부) */
  subs?: { key: string; title: string; list: PhotoView[] }[];
}
/** 한 장짜리 문서 묶음이 여럿이면 한 블록(이 이름)에 소제목으로 모은다 */
const SINGLE_DOCS = '그 밖의 서류';

/**
 * 「갤러리」 탭(기획 27의 5절, 옛 「사진」). 위에서 아래로, 블록 사이 8px 회색 띠:
 * 1. 맨 위 블록: (검색 중일 때만) 「38장 (전체 44장)」 + 검색칸(설명 · 묶음 · 단계 · 분야) + 정렬(올린 순서 · 최신 · 오래된) → 보조 탭 「사진 · 문서 · 기타」(데일리 .subtab).
 * 2. 고른 보조 탭의 묶음 블록들(머리 = 형광 밑줄 큰 글자 + 장수, 몸통 = 썸네일 격자, 맨 아래 「＋ 올리기」 — 블록 단추 줄과 같은 모양):
 *    - 사진: 공사 전 · 공사 후 · 분야별(행정 · 설비 · 운영 블록과 그 할 일에 붙인 사진 — cardId · taskId). 썸네일 3열(넓으면 4 · 5열).
 *    - 문서: 「받아 둔 문서」 제목 없이 문서 종류별 묶음(계약서 · 등기부 · 건축물대장 · 평면도 · 구청 서류 · 그 밖 — 설명 · 묶음 이름의 낱말). 썸네일 2열(넓으면 3열) + 설명 한 줄.
 *      한 장짜리 묶음이 여럿이면 「그 밖의 서류」 한 블록에 소제목으로 모은다. 단위는 「장」.
 *    - 기타: 참고 사진(0단계) · 나머지(시안 · 다른 집 등).
 * 3. 맨 아래 「삭제한 사진 n」(지운 게 있을 때만, 30일 보관).
 * 나누기 · 검색 · 정렬은 home-model(galleryParts · docKindGroups · photoMatches · sortPhotos). 지우지 않은 사진은 어느 한 묶음에 꼭 들어간다.
 * 크게 보기는 그 묶음 안에서만 넘긴다. 홈 밖(/house)으로 보내지 않는다.
 */
export function PhotosTab({ sub, onSub }: { sub: PhotoSub; onSub: (s: PhotoSub) => void }) {
  const uid = useId();
  const { doc } = useProgress();
  const { steps, ordered, taskPhotos, cardPhotos, data, state, ensure, reload, view, upload, query, sort } = usePhotos();
  useEffect(() => { ensure(); }, [ensure]);
  const units = useMemo(() => (doc ? ourUnits(doc.property) : []), [doc]);
  const tabOf = useMemo(() => (doc ? taskTabs(doc) : new Map<string, WorkTabId>()), [doc]);
  const parts = useMemo(() => galleryParts(ordered, [...cardPhotos, ...taskPhotos], units, tabOf), [ordered, cardPhotos, taskPhotos, units, tabOf]);

  // 검색에 쓰는 이름: 단계 이름 · 분야 이름 · 문서 종류
  const extra = useMemo(() => {
    const stepName = (id: number) => (id === REF_STEP ? REF_LABEL : `${id}. ${steps.find((s) => s.id === id)?.title ?? ''}`);
    return (p: PhotoView, also = '') => `${stepName(p.stepId)}\n${also}`;
  }, [steps]);
  const pick = (list: PhotoView[], also: (p: PhotoView) => string = () => '') => sortPhotos(list.filter((p) => photoMatches(p, query, extra(p, also(p)))), sort);
  const kindLabel = (p: PhotoView) => DOC_KINDS.find((k) => k.id === docKind(p))?.label ?? '';

  const groups: Record<PhotoSub, Group[]> = {
    photos: [
      { key: 'before', title: '공사 전', list: pick(parts.before, () => '공사 전'), upload: () => upload(), empty: '아직 사진이 없어요.' },
      { key: 'after', title: '공사 후', list: pick(parts.after, () => AFTER_ALBUM), upload: () => upload(AFTER_STEP, AFTER_ALBUM), empty: '공사가 끝나면 여기에 올려 주세요.' },
      ...FIELD_TABS.map((t) => ({ key: t, title: fieldLabel(t), list: pick(parts.fields[t], () => fieldLabel(t)) })),
    ],
    docs: docGroupsFor(docKindGroups(pick(parts.docs, kindLabel)), upload),
    etc: [
      { key: 'ref', title: REF_LABEL, list: pick(parts.ref, () => '참고'), upload: () => upload(REF_STEP), empty: '남의 집이나 다른 호수 같은 참고 사진을 올려 두세요.' },
      { key: 'other', title: '나머지', list: pick(parts.other) },
    ],
  };
  const totals: Record<PhotoSub, number> = {
    photos: parts.before.length + parts.after.length + FIELD_TABS.reduce((n, t) => n + parts.fields[t].length, 0),
    docs: parts.docs.length,
    etc: parts.ref.length + parts.other.length,
  };
  const found = (s: PhotoSub) => groups[s].reduce((n, g) => n + g.list.length, 0);
  const searching = query.trim() !== '';
  // 검색 중에는 빈 묶음을 숨긴다. 검색이 아니면 공사 전 · 후 · 참고처럼 올리는 자리가 있는 묶음은 비어도 보인다
  const shown = groups[sub].filter((g) => g.list.length > 0 || (!searching && g.empty));
  const loading = !data;

  return (
    <div className="flex flex-col gap-2">
      <section aria-label="사진 찾기" className={blockCls}>
        <div role="search" className="space-y-2 px-5 pb-3 pt-3.5">
          {/* 장수 줄은 검색 중일 때만(보조 탭 옆 숫자가 평소 장수를 말한다) */}
          <p className={`text-meta text-muted tabular-nums ${searching && !loading ? '' : 'sr-only'}`} aria-live="polite">
            {searching && !loading ? `${found(sub)}장 (전체 ${totals[sub]}장)` : ''}
          </p>
          <PhotoSearchFields placeholder="욕실, 계약서처럼 찾아보세요" label="사진 찾기(설명 · 묶음 이름 · 단계 · 분야)" />
        </div>
        {/* 보조 탭(데일리 .subtab): 같은 폭 셋, 고른 것 = 700 + 아래 2px 검정 선, 옆에 장수(13) */}
        <div role="tablist" aria-label="갤러리 보기" className="flex border-t border-line px-2">
          {SUBS.map((s) => {
            const on = s.id === sub;
            const n = searching ? found(s.id) : totals[s.id];
            return (
              <button key={s.id} type="button" role="tab" id={`${uid}-${s.id}`} aria-selected={on} aria-controls={`${uid}-panel`} onClick={() => onSub(s.id)}
                className={`relative flex min-h-11.5 flex-1 items-center justify-center gap-1.5 text-base transition-opacity active:opacity-60 ${on ? 'font-bold text-ink' : 'font-semibold text-ink-soft'}`}>
                {s.label}{!loading && <small className="text-meta font-normal text-muted tabular-nums">{n}</small>}
                {on && <span className="absolute inset-x-[22%] -bottom-px h-0.5 bg-ink" aria-hidden />}
              </button>
            );
          })}
        </div>
      </section>

      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${sub}`} className="flex flex-col gap-2">
        {state === 'error' ? (
          <div className={`${blockCls} px-5 py-4`}>
            <p className="text-base text-ink-soft">사진을 불러오지 못했어요.</p>
            <button type="button" className={`${textBtn} mx-0`} onClick={() => void reload()}>다시 불러오기</button>
          </div>
        ) : loading ? (
          <div className={`${blockCls} px-5 py-4`} aria-hidden>
            <span className="skeleton block h-6 w-28 rounded-chip" />
            <div className="mt-3 grid grid-cols-3 gap-1.5">{Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton aspect-square rounded-thumb" />)}</div>
          </div>
        ) : shown.length === 0 ? (
          <div className={blockCls}>
            <p className="px-5 py-4 text-base text-muted">
              {searching ? `「${query.trim()}」에 맞는 ${sub === 'docs' ? '문서가' : '사진이'} 없어요.` : sub === 'docs' ? '아직 올린 문서가 없어요.' : '아직 사진이 없어요.'}
            </p>
            {sub === 'docs' && !searching && <UploadRow onClick={() => upload(undefined, DOC_ALBUM, { doc: true })} />}
          </div>
        ) : (
          shown.map((g) => <GalleryGroup key={g.key} g={g} onOpen={(id) => view(id, undefined, g.list.filter((p) => p.hasImage).map((p) => p.id))} />)
        )}
      </div>

      <PhotoTrash className="mt-6" />
    </div>
  );
}

/**
 * 문서 묶음 → 블록들. 한 장짜리 묶음이 둘 이상이면 「그 밖의 서류」 한 블록에 소제목으로 모으고 「＋ 올리기」는 한 번만(묶음 이름 「서류」).
 * 여러 장 묶음은 따로 블록 — 그 블록의 「＋ 올리기」는 묶음 이름을 그 종류로(그 밖 = 「서류」) · 「글씨 많은 문서」를 켠 채 연다.
 */
function docGroupsFor(groups: ReturnType<typeof docKindGroups>, upload: (stepId?: number, album?: string, opts?: { doc?: boolean }) => void): Group[] {
  const up = (g: { kind: string; label: string }) => () => upload(undefined, g.kind === 'other' ? DOC_ALBUM : g.label, { doc: true });
  const singles = groups.filter((g) => g.items.length === 1);
  const merge = singles.length >= 2;
  const out: Group[] = groups.filter((g) => !merge || g.items.length > 1)
    .map((g) => ({ key: g.kind, title: g.label, list: g.items, doc: true, upload: up(g) }));
  if (merge) {
    out.push({
      key: 'singles', title: SINGLE_DOCS, doc: true, list: singles.flatMap((g) => g.items),
      subs: singles.map((g) => ({ key: g.kind, title: g.label, list: g.items })), upload: up({ kind: 'other', label: '' }),
    });
  }
  return out;
}

/** 묶음 블록 하나: 머리(형광 밑줄 큰 글자 + 장수) → 썸네일 격자(사진 3열 · 문서 2열, 넓으면 늘림) 또는 빈 글 → 「＋ 올리기」 */
function GalleryGroup({ g, onOpen }: { g: Group; onOpen: (id: string) => void }) {
  const uid = useId();
  const docGrid = (list: PhotoView[], cls = '') => (
    <ul className={`grid grid-cols-2 gap-x-3 gap-y-4 md:grid-cols-3 ${cls}`}>
      {list.map((p) => <li key={p.id} className="min-w-0"><DocTile p={p} onOpen={() => onOpen(p.id)} /></li>)}
    </ul>
  );
  return (
    <section aria-labelledby={`${uid}-h`} className={blockCls}>
      <BlockHead id={`${uid}-h`} title={g.title} count={`${g.list.length}장`} />
      {g.list.length === 0 ? (
        <p className="border-t border-line px-5 py-3.5 text-base text-muted">{g.empty}</p>
      ) : g.subs ? (
        // 한 장짜리 묶음마다 칸 하나: 소제목(데일리 .grp-h — 14/700 요지색) + 그 문서. 칸은 다른 문서 격자와 같은 2열(넓으면 3열)
        <ul className="grid grid-cols-2 gap-x-3 gap-y-4 border-t border-line px-5 py-4 md:grid-cols-3">
          {g.subs.map((s) => (
            <li key={s.key} className="min-w-0">
              <h3 className="truncate pb-1.5 text-sm font-bold text-sub">{s.title}</h3>
              <DocTile p={s.list[0]} onOpen={() => onOpen(s.list[0].id)} />
            </li>
          ))}
        </ul>
      ) : g.doc ? (
        docGrid(g.list, 'border-t border-line px-5 py-4')
      ) : (
        <ul className="grid grid-cols-3 gap-1.5 border-t border-line px-5 py-4 sm:grid-cols-4 lg:grid-cols-5">
          {g.list.map((p) => <li key={p.id}><Thumb p={p} onOpen={() => onOpen(p.id)} /></li>)}
        </ul>
      )}
      {g.upload && <UploadRow onClick={g.upload} />}
    </section>
  );
}

/** 「＋ 올리기」 — 일터 블록 맨 아래 단추 줄(「＋ 할 일 · ＋ 메모 · ＋ 사진」)과 같은 모양 */
function UploadRow({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex items-center border-t border-line px-2">
      <button type="button" onClick={onClick} className={addBtnCls}>
        <LineIcon name="plus" className="size-4.5" stroke={2.2} />올리기
      </button>
    </div>
  );
}

/** 사진 칸(정사각 · 모서리 6, 화면에 가까워질 때 불러온다). 흰 종이 사진도 경계가 보이게 옅은 안쪽 테두리 */
function Thumb({ p, onOpen }: { p: PhotoView; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <button type="button" onClick={onOpen} aria-label={`${p.caption || p.album || '사진'} 크게 보기`}
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
      <span className="pointer-events-none absolute inset-0 rounded-thumb ring-1 ring-inset ring-ink/10" aria-hidden />
    </button>
  );
}

/** 문서 칸: 사진 = 4:3 썸네일(누르면 크게 보기), PDF = 문서 아이콘 + 「PDF」(그림이 있으면 그림 + 「PDF」 표시, 누르면 새 창). 밑에 설명 한 줄(14) */
function DocTile({ p, onOpen }: { p: PhotoView; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const name = p.caption || p.album || (p.kind === 'pdf' ? 'PDF' : '문서');
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
        <span className="pointer-events-none absolute inset-0 rounded-thumb ring-1 ring-inset ring-ink/10" aria-hidden />
      </span>
    );
  const label = <span className="mt-1.5 block truncate text-sm text-ink-soft">{name}</span>;
  return p.kind === 'pdf'
    ? <a href={`/api/photos/${p.id}?size=file`} target="_blank" rel="noopener" aria-label={`${name} PDF 새 창으로 열기`} className="block">{face}{label}</a>
    : <button type="button" onClick={onOpen} aria-label={`${name} 크게 보기`} className="block w-full text-left">{face}{label}</button>;
}
