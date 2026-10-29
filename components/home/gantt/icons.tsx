// 간트 선 아이콘(시안과 같은 모양, 장식 없음). 글자색(currentColor)을 따른다.
const P = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const Chev = () => <svg {...P} strokeWidth={2.4}><path d="M6 9l6 6 6-6" /></svg>;
export const Check = () => <svg {...P} strokeWidth={3.2}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const Plus = () => <svg {...P} strokeWidth={2.6}><path d="M12 5v14M5 12h14" /></svg>;
export const Pen = () => <svg {...P} strokeWidth={2}><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M14.5 7.5l3 3" /></svg>;
export const Trash = () => <svg {...P} strokeWidth={2}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>;
export const FoldAll = () => <svg {...P} strokeWidth={2.2}><path d="M4 12h16M12 3v5.5M9 5.5l3 3 3-3M12 21v-5.5M9 18.5l3-3 3 3" /></svg>;
export const OpenAll = () => <svg {...P} strokeWidth={2.2}><path d="M4 12h16M12 8.5V3M9 6l3-3 3 3M12 15.5V21M9 18l3 3 3-3" /></svg>;
