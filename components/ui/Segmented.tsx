'use client';

// 목록 필터: 칸 묶음 한 가지 모양(첫 칸은 늘 「전체」). 2~5칸, 넘치면 줄바꿈 대신 가로로 밀린다. 6개 이상이면 <select> 를 쓴다.
// 고른 칸 = 올라온 면(raised: 밝은 화면 흰색, 어두운 화면은 바탕 막대보다 밝은 #2e3035) + ink 700, 아닌 칸 = muted 600, 개수는 이름 뒤 muted 400. dot = 새 소식 강조색 점.
export interface SegmentedOption<T extends string> { value: T; label: string; count?: number; dot?: boolean }

export function Segmented<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: SegmentedOption<T>[];
}) {
  return (
    <div role="group" aria-label={label}
      className="flex gap-1 overflow-x-auto rounded-control bg-sunken p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
            className={`flex min-h-11 flex-1 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-control px-3 text-base transition-colors ${on ? 'bg-raised font-semibold text-ink ring-1 ring-line-strong' : 'font-semibold text-muted hover:text-ink'}`}>
            <span>{o.label}</span>
            {o.dot && <><span className="size-1.5 rounded-full bg-accent-ink" aria-hidden /><span className="sr-only">(새 소식)</span></>}
            {o.count != null && <span className="font-normal text-muted">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
