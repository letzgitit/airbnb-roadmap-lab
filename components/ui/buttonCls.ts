// 단추 · 입력칸 모양(DESIGN.md 8장). components/progress/bits.tsx 가 같은 이름으로 다시 내보낸다 —
// ProgressProvider(확인 창 · 충돌 창)도 쓰는데, bits 는 ProgressProvider 를 불러 쓰므로 고리가 생기지 않게 여기 따로 둔다.

const btnBase = 'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap min-h-11 px-4 py-2 rounded-control text-base font-bold transition-colors';
/** 주 단추: 강조색 면(한 줄에 하나) */
export const btnPrimary = `${btnBase} bg-accent text-on-accent hover:bg-accent-hover disabled:bg-sunken disabled:text-faint disabled:hover:bg-sunken`;
/** 보조 단추: 들어간 면 */
export const btnGhost = `${btnBase} bg-sunken text-ink-soft hover:bg-line disabled:text-faint disabled:hover:bg-sunken`;
/** 위험 단추: 빨강 면(지우기 확인) */
export const btnDanger = `${btnBase} bg-danger text-on-accent hover:bg-danger-hover disabled:bg-sunken disabled:text-faint`;
/** 작은 글자 단추(「전체 보기」「되살리기」 등): 글자는 작아도 누르는 칸은 44px */
export const textBtn = 'inline-flex items-center min-h-11 px-2 -mx-2 text-sm font-bold text-accent-ink hover:underline';

/** 입력칸: 글자 17px(아이폰이 16px 미만 입력칸을 누르면 화면을 확대한다) */
export const inputCls = 'w-full min-h-11 rounded-control border border-line-strong bg-surface px-3 py-2 text-lg font-semibold text-ink placeholder:font-normal placeholder:text-faint focus:border-accent-ink focus:outline-none focus:ring-1 focus:ring-accent-ink';
/** 날짜 칸: 입력칸과 같은 모양이되 가로로 꽉 차지 않는다 */
export const dateCls = 'min-h-11 rounded-control border border-line-strong bg-surface px-3 py-2 text-lg font-semibold text-ink focus:border-accent-ink focus:outline-none focus:ring-1 focus:ring-accent-ink';
/** 그 자리에서 펼쳐지는 입력 폼(추가 · 고치기)의 바탕 */
export const composerCls = 'my-2 w-full space-y-2 rounded-control border border-line-strong bg-sunken p-3';
