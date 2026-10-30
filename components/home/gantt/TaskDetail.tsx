'use client';

import type { ReactNode } from 'react';
import { useProgress } from '@/components/progress/ProgressProvider';
import { textBtn } from '@/components/progress/bits';
import { phonesIn, telHref } from '@/components/tasks/phone';
import { TaskPhotos } from '@/components/tasks/TaskPhotos';
import { TaskMemo } from '@/components/tasks/TaskMemo';
import { GuideButton } from '@/components/tasks/TaskGuide';
import { useGuideIds } from '@/components/tasks/guides-client';
import s from './gantt.module.css';
import { Pen, Trash } from './icons';

// 간트 할 일 · 세부 항목 줄을 눌렀을 때 그 줄 바로 밑에 펼치는 내용(사이트 공통 할 일 규칙 — 누르면 먼저 보기, 연필 = 고치기).
//   메모 전체(16px · 행간 1.7, TaskRow 의 펼친 메모와 같은 TaskMemo — 메모 안 체크리스트도 그 자리에서 체크 · 「＋ 항목」) · 메모 속 전화 바로 걸기 · 사진(TaskPhotos) · 도움말(?)
//   + 연필(그 자리 편집 폼) · 휴지통(확인 없이 지우고 8초 「되돌리기」). 새 선 · 면 없이 이름 줄과 같은 면 위에.
//   연필 · 휴지통이 늘 여기 있으므로 모든 줄이 펼쳐진다(줄 오른쪽 끝 꺾쇠도 늘).
//   연필 · 휴지통은 펼친 칸 첫 줄 오른쪽(다른 화면 할 일 줄의 둘째 줄 단추와 같은 자리) — 휴지통 가운데가 이름 줄 꺾쇠 가운데와 한 세로줄.
//   간격은 다른 화면 펼친 메모와 같다: 메모 ~ 「＋ 사진」 8px, 맨 아래 글자 ~ 줄 끝 14px.

export function TaskDetail({ id, left, rails, onEdit, onDelete }: {
  id: string; left: number; rails: ReactNode;
  onEdit: () => void; onDelete: () => void;
}) {
  const { doc } = useProgress();
  const guides = useGuideIds();
  const t = doc?.tasks[id];
  if (!t) return null;
  const note = (t.note ?? '').trim();
  const phones = [...new Set(phonesIn(note))];
  const guide = guides[id];
  return (
    <div className={s.detail} style={{ paddingLeft: left }} onClick={(e) => e.stopPropagation()}>
      {rails}
      <span className={s.dActs}>
        <button type="button" className={s.dBtn} aria-label={`${t.text} 고치기`} onClick={onEdit}><Pen /></button>
        <button type="button" className={`${s.dBtn} ${s.dDel}`} aria-label={`${t.text} 삭제`} onClick={onDelete}><Trash /></button>
      </span>
      {note && <TaskMemo t={t} note={note} />}
      <TaskPhotos taskId={t.id} stepId={t.stepId} flush />
      {(phones.length > 0 || guide) && (
        <div className="-mb-[11px] mt-[11px] flex flex-wrap items-center gap-x-4">
          {phones.map((p) => <a key={p} href={telHref(p)} className={`${textBtn} mx-0 tabular-nums`}><i className="fas fa-phone mr-1.5" aria-hidden />{p}</a>)}
          {guide && <span className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-soft">도움말<GuideButton taskId={t.id} title={t.text} version={guide.version} /></span>}
        </div>
      )}
    </div>
  );
}
