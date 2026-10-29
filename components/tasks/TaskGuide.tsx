'use client';

import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sheet } from '@/components/Sheet';
import { AutoTextarea, inputCls, textBtn } from '@/components/progress/bits';
import { LineIcon } from '@/components/ui/LineIcon';
import { parseGuide, plainText, type Block, type Inline } from './guide-md';
import { fetchGuide } from './guides-client';

/**
 * 할 일 설명서 — 현황 문서 밖에 따로 저장한 마크다운(≤6000자, lib/core/guides.ts · 화면 쪽 guides-client.ts). 화면 이름은 「설명서」 하나.
 * - GuideButton: 할 일 제목 글 바로 뒤에 붙는 물음표 단추(아이콘 20, 누르는 칸 44 — 음수 여백으로 줄 높이를 늘리지 않음, 강조색 없음).
 *   누르면 폰 = 아래에서 올라오는 시트, PC = 가운데 창(공용 Sheet, 머리 · 본문 양옆 24px).
 *   열 때 기록을 하나 쌓아 폰의 뒤로 가기가 시트를 닫는다. 스크롤 잠금 · Esc · 포커스 복귀는 Sheet 가 한다.
 * - GuideView: 설명서 읽기 모양. 본문 17px · 행간 1.7 · 문단 사이 16px · 한 줄 최대 36em.
 *   소제목(## = 20/600, ### = 18/600), 점 · 번호 목록, 굵게, 링크(새 창), > 인용 = 「알아 두기」 옅은 면 상자, 표.
 *   링크 글자에 도메인이 안 보이면 그 문단 끝에 「(gov.kr)」를 한 번 붙인다(문장 가운데에는 넣지 않는다).
 * - GuideField: 고치는 폼 안 「설명서」 칸. 처음엔 접혀 있고 펼치면 큰 입력칸 + 쉬운 안내 한 줄 + 「미리 보기」(실제 시트로 연다).
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
        return (
          <a key={i} href={x.href} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="font-medium text-ink underline decoration-1 underline-offset-[3px] [overflow-wrap:anywhere] hover:text-ink-soft">
            <Inl c={x.c} />
            {ext && <span className="sr-only"> (새 창에서 열림)</span>}
          </a>
        );
      })}
    </>
  );
}

/** 한 문단(목록 한 줄) 안 링크 중 글자에 도메인이 안 보이는 것의 도메인(겹치면 한 번) */
function hiddenHosts(c: Inline[], out: string[] = []): string[] {
  for (const x of c) {
    if (x.t === 'a') { if (x.host && !plainText(x.c).includes(x.host) && !out.includes(x.host)) out.push(x.host); }
    else if (x.t === 'b') hiddenHosts(x.c, out);
  }
  return out;
}
/** 문단 끝 「(gov.kr)」 */
function Hosts({ c }: { c: Inline[] }) {
  const hs = hiddenHosts(c);
  return hs.length ? <span className="whitespace-nowrap text-sm font-normal text-muted"> ({hs.join(', ')})</span> : null;
}

function Blocks({ blocks, inBox = false }: { blocks: Block[]; inBox?: boolean }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h':
            return b.level === 1
              ? <h3 key={i} className="mb-3 mt-9 text-xl font-semibold text-ink first:mt-0"><Inl c={b.c} /></h3>
              : <h4 key={i} className="mb-2 mt-6 text-lg font-semibold text-ink first:mt-0"><Inl c={b.c} /></h4>;
          case 'p':
            return <p key={i} className="mb-4 last:mb-0"><Inl c={b.c} /><Hosts c={b.c} /></p>;
          case 'ul':
            return (
              <ul key={i} className="mb-4 list-disc space-y-2 pl-6 marker:text-muted last:mb-0">
                {b.items.map((it, j) => <li key={j} className="pl-1"><Inl c={it} /><Hosts c={it} /></li>)}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} start={b.start} className="mb-4 list-decimal space-y-2 pl-7 marker:font-semibold marker:text-ink last:mb-0">
                {b.items.map((it, j) => <li key={j} className="pl-1"><Inl c={it} /><Hosts c={it} /></li>)}
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
                      <tr key={j}>{r.map((c, k) => <td key={k} className="border-b border-line py-2.5 pr-4 align-top"><Inl c={c} /></td>)}</tr>
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
  if (blocks.length === 0) return <p className="text-base text-muted">아직 적힌 도움말이 없어요.</p>;
  // 본문 17px(긴 글 읽기 — DESIGN.md 3.1 예외) · 행간 1.7 · 낱말 중간에서 끊지 않음
  return (
    <div className="max-w-[36em] break-keep text-[17px] font-normal leading-[1.7] text-ink-soft">
      <Blocks blocks={blocks} />
    </div>
  );
}

// ── 시트 ──
/**
 * 열고 닫기. history = true 면 열 때 기록 한 칸을 쌓고 뒤로 가기(popstate)로 닫는다(단추 · Esc 로 닫으면 쌓은 칸을 되돌린다).
 * 고치는 폼의 미리 보기는 기록을 쌓지 않는다(쓰던 폼이 있는 채로 뒤로 가기 흐름을 건드리지 않게).
 */
function useGuideSheet(history: boolean) {
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
    if (!open || !history) return;
    const onPop = () => { if (pushed.current) { pushed.current = false; finish(); } };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open, history, finish]);
  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    if (!history) return;
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

/** guide = null 이면 아직 받는 중, error 가 있으면 그 문장 */
function GuideSheet({ s, title, guide, error = null, preview = false }: { s: ReturnType<typeof useGuideSheet>; title: string; guide: string | null; error?: string | null; preview?: boolean }) {
  if (!s.open) return null;
  // React 이벤트는 포털을 지나 폼까지 올라간다 — 시트 안 Esc 가 고치는 폼의 「취소」로 번지지 않게 여기서 막고 시트만 닫는다
  return createPortal(
    <div onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); s.close(); } else e.stopPropagation(); }}>
      <Sheet open={s.open} shown={s.shown} onClose={s.close} wide
        eyebrow={<span className="text-sm font-semibold text-muted">{preview ? '도움말 미리 보기' : '도움말'}</span>} title={title}>
        <div className="px-6 pb-[calc(40px+env(safe-area-inset-bottom))] pt-6" aria-busy={guide === null && !error}>
          {error ? <p role="alert" className="text-base text-danger-ink">{error}</p>
            : guide === null ? <p className="text-base text-muted">불러오는 중…</p>
            : <GuideView text={guide} />}
        </div>
      </Sheet>
    </div>,
    document.body,
  );
}

/** 제목 글 바로 뒤에 붙는 물음표(inline). 누르는 칸 44 는 음수 여백으로 — 줄 높이 · 글 흐름을 늘리지 않는다 */
// 본문은 누를 때 받는다(설명서는 현황 문서 밖 — guides-client). version 이 그대로면 한 번 받은 글을 다시 쓴다
// openKey = 바깥에서 열어 달라는 신호(0 보다 크게 바뀔 때마다 한 번 연다 — 검색에서 도움말에서만 걸린 할 일로 왔을 때)
export function GuideButton({ taskId, title, version, openKey = 0 }: { taskId: string; title: string; version: number; openKey?: number }) {
  const s = useGuideSheet(true);
  const [body, setBody] = useState<{ v: number; md: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = () => {
    s.show();
    if (body?.v === version) return;
    setError(null);
    setBody(null);
    fetchGuide(taskId)
      .then((g) => setBody({ v: version, md: g?.md ?? '' }))
      .catch(() => setError('도움말을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.'));
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 바깥 신호가 바뀔 때마다 한 번 연다
    if (openKey > 0) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openKey(신호)에만 반응한다
  }, [openKey]);
  const guide = body?.v === version ? body.md : null;
  return (
    <>
      <button type="button" aria-label={`${title} 도움말 보기`} aria-haspopup="dialog" onClick={open}
        className="-my-2.5 -mr-3 ml-[-6px] inline-flex size-11 items-center justify-center rounded-full align-middle text-ink-soft transition-colors hover:bg-strong">
        <LineIcon name="help" className="size-5" />
      </button>
      <GuideSheet s={s} title={title} guide={guide} error={error} />
    </>
  );
}

// ── 쓰기(고치는 폼 안) ──
/** loading = 설명서 본문을 받는 중(그동안은 쓰지 못한다), error = 받기 실패 문장 */
export function GuideField({ value, onChange, title, loading = false, error = null }: {
  value: string; onChange: (v: string) => void; title: string; loading?: boolean; error?: string | null;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const s = useGuideSheet(false);
  const n = value.trim().length;
  return (
    <div className="rounded-control border border-line-strong">
      <button type="button" aria-expanded={open} aria-controls={`${uid}-g`} onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left">
        <LineIcon name="help" className="size-5 text-ink-soft" />
        <span className="text-base font-semibold text-ink">도움말</span>
        <span className="text-sm font-normal text-muted">{loading ? '불러오는 중…' : n ? `${n.toLocaleString()}자` : '없음'}</span>
        <LineIcon name="chevron" stroke={2} className={`ml-auto size-5 text-ink-soft transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open && (
        <div id={`${uid}-g`} className="space-y-2 border-t border-line px-3 pb-3 pt-2">
          <p className="text-sm font-normal leading-relaxed text-muted">
            이 일을 왜 · 어떻게 하는지 적어 두면 할 일 옆 물음표로 볼 수 있어요. 줄 앞에 ## 를 쓰면 소제목, - 를 쓰면 목록이 돼요.
          </p>
          {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
          <AutoTextarea className={`${inputCls} leading-relaxed`} rows={8} value={value} maxLength={GUIDE_MAX} aria-label="도움말" disabled={loading || !!error}
            placeholder={'## 왜 해야 하나요\n…\n\n## 어떻게 하나요\n- …\n- …'} onChange={(e) => onChange(e.target.value)} />
          <div className="flex items-center justify-between gap-3">
            <button type="button" className={`${textBtn} mx-0`} aria-haspopup="dialog" onClick={s.show}>미리 보기</button>
            <span className="text-sm tabular-nums text-muted">{value.length.toLocaleString()} / {GUIDE_MAX.toLocaleString()}</span>
          </div>
        </div>
      )}
      <GuideSheet s={s} title={title || '새 할 일'} guide={value} preview />
    </div>
  );
}
