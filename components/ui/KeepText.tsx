import { Fragment, type ReactNode } from 'react';

// 할 일 제목 줄바꿈: 괄호 날짜 · 숫자 덩어리(「(2026-01)」 「10/28~10/30」 「010-1234-5678」)가 중간에서 꺾이지 않게
// 그 덩어리만 한 줄(nowrap)로 감싼다. 낱말 중간에서 안 꺾이는 것은 바깥 글자 칸의 break-keep 이 맡는다.
const CHUNK = /\([^()\s]{1,16}\)|\d+(?:[-./:~]\d+)+/g;

export function KeepText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CHUNK)) {
    const i = m.index ?? 0;
    if (i > last) out.push(<Fragment key={`t${i}`}>{text.slice(last, i)}</Fragment>);
    out.push(<span key={`k${i}`} className="whitespace-nowrap">{m[0]}</span>);
    last = i + m[0].length;
  }
  if (!out.length) return <>{text}</>;
  if (last < text.length) out.push(<Fragment key="end">{text.slice(last)}</Fragment>);
  return <>{out}</>;
}
