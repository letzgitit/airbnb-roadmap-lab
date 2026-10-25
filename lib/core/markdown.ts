import { questionsMarkdown } from './questions.ts';
import type { ProgressDoc, Step, StepStatus, TaskItem } from './types.ts';
import { manwon, moneyRows, VIA_LABEL } from '../plan.ts';

const STATUS_LABEL: Record<StepStatus, string> = { todo: '시작 전', doing: '진행 중', done: '완료' };

export function kst(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
  return p; // YYYY-MM-DD HH:mm
}

function byDue(a: TaskItem, b: TaskItem) {
  const ad = a.due ?? '9999-99-99';
  const bd = b.due ?? '9999-99-99';
  return ad === bd ? a.stepId - b.stepId || a.createdAt.localeCompare(b.createdAt) : ad.localeCompare(bd);
}

// 🔴 할 일 줄은 `- [ ]` 를 쓰지 않는다(볼트 Todoist 플러그인이 체크박스를 할 일로 흡수). 일반 불릿 + ☐/☑ 기호만 쓴다.
export function renderMarkdown(doc: ProgressDoc, steps: Pick<Step, 'id' | 'title'>[], nowIso: string): string {
  const live = Object.values(doc.tasks).filter((t) => !t.deletedAt);
  const open = live.filter((t) => !t.done).sort(byDue);
  const done = live.filter((t) => t.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  const doneSteps = steps.filter((s) => doc.steps[String(s.id)]?.status === 'done').length;
  const props = Object.values(doc.property).filter((p) => !p.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const logs = doc.log.filter((l) => !l.deletedAt).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
  const stepTitle = (id: number) => steps.find((s) => s.id === id)?.title ?? '';

  const out: string[] = [];
  out.push('> ⚠️ 이 파일은 사이트에서 자동 생성됩니다 — 직접 고치지 마세요. 고치려면 사이트 또는 Claude에게 말해서 사이트 DB를 바꾸세요.');
  out.push('');
  out.push('# 외도민 우리 현황');
  out.push('');
  out.push(`- 마지막 동기화: ${kst(nowIso)} (KST) · 문서 version ${doc.version}`);
  out.push(`- 마지막 수정: ${doc.lastAction ? `${doc.lastAction.by} · ${kst(doc.lastAction.at)} · ${doc.lastAction.text}` : '-'}`);
  out.push('');
  out.push('## 진행률');
  out.push('');
  out.push(`- 단계 완료: ${doneSteps} / ${steps.length}`);
  out.push(`- 할 일 완료: ${done.length} / ${live.length}`);
  out.push('');
  out.push('## 집 정보');
  out.push('');
  if (props.length === 0) out.push('- (없음)');
  for (const p of props) out.push(`- ${p.label}: ${p.value}`);
  out.push('');
  out.push('## 단계별 현황');
  out.push('');
  for (const s of steps) {
    const st = doc.steps[String(s.id)];
    const status = STATUS_LABEL[st?.status ?? 'todo'];
    const date = st?.targetDate ? ` · 목표 ${st.targetDate}` : '';
    out.push(`- ${s.id}. ${s.title} — ${status}${date}`);
    if (st?.note) for (const line of st.note.split('\n')) out.push(`  - 메모: ${line}`);
  }
  out.push('');
  out.push('## 할 일');
  out.push('');
  out.push(`### 미완료 (${open.length})`);
  out.push('');
  if (open.length === 0) out.push('- (없음)');
  const today = kst(nowIso).slice(0, 10);
  for (const t of open) {
    const late = t.due && t.due < today ? ' ⚠️지남' : '';
    out.push(`- ☐ ${t.text} — ${t.stepId}단계 ${stepTitle(t.stepId)}${t.due ? ` · 마감 ${t.due}${late}` : ''}`);
  }
  out.push('');
  out.push('<details>');
  out.push(`<summary>완료 (${done.length})</summary>`);
  out.push('');
  if (done.length === 0) out.push('- (없음)');
  for (const t of done) out.push(`- ☑ ${t.text} — ${t.stepId}단계${t.doneBy ? ` · ${t.doneBy} ${kst(t.doneAt).slice(0, 10)}` : ''}`);
  out.push('');
  out.push('</details>');
  out.push('');
  out.push('## 최근 결정·변경 기록 (최근 20건)');
  out.push('');
  if (logs.length === 0) out.push('- (없음)');
  for (const l of logs) out.push(`- ${kst(l.at)} [${l.kind}] ${l.text.replace(/\n/g, ' / ')} — ${l.by}`);
  out.push('');
  out.push(...questionsMarkdown(doc, kst));
  // 「11월~1월 일정」(/plan)의 돈 흐름 · 갈림길. 없으면 절을 쓰지 않는다.
  const rows = moneyRows(Object.values(doc.money ?? {}), doc.plan ?? null);
  if (rows.length || doc.plan) {
    const won = (n: number | null) => (n === null ? '-' : `${n < 0 ? '−' : ''}${manwon(n)}`);
    out.push('## 돈 흐름 (11월~1월 일정)');
    out.push('');
    if (doc.plan) out.push(`- 출발점: 현금 ${won(doc.plan.cash)} · 마통 여유 ${won(doc.plan.credit)}`);
    for (const r of rows) {
      const m = r.item;
      const amt = m.amount === null ? '금액 미정' : `${m.amount < 0 ? '−' : '+'}${manwon(m.amount)}`;
      out.push(`- ${m.date ?? '날짜 미정'} ${m.text} — ${amt} (${VIA_LABEL[m.via]})${m.estimate ? ' [추정]' : ''} → 현금 ${won(r.cash)} · 마통 여유 ${won(r.credit)}`);
    }
    const fork = (doc.plan?.fork ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (fork.length) {
      out.push('');
      out.push('### 원주 갈림길');
      out.push('');
      for (const f of fork) out.push(`- ${f}`);
    }
    out.push('');
  }
  return out.join('\n');
}
