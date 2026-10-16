// 저장값이 없을 때의 화면 모드. 사이트마다 이 한 줄만 다르다(외도민 'system', 지산 'light').
// layout.tsx 의 인라인 head 스크립트와 lib/client/theme.ts 가 같은 값을 쓴다.
export const DEFAULT_THEME_MODE: 'system' | 'light' | 'dark' = 'system';
