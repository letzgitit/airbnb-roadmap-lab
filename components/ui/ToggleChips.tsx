'use client';

// 여러 개를 켜고 끄는 거르기 칩(홈 「단계」의 단계 종류 준비 · 계약 · 중요 · 설비 · 행정 · 운영). 하나만 고르는 거르기는 Segmented.
//   모든 칩에 1px line 테두리(모서리 8px) — 안 켠 상태에서도 누르는 칸인 게 보이게.
//   아무것도 안 켰으면 = 전체: 모든 칩이 범례처럼 보인다(점 + ink-soft 400).
//   하나라도 켰으면: 켠 칩 = sunken 면 + ink 700, 안 켠 칩 = muted + 점 흐리게. 다시 누르면 끈다(다 끄면 전체로 돌아간다).
//   누르는 칸은 44px. 좌우 여백 6px 이라 여섯 개가 360px 폰에서도 한 줄에 든다(더 좁으면 다음 줄로).
//   fill: 줄 폭을 칩 수만큼 같은 너비로 나눠 왼쪽 끝부터 오른쪽 끝까지 채운다(글자 · 점 가운데). 칸이 글자보다 좁아지면 그 칸만
//   글자 폭을 지키고 나머지가 나눠 가진다(글자를 자르지 않음). 360px 보다 좁은 폰은 글자 12px · 안쪽 여백 0 으로 한 줄에 넣는다. 홈 「단계」 · 「달력」 탭의 단계 종류 줄(2026-10-29 「양옆으로 꽉 차게」).
export interface ToggleChip<T extends string> { value: T; label: string; /** 앞에 붙는 색 점 클래스(예: bg-[#a855f7]) */ dot?: string }

export function ToggleChips<T extends string>({ label, values, onChange, options, fill = false }: {
  label: string; values: T[]; onChange: (v: T[]) => void; options: ToggleChip<T>[];
  /** 줄 폭을 같은 너비로 나눠 꽉 채우기 */
  fill?: boolean;
}) {
  const any = values.length > 0;
  const flip = (v: T) => onChange(values.includes(v) ? values.filter((x) => x !== v) : options.map((o) => o.value).filter((x) => x === v || values.includes(x)));
  return (
    <div role="group" aria-label={label} className={fill ? 'grid gap-0.5' : 'flex flex-wrap gap-0.5'}
      style={fill ? { gridTemplateColumns: `repeat(${options.length}, minmax(max-content, 1fr))` } : undefined}>
      {options.map((o) => {
        const on = values.includes(o.value);
        const look = !any ? 'font-normal text-ink-soft' : on ? 'bg-sunken font-bold text-ink' : 'font-normal text-muted';
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => flip(o.value)}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-control border border-line text-sm transition-colors hover:bg-sunken ${fill ? 'justify-center px-1 max-[359px]:gap-0.5 max-[359px]:px-0 max-[359px]:text-xs' : 'px-1.5'} ${look}`}>
            {o.dot && <span className={`size-2 shrink-0 rounded-full ${o.dot} ${any && !on ? 'opacity-40' : ''}`} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
