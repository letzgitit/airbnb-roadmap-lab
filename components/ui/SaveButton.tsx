'use client';

import { useState, type ReactNode } from 'react';
import { devHeaders } from '@/components/progress/ProgressProvider';
import { saveFile } from '@/lib/client/save-file';

/**
 * 「받기」 단추: 원본을 받아 이름을 붙여 저장(폰은 공유 시트). 받는 중에는 「받는 중」, 실패하면 단추 옆에 짧은 안내.
 * 모양(className)은 놓이는 자리의 다른 단추와 맞춰 넘긴다.
 */
export function SaveButton({ url, name, mime, className, errorClassName = 'text-sm text-danger-ink', children = '받기', ariaLabel }: {
  url: string; name: string; mime: string; className: string; errorClassName?: string; children?: ReactNode; ariaLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <button type="button" disabled={busy} aria-label={ariaLabel} className={`${className} disabled:opacity-60`}
        onClick={() => {
          setBusy(true); setFailed(false);
          saveFile(url, name, mime, devHeaders()).catch(() => setFailed(true)).finally(() => setBusy(false));
        }}>
        <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-download'} mr-1.5`} aria-hidden />{busy ? '받는 중' : children}
      </button>
      <span role="status" aria-live="polite" className={failed ? errorClassName : 'sr-only'}>{failed ? '받지 못했어요. 다시 눌러 주세요.' : ''}</span>
    </>
  );
}
