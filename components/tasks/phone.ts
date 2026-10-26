// 할 일 메모 속 전화번호: 010-1234-5678 · 02-2148-1862 · 031-123-4567 · 1577-6119 꼴(하이픈 있는 것만 — 날짜 · 금액과 헷갈리지 않게).
const PHONE = /(?<![\d-])(0\d{1,2}-\d{3,4}-\d{4}|1[5-9]\d{2}-\d{4})(?![\d-])/g;

export const phonesIn = (text: string | null | undefined): string[] => [...(text ?? '').matchAll(PHONE)].map((m) => m[1]);
export const telHref = (phone: string) => `tel:${phone.replace(/-/g, '')}`;

/** 메모 첫 줄이 「전화」로 시작하면 메모 속 첫 번호(할 일 줄 오른쪽 전화 단추가 건다) */
export function callNumber(note: string | null | undefined): string | null {
  const firstLine = (note ?? '').split('\n')[0].trim();
  if (!/^전화/.test(firstLine)) return null;
  return phonesIn(note)[0] ?? null;
}

