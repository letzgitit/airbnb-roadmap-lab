export function todayStr(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return '방금';
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 마감일 표시: 날짜와 남은 날을 따로 돌려준다(화면에서 간격으로 나눠 보여 준다).
export function dueLabel(due: string | null, today: string): { date: string; rel: string; late: boolean } | null {
  if (!due) return null;
  const [, m, d] = due.split('-');
  const diff = Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
  const date = `${Number(m)}/${Number(d)}`;
  if (diff < 0) return { date, rel: `${-diff}일 지남`, late: true };
  if (diff === 0) return { date, rel: '오늘', late: false };
  return { date, rel: `D-${diff}`, late: false };
}

// 날짜 범위 표기는 「~」로 통일한다(데이터의 「Day 12-13」 → 「Day 12~13」)
export function dayLabel(day: string | number | null | undefined): string {
  return String(day ?? '').replace(/(\d)\s*[-–]\s*(\d)/g, '$1~$2');
}

// 화면에 보일 사람 이름: 시스템 계정 · 개발용 가짜 로그인 이름을 사람 말로 바꾼다(실제 이름은 MEMBER_NAMES 에서 온다).
const NAME_ALIAS: Record<string, string> = { claude: '클로드', me: '남편', wife: '아내' };
export function displayName(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  if (!n) return '';
  return NAME_ALIAS[n.toLowerCase()] ?? n;
}

// 이름 뒤에 붙는 「이/가」: 받침이 있으면 이, 없으면 가
export function withGa(name: string | null | undefined): string {
  const n = displayName(name);
  if (!n) return '';
  const code = n.charCodeAt(n.length - 1);
  const jong = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 : 0;
  return `${n}${jong ? '이' : '가'}`;
}
