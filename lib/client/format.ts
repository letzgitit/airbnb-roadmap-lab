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

// 「2026-10-17」 → 「10/17」
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

// 마감까지 남은 날수(오늘 = 0, 지났으면 음수). 할 일 줄의 날짜 표시와 타임라인의 「오늘 · 기한 지남」 개수가 같은 기준을 쓰게 한다.
function dayDiff(due: string, today: string): number {
  return Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
}

// 마감일 표시: 날짜와 남은 날을 따로 돌려준다(화면에서 간격으로 나눠 보여 준다).
export function dueLabel(due: string | null, today: string): { date: string; rel: string; late: boolean } | null {
  if (!due) return null;
  const [, m, d] = due.split('-');
  const diff = dayDiff(due, today);
  const date = `${Number(m)}/${Number(d)}`;
  if (diff < 0) return { date, rel: `${-diff}일 지남`, late: true };
  if (diff === 0) return { date, rel: '오늘', late: false };
  return { date, rel: `D-${diff}`, late: false };
}

// 열린 할 일의 마감 상태: 기한 지남 · 오늘 · (그 밖 = 마감 없음 또는 아직 남음 → null)
export function dueState(due: string | null, today: string): 'late' | 'today' | null {
  if (!due) return null;
  const diff = dayDiff(due, today);
  return diff < 0 ? 'late' : diff === 0 ? 'today' : null;
}

// 단계 안내의 일반 일정(시작한 날부터 센 날수)을 우리말로: 데이터의 「Day 12-13」 → 「12~13일째」, 「Day 5」 → 「5일째」.
// 화면은 1부터 센다 — 데이터의 「Day 0」(시작하는 날)은 「1일째」(「Day 0-12」 → 「1~12일째」).
// 콘텐츠(content/steps.json)는 그대로 두고 화면에서만 바꿔 보인다. 숫자가 없는 글은 그대로 돌려준다.
export function dayLabel(day: string | number | null | undefined): string {
  const s = String(day ?? '').trim();
  const nums = s.match(/\d+/g);
  if (!nums) return s;
  return nums.length >= 2 ? dayRangeLabel(Number(nums[0]), Number(nums[1])) : `${Math.max(1, Number(nums[0]))}일째`;
}

// 「12~13일째」(처음과 끝이 같으면 「12일째」). 0은 1로(1부터 센다)
export function dayRangeLabel(start: number, end: number): string {
  const s = Math.max(1, start);
  const e = Math.max(1, end);
  return s === e ? `${s}일째` : `${s}~${e}일째`;
}

// 공개 콘텐츠의 달(「2026-11」 · 「2026-11-03」) → 「11월」(올해가 아니면 「2025년 10월」). 꼴이 다르면 그대로
export function monthLabel(ym: string, today: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})/);
  if (!m) return ym;
  return m[1] === today.slice(0, 4) ? `${Number(m[2])}월` : `${m[1]}년 ${Number(m[2])}월`;
}

// 화면에 보일 사람 이름: 시스템 계정 · 개발용 가짜 로그인 이름을 사람 말로 바꾼다(실제 이름은 MEMBER_NAMES 에서 온다).
// 「나」는 MEMBER_NAMES 가 「…:남편」으로 바뀌기 전(2026-10-15 오전)에 저장된 기록 — 아내 화면에서 헷갈리지 않게 남편으로 보인다.
const NAME_ALIAS: Record<string, string> = { claude: '클로드', me: '남편', wife: '아내', 나: '남편' };
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
