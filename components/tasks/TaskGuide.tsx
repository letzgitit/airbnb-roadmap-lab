'use client';

import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sheet } from '@/components/Sheet';
import { AutoTextarea, inputCls, textBtn } from '@/components/progress/bits';
import { LineIcon } from '@/components/ui/LineIcon';
import { parseGuide, type Block, type Inline } from './guide-md';

/**
 * 할 일 참고(설명서) — 할 일 데이터의 guide(마크다운, ≤6000자).
 * - GuideButton: 할 일 줄 제목 옆 물음표 단추(44px, 선 아이콘, 강조색 없음). 누르면 폰 = 아래에서 올라오는 시트, PC = 가운데 창(공용 Sheet).
 *   열 때 기록을 하나 쌓아 폰의 뒤로 가기가 시트를 닫는다. 스크롤 잠금 · Esc · 포커스 복귀는 Sheet 가 한다.
 * - GuideView: 설명서 읽기 모양. 본문 17px · 행간 1.7 · 문단 사이 16px · 한 줄 최대 36em.
 *   소제목(## = 20/600, ### = 18/600), 점 · 번호 목록, 굵게, 링크(새 창 + 옆에 도메인), > 인용 = 「알아 두기」 옅은 면 상자, 표.
 * - GuideField: 고치는 폼 안 「참고(설명서)」 칸. 처음엔 접혀 있고 펼치면 큰 입력칸 + 쓰는 법 한 줄 + 미리 보기.
 */
export const GUIDE_MAX = 6000;

// ── 읽기 ──
function Inl({ c }: { c: Inline[] }) {
  return (
    <>
      {c.map((x, i) => {
        if (x.t === 'text') return <Fragment key={i}>{x.v}</Fragment>;
        if (x.t === 'br') return <br key={i} />;
        if (x.t === 'b') return <strong key={i} className="font-semibold text-ink"><Inl c={x.c} /></strong>;
        const ext = /^https?:/i.test(x.href);
        // 도메인은 링크 밖에 작게(밑줄이 옮겨 붙지 않게)
        return (
          <Fragment key={i}>
            <a href={x.href} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="font-medium text-ink underline decoration-1 underline-offset-[3px] [overflow-wrap:anywhere] hover:text-ink-soft">
              <Inl c={x.c} />
              {ext && <span className="sr-only"> (새 창에서 열림)</span>}
            </a>
            {x.host && <span className="ml-1 whitespace-nowrap text-sm font-normal text-muted">{x.host}</span>}
          </Fragment>
        );
      })}
    </>
  );
}

function Blocks({ blocks, inBox = false }: { blocks: Block[]; inBox?: boolean }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h':
            return b.level === 1
              ? <h3 key={i} className="mb-3 mt-9 text-xl font-semibold text-ink first:mt-0">{<Inl c={b.c} />}</h3>
              : <h4 key={i} className="mb-2 mt-6 text-lg font-semibold text-ink first:mt-0">{<Inl c={b.c} />}</h4>;
          case 'p':
            return <p key={i} className="mb-4 last:mb-0"><Inl c={b.c} /></p>;
          case 'ul':
            return (
              <ul key={i} className="mb-4 list-disc space-y-2 pl-6 marker:text-muted last:mb-0">
                {b.items.map((it, j) => <li key={j} className="pl-1"><Inl c={it} /></li>)}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} start={b.start} className="mb-4 list-decimal space-y-2 pl-7 marker:font-semibold marker:text-ink last:mb-0">
                {b.items.map((it, j) => <li key={j} className="pl-1"><Inl c={it} /></li>)}
              </ol>
            );
          case 'quote': {
            // 첫 문단이 굵은 글씨로 시작하면 그게 상자 이름, 아니면 「알아 두기」를 붙인다
            const first = b.blocks[0];
            const named = first?.t === 'p' && first.c[0]?.t === 'b';
            return (
              <aside key={i} className="mb-5 rounded-panel bg-sunken px-5 py-4 last:mb-0">
                {!named && !inBox && <p className="mb-1.5 text-sm font-semibold text-muted">알아 두기</p>}
                <Blocks blocks={b.blocks} inBox />
              </aside>
            );
          }
          case 'table':
            return (
              <div key={i} className="mb-5 overflow-x-auto last:mb-0">
                <table className="w-full border-collapse text-left text-base leading-normal">
                  {b.head && (
                    <thead>
                      <tr>{b.head.map((c, j) => <th key={j} scope="col" className="border-b border-line-strong py-2 pr-4 text-sm font-semibold text-muted"><Inl c={c} /></th>)}</tr>
                    </thead>
                  )}
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>{r.map((c, k) => <td key={k} className="border-b border-line py-2.5 pr-4 align-top">{<Inl c={c} />}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'hr':
            return <hr key={i} className="my-7 border-line" />;
        }
      })}
    </>
  );
}

export function GuideView({ text }: { text: string }) {
  const blocks = parseGuide(text);
  if (blocks.length === 0) return <p className="text-base text-muted">아직 적힌 설명이 없어요.</p>;
  // 본문 17px(긴 글 읽기 — DESIGN.md 3.1 예외) · 행간 1.7 · 낱말 중간에서 끊지 않음
  return (
    <div className="max-w-[36em] break-keep text-[17px] font-normal leading-[1.7] text-ink-soft">
      <Blocks blocks={blocks} />
    </div>
  );
}

// ── 시트 ──
/** 열고 닫기 + 뒤로 가기: 열 때 기록 한 칸을 쌓고, 뒤로 가기(popstate)면 닫는다. 단추 · Esc 로 닫으면 쌓은 칸을 되돌린다 */
function useGuideSheet() {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const pushed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finish = useCallback(() => {
    setShown(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 300);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!open) return;
    const onPop = () => { if (pushed.current) { pushed.current = false; finish(); } };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open, finish]);
  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    try {
      // Next 가 쓰는 기록 값은 그대로 두고 표시만 더한다(주소는 그대로)
      window.history.pushState({ ...(window.history.state ?? {}), guideSheet: 1 }, '');
      pushed.current = true;
    } catch { pushed.current = false; }
  };
  const close = () => {
    if (pushed.current && window.history.state?.guideSheet) window.history.back(); // popstate 가 닫는다
    else { pushed.current = false; finish(); }
  };
  return { open, shown, show, close };
}

export function GuideButton({ title, guide, className = '' }: { title: string; guide: string; className?: string }) {
  const s = useGuideSheet();
  return (
    <>
      <button type="button" aria-label={`${title} 참고 보기`} aria-haspopup="dialog" onClick={s.show}
        className={`flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-strong ${className}`}>
        <LineIcon name="help" className="size-5" />
      </button>
      {s.open && createPortal(
        <Sheet open={s.open} shown={s.shown} onClose={s.close}
          eyebrow={<span className="text-sm font-semibold text-muted">참고</span>} title={title}>
          <div className="px-6 pb-[calc(40px+env(safe-area-inset-bottom))] pt-6">
            <GuideView text={guide} />
          </div>
        </Sheet>,
        document.body,
      )}
    </>
  );
}

// ── 쓰기(고치는 폼 안) ──
export function GuideField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const n = value.trim().length;
  return (
    <div className="rounded-control border border-line-strong">
      <button type="button" aria-expanded={open} aria-controls={`${uid}-g`} onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left">
        <LineIcon name="help" className="size-5 text-ink-soft" />
        <span className="text-base font-semibold text-ink">참고(설명서)</span>
        <span className="text-sm font-normal text-muted">{n ? `${n.toLocaleString()}자` : '없음'}</span>
        <LineIcon name="chevron" className={`ml-auto size-5 text-faint transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open && (
        <div id={`${uid}-g`} className="space-y-2 border-t border-line px-3 pb-3 pt-2">
          <p className="text-sm font-normal leading-relaxed text-muted">
            이 일을 왜 · 어떻게 하는지 적어 두면 줄의 물음표를 눌러 볼 수 있어요. 줄 맨 앞에 <b className="font-semibold text-ink-soft">## </b>을 쓰면 소제목,
            <b className="font-semibold text-ink-soft"> - </b>는 점 목록, <b className="font-semibold text-ink-soft">1. </b>은 번호 목록,
            <b className="font-semibold text-ink-soft"> &gt; </b>는 「알아 두기」 상자예요. <b className="font-semibold text-ink-soft">**굵게**</b>도 돼요.
          </p>
          {preview ? (
            <div className="rounded-control bg-sunken px-4 py-3"><GuideView text={value} /></div>
          ) : (
            <AutoTextarea className={`${inputCls} leading-relaxed`} rows={8} value={value} maxLength={GUIDE_MAX} aria-label="참고(설명서)"
              placeholder={'## 왜 해야 하나요\n…\n\n## 어떻게 하나요\n1. …\n2. …'} onChange={(e) => onChange(e.target.value)} />
          )}
          <div className="flex items-center justify-between gap-3">
            <button type="button" className={`${textBtn} mx-0`} onClick={() => setPreview((v) => !v)}>{preview ? '고치기로 돌아가기' : '미리 보기'}</button>
            <span className="text-sm tabular-nums text-muted">{value.length.toLocaleString()} / {GUIDE_MAX.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
