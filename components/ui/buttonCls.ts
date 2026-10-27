// 단추 · 입력칸 모양(DESIGN.md 8장). components/progress/bits.tsx 가 같은 이름으로 다시 내보낸다 —
// ProgressProvider(확인 창 · 충돌 창)도 쓰는데, bits 는 ProgressProvider 를 불러 쓰므로 고리가 생기지 않게 여기 따로 둔다.
// 시안 B: 모서리 8 · 글자 16/600 · 그림자 없음. 빨강(brand)은 한 화면 주 단추 한 곳(btnBrand)에만 — 나머지 주 단추는 검정(ink).

const btnBase = 'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap min-h-11 px-4 py-2 rounded-control text-base font-semibold transition-colors';
/** 주 단추: 검정 면(다크는 흰 면 + 어두운 글자). 저장 · 추가 같은 폼 단추 */
export const btnPrimary = `${btnBase} bg-accent text-on-accent hover:bg-accent-hover disabled:bg-strong disabled:text-faint disabled:hover:bg-strong`;
/** 보조 단추: 옅은 면 */
export const btnGhost = `${btnBase} bg-sunken text-ink hover:bg-strong disabled:text-faint disabled:hover:bg-sunken`;
/** 테두리 단추: 1px 검정 테두리(「＋ 문서 올리기」 · 「접기」처럼 줄 폭을 꽉 채우는 두 번째 단추) */
export const btnOutline = `${btnBase} min-h-12 border border-ink text-ink hover:bg-sunken`;
/** 위험 단추: 빨강 면(지우기 확인) */
export const btnDanger = `${btnBase} bg-danger text-snow hover:bg-danger-hover disabled:bg-strong disabled:text-faint`;
/** 포인트 빨강 단추: 한 화면에 하나(새 홈 「남은 일 보기」). 높이 52 · 글자 20/700 */
export const btnBrand = 'flex w-full min-h-13 items-center justify-center rounded-control bg-brand px-4 text-xl font-bold text-on-brand transition-colors hover:bg-brand-hover';
/** 작은 글자 단추(「전체 보기」「되살리기」 등): 밑줄 검정 글자. 글자는 작아도 누르는 칸은 44px */
export const textBtn = 'inline-flex items-center min-h-11 px-2 -mx-2 text-sm font-semibold text-ink underline underline-offset-[3px] hover:text-ink-soft';

/** 입력칸: 글자 18px(아이폰이 16px 미만 입력칸을 누르면 화면을 확대한다) */
export const inputCls = 'w-full min-h-11 rounded-control border border-line-strong bg-surface px-3 py-2 text-lg font-medium text-ink placeholder:font-normal placeholder:text-faint focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink';
/** 날짜 칸: 입력칸과 같은 모양이되 가로로 꽉 차지 않는다 */
export const dateCls = 'min-h-11 rounded-control border border-line-strong bg-surface px-3 py-2 text-lg font-medium text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink';
/** 그 자리에서 펼쳐지는 입력 폼(추가 · 고치기)의 바탕 */
export const composerCls = 'my-2 w-full space-y-2 rounded-panel border border-line-strong bg-surface p-4';
