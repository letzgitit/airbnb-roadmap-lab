'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { devHeaders } from '@/components/progress/ProgressProvider';
import { textBtn } from '@/components/progress/bits';
import { Card, cardRowCls } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Segmented } from '@/components/ui/Segmented';
import type { RestyleList, RestyleRoom } from '@/lib/restyle';

// 꾸미기 › 사진 시안: 실제 방 사진과 AI로 다시 그린 시안을 방마다 겹쳐 본다.
// 목록 · 사진 모두 로그인을 확인하는 /api/restyle 로만 받는다(사진은 private/restyle/ — 공개 저장소에 안 올린다).
// 방 · 시안을 늘릴 때는 private/restyle/list.json 의 배열과 사진만 더하면 이 화면은 그대로 따라온다.

type State =
  | { kind: 'loading' } | { kind: 'ok'; list: RestyleList }
  | { kind: 'anon' } | { kind: 'forbidden' } | { kind: 'missing' } | { kind: 'error' };

// 개발 서버의 두 사람 흉내(?as=)를 사진 주소에도 넘긴다(<img> 요청에는 머리글을 못 붙인다). 운영 빌드에선 빈 글자.
function devAs(): string {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return '';
  const as = new URLSearchParams(window.location.search).get('as');
  return as ? `?as=${encodeURIComponent(as)}` : '';
}

const photoUrl = (file: string) => `/api/restyle/${encodeURIComponent(file)}${devAs()}`;

async function load(): Promise<State> {
  try {
    const res = await fetch('/api/restyle', { cache: 'no-store', headers: devHeaders() });
    if (res.status === 401) return { kind: 'anon' };
    if (res.status === 403) return { kind: 'forbidden' };
    if (res.status === 404) return { kind: 'missing' };
    if (!res.ok) return { kind: 'error' };
    return { kind: 'ok', list: (await res.json()) as RestyleList };
  } catch {
    return { kind: 'error' };
  }
}

export function RestylePhotos() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    void load().then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, [tries]);

  if (state.kind === 'loading') {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">불러오는 중…</span>
        <span aria-hidden className="skeleton block h-32 w-full rounded-panel bg-sunken" />
        <span aria-hidden className="skeleton block aspect-video w-full rounded-panel bg-sunken" />
      </div>
    );
  }
  if (state.kind === 'anon') return <p className="py-6 text-base text-muted">로그인한 사람만 볼 수 있어요.</p>;
  if (state.kind === 'forbidden') return <p className="py-6 text-base text-muted">허용되지 않은 계정이에요.</p>;
  if (state.kind === 'missing') return <p className="py-6 text-base text-muted">사진 시안이 아직 없어요.</p>;
  if (state.kind === 'error') {
    return (
      <p className="py-6 text-base text-ink-soft">
        불러오지 못했어요.{' '}
        <button type="button" className={textBtn} onClick={() => { setState({ kind: 'loading' }); setTries((n) => n + 1); }}>다시 불러오기</button>
      </p>
    );
  }

  const { concepts, rooms } = state.list;
  if (!rooms.length) return <p className="py-6 text-base text-muted">사진 시안이 아직 없어요.</p>;
  const names = new Map(concepts.map((c) => [c.id, c.name]));
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">벽 · 창 · 문은 그대로 두고 마감 · 가구 · 소품만 AI로 바꿔 그렸어요. 사진 위 동그라미를 좌우로 밀면 지금 모습과 겹쳐 볼 수 있어요.</p>

      <section aria-labelledby="restyle-concepts">
        <SectionHeader id="restyle-concepts" title="시안" summary={`${concepts.length}가지`} />
        <Card as="ul">
          {concepts.map((c) => (
            <li key={c.id} className={`${cardRowCls} px-4 py-3`}>
              <p className="text-base font-semibold text-ink">{c.name}</p>
              {c.about && <p className="mt-0.5 text-sm leading-relaxed text-muted">{c.about}</p>}
            </li>
          ))}
        </Card>
      </section>

      {rooms.map((r) => <RoomSection key={r.id} room={r} names={names} />)}

      <p className="mt-2 border-t border-line pt-4 text-center text-sm text-muted">AI가 그린 예시 — 실제 치수와 다를 수 있음</p>
    </div>
  );
}

function RoomSection({ room, names }: { room: RestyleRoom; names: Map<string, string> }) {
  const [pick, setPick] = useState(room.shots[0].concept);
  const shot = room.shots.find((s) => s.concept === pick) ?? room.shots[0];
  const name = (id: string) => names.get(id) ?? id;
  const headId = `restyle-room-${room.id}`;
  return (
    <section aria-labelledby={headId}>
      <SectionHeader id={headId} title={room.name} />
      {room.shots.length > 1 && (
        <div className="mb-3">
          <Segmented label={`${room.name} 시안 고르기`} value={shot.concept} onChange={setPick}
            options={room.shots.map((s) => ({ value: s.concept, label: name(s.concept) }))} />
        </div>
      )}
      <Compare before={photoUrl(room.original)} after={photoUrl(shot.file)}
        beforeAlt={`${room.name} 지금 모습`} afterAlt={`${room.name} ${name(shot.concept)} 시안`}
        afterLabel={name(shot.concept)} roomName={room.name} />
      {room.note && <p className="mt-2 text-sm leading-relaxed text-muted">{room.note}</p>}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Thumb src={photoUrl(room.original)} alt={`${room.name} 지금`} caption="지금" />
        {room.shots.map((s) => (
          <Thumb key={s.concept} src={photoUrl(s.file)} alt={`${room.name} ${name(s.concept)}`} caption={name(s.concept)} />
        ))}
      </div>
    </section>
  );
}

function Thumb({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="m-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" decoding="async" width={1600} height={900}
        className="block aspect-video h-auto w-full rounded-control bg-sunken object-cover" />
      <figcaption className="mt-1 text-sm text-muted">{caption}</figcaption>
    </figure>
  );
}

// 막대 밀어 비교: 왼쪽 = 지금, 오른쪽 = 시안. 마우스는 누른 자리로 바로 옮기고, 손가락은 옆으로 밀 때만 옮긴다(위아래로 밀면 화면이 스크롤된다).
// 키보드는 화면에 안 보이는 range 입력(← → Home End)으로, 포커스가 오면 동그라미에 고리가 생긴다.
function Compare({ before, after, beforeAlt, afterAlt, afterLabel, roomName }: {
  before: string; after: string; beforeAlt: string; afterAlt: string; afterLabel: string; roomName: string;
}) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; touch: boolean; moved: boolean; x: number; y: number } | null>(null);

  const moveTo = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return;
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const touch = e.pointerType !== 'mouse';
    drag.current = { id: e.pointerId, touch, moved: false, x: e.clientX, y: e.clientY };
    if (!touch) { e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); moveTo(e.clientX); }
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.touch && !d.moved) {
      // 손가락: 옆으로 8px 넘게 밀어야 막대를 잡는다. 위아래로 먼저 움직이면 스크롤로 보고 놓는다.
      const dx = Math.abs(e.clientX - d.x);
      const dy = Math.abs(e.clientY - d.y);
      if (dy > dx && dy > 4) { drag.current = null; return; }
      if (dx < 8) return;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    d.moved = true;
    moveTo(e.clientX);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.touch && !d.moved) moveTo(e.clientX); // 손가락으로 톡 누르면 그 자리로
    drag.current = null;
  };
  const onCancel = () => { drag.current = null; };

  const left = `${pos}%`;
  return (
    <div ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
      className="relative aspect-video w-full cursor-ew-resize touch-pan-y select-none overflow-hidden rounded-panel border border-line bg-sunken">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={before} alt={beforeAlt} draggable={false} decoding="async" width={1600} height={900}
        className="pointer-events-none absolute inset-0 size-full object-cover" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt={afterAlt} draggable={false} decoding="async" width={1600} height={900}
        className="pointer-events-none absolute inset-0 size-full object-cover" style={{ clipPath: `inset(0 0 0 ${left})` }} />
      <span aria-hidden className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-snow">지금</span>
      <span aria-hidden className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-snow">{afterLabel}</span>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 -ml-px w-0.5 bg-snow shadow-[0_0_0_1px_rgba(0,0,0,0.2)]" style={{ left }} />
      <input type="range" min={0} max={100} step={1} value={Math.round(pos)} onChange={(e) => setPos(Number(e.target.value))}
        aria-label={`${roomName} 지금과 ${afterLabel} 비교 위치`} aria-valuetext={`왼쪽 지금 ${Math.round(pos)}%, 오른쪽 ${afterLabel}`}
        className="peer sr-only" />
      <span aria-hidden
        className="keep-light pointer-events-none absolute top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-surface text-ink shadow-md peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-snow peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
        style={{ left }}>
        <i className="fas fa-arrows-left-right text-base" />
      </span>
    </div>
  );
}
