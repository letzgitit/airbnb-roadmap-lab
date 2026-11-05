// 받는 파일 이름 만들기(순수 함수 — node --test 로 확인). 서버는 파일 이름에 설명을 싣지 않으므로(개인정보) 받는 화면이 이름을 붙인다.
// 모양: 「묶음이나 단계 이름-설명 앞부분-날짜.확장자」. 비어 있는 조각은 건너뛴다.

// 파일 이름에 못 쓰는 글자(윈도 · 맥 · 아이폰 공통) + 제어 문자
const BAD = /[\\/:*?"<>|\u0000-\u001f\u007f]+/g;

/** 한 조각을 파일 이름에 쓸 수 있게 다듬는다: 못 쓰는 글자는 빼고, 공백은 하나로, 앞뒤 공백 · 점은 자르고, max 글자까지만 */
export function cleanPart(s: string, max = 24): string {
  const t = s.replace(BAD, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '').trim();
  return Array.from(t).slice(0, max).join('').trim();
}

/** 「2026-10-14T13:05:22」 → 「2026-10-14」. 날짜 모양이 아니면 빈 글자 */
export function datePart(t: string | null | undefined): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(t ?? '');
  return m ? m[1] : '';
}

export function buildDownloadName(o: { label?: string; caption?: string; date?: string | null; ext: 'jpg' | 'pdf' }): string {
  const label = cleanPart(o.label ?? '', 24);
  const caption = cleanPart(o.caption ?? '', 20);
  // 설명이 묶음 이름과 같으면 한 번만
  const parts = [label, caption === label ? '' : caption, datePart(o.date)].filter(Boolean);
  return `${parts.length ? parts.join('-') : '사진'}.${o.ext}`;
}
