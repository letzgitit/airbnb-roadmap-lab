// 단추 · 입력칸 모양(DESIGN.md 8장). components/progress/bits.tsx 가 같은 이름으로 다시 내보낸다 —
// ProgressProvider(확인 창 · 충돌 창)도 쓰는데, bits 는 ProgressProvider 를 불러 쓰므로 고리가 생기지 않게 여기 따로 둔다.
// 데일리 결: 모서리 10 · 글자 15/700(데일리 .cta) · 그림자 없음. 주 단추는 검정 면 + 흰 글자(다크는 반대). 형광으로 칠한 단추는 없다.

const btnBase = 'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap min-h-11 px-4 py-2 rounded-control text-cta font-bold transition-colors';
/** 주 단추: 검정 면(다크는 흰 면 + 어두운 글자). 저장 · 추가 같은 폼 단추 */
export const btnPrimary = `${btnBase} bg-accent text-on-accent hover:bg-accent-hover disabled:bg-strong disabled:text-faint disabled:hover:bg-strong`;
/** 보조 단추: 옅은 면 */
export const btnGhost = `${btnBase} bg-sunken text-ink hover:bg-strong disabled:text-faint disabled:hover:bg-sunken`;
/** 테두리 단추: 1px 검정 테두리(줄 폭을 채우는 두 번째 단추) */
export const btnOutline = `${btnBase} border border-ink text-ink hover:bg-sunken`;
/** 위험 단추: 빨강 면(지우기 확인) */
export const btnDanger = `${btnBase} bg-danger text-snow hover:bg-danger-hover disabled:bg-strong disabled:text-faint`;
/** 예전 포인트 단추(2026-10-28 빨강을 뺐다 — 주 단추와 같은 검정 면, 줄 폭 꽉). 새로 쓰지 않는다 */
export const btnBrand = `${btnBase} w-full min-h-12 bg-accent text-on-accent hover:bg-accent-hover`;
/** 작은 글자 단추(「전체 보기」「되살리기」 등): 밑줄 검정 글자. 글자는 작아도 누르는 칸은 44px */
export const textBtn = 'inline-flex items-center min-h-11 px-2 -mx-2 text-sm font-semibold text-ink underline underline-offset-[3px] hover:text-ink-soft';

/** 입력칸: 글자 18px(아이폰이 16px 미만 입력칸을 누르면 화면을 확대한다) */
export const inputCls = 'w-full min-h-11 rounded-control border border-line-strong bg-surface px-3 py-2 text-lg font-medium text-ink placeholder:font-normal placeholder:text-faint focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink';
/** 날짜 칸: 입력칸과 같은 모양이되 가로로 꽉 차지 않는다 */
export const dateCls = 'min-h-11 rounded-control border border-line-strong bg-surface px-3 py-2 text-lg font-medium text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink';
/** 그 자리에서 펼쳐지는 입력 폼(추가 · 고치기)의 바탕: 각진 흰 면 + 1px 테두리 */
export const composerCls = 'my-2 w-full space-y-2 border border-line-strong bg-surface p-4';
/** 「＋ ○○」 글자 단추(15/700 + ＋ 선 아이콘, 44px): 새 홈 블록 맨 아래 단추 줄 「＋ 할 일 · ＋ 메모 · ＋ 사진」 · 갤러리 「＋ 올리기」 · 할 일 메모 「＋ 사진」 — 한 모양 */
export const addBtnCls = 'inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-cta font-bold text-ink transition-colors hover:bg-sunken';
