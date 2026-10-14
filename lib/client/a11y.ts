import type { KeyboardEvent } from 'react';

// role="button" 으로 만든 행: Enter·Space 둘 다 누름으로 처리한다(Space 는 화면이 내려가지 않게 막는다).
export const onActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};
