'use client';

import { useEffect, useRef, useState } from 'react';
import { useNetworkBusy } from '@/lib/client/busy';

// 화면 맨 위의 얇은 진행 막대. 진행 중인 요청이 하나라도 있으면 보이고, 다 끝나면 끝까지 채운 뒤 사라진다.
// 색은 흰색(on-accent): 늘 강조색 머리글 띠 위에 그려진다(DESIGN.md 2.2 (가)). 머리글이 없는 지인 답 화면(/q/)은 보통 폼 전송이라 이 막대가 뜨지 않는다.
// 200ms 안에 끝나는 짧은 요청에는 나타나지 않는다. 사진 올리기처럼 오래 걸리는 요청(slow)은 끝까지 가지 않고 천천히 찬다.
const SHOW_DELAY = 200;
const FADE_MS = 300;

export function TopLoader() {
  const { active, slow } = useNetworkBusy();
  const busy = active > 0;
  const [shown, setShown] = useState(false);     // 보이는 중(채우는 중 + 사라지는 동안)
  const [pct, setPct] = useState(0);
  const [leaving, setLeaving] = useState(false); // 끝까지 찬 뒤 사라지는 중
  const slowRef = useRef(slow);
  const showRef = useRef(false);
  useEffect(() => { slowRef.current = slow; }, [slow]);
  useEffect(() => { showRef.current = shown && !leaving; }, [shown, leaving]);

  useEffect(() => {
    if (busy) {
      let tick: ReturnType<typeof setInterval> | undefined;
      const start = () => {
        tick = setInterval(() => {
          // 점점 느려지며 목표에 다가간다(막대는 목표를 넘지 않는다)
          setPct((p) => { const goal = slowRef.current > 0 ? 70 : 90; return p + (goal - p) * (slowRef.current > 0 ? 0.04 : 0.12); });
        }, 200);
      };
      let delay: ReturnType<typeof setTimeout> | undefined;
      if (showRef.current) { start(); } // 이미 보이는 중(사라지기 전)에 새 요청이 오면 바로 이어 간다
      else delay = setTimeout(() => { setLeaving(false); setPct(10); setShown(true); start(); }, shown ? 0 : SHOW_DELAY);
      return () => { clearTimeout(delay); clearInterval(tick); };
    }
    if (!shown) return;
    // 다 끝남: 끝까지 채우고 잠깐 뒤 사라진다
    const t0 = setTimeout(() => setPct(100), 0);
    const t1 = setTimeout(() => setLeaving(true), 200);
    const t2 = setTimeout(() => { setShown(false); setLeaving(false); setPct(0); }, 200 + FADE_MS);
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); };
    // shown · leaving 은 이 효과가 스스로 바꾸므로 busy 가 바뀔 때만 다시 돈다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  return (
    <div aria-busy={busy} className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      {shown && (
        <div role="progressbar" aria-label="불러오는 중" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
          className={`h-full bg-on-accent transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none ${leaving ? 'opacity-0 !duration-300' : 'opacity-100'}`}
          style={{ width: `${pct}%` }} />
      )}
    </div>
  );
}
