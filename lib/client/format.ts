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

export function dueLabel(due: string | null, today: string): { text: string; late: boolean } | null {
  if (!due) return null;
  const [, m, d] = due.split('-');
  const diff = Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
  const base = `${Number(m)}/${Number(d)}`;
  if (diff < 0) return { text: `${base} · ${-diff}일 지남`, late: true };
  if (diff === 0) return { text: `${base} · 오늘`, late: false };
  return { text: `${base} · D-${diff}`, late: false };
}
