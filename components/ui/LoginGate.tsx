'use client';

import type { ReactNode } from 'react';
import { signIn, signOut } from 'next-auth/react';
import { useProgress } from '@/components/progress/ProgressProvider';
import { useSite } from '@/components/shell/SiteShell';
import { btnGhost, btnPrimary } from './buttonCls';
import { Card } from './Card';

// 로그인 전용 페이지의 문: 불러오는 중 / 로그인 전 / 허용 안 된 계정을 한 가지 모양으로 보이고, 로그인했으면 children 을 그린다.
export function LoginGate({ children }: { children: ReactNode }) {
  const { status, doc } = useProgress();
  const { loginReady } = useSite();

  if (status === 'ready' && doc) return <>{children}</>;
  if (status === 'loading' || status === 'ready') return <p className="py-8 text-base text-muted" role="status">불러오는 중…</p>;

  return (
    <Card className="mt-2 px-4 py-6">
      {status === 'anon' ? (
        <>
          <p className="text-lg font-bold text-ink">로그인한 사람만 볼 수 있어요</p>
          <div className="mt-4">
            {loginReady ? (
              <button type="button" className={btnPrimary} onClick={() => void signIn('google', { callbackUrl: window.location.href })}>
                <i className="fab fa-google" aria-hidden />구글로 로그인
              </button>
            ) : (
              <button type="button" className={btnPrimary} disabled aria-disabled="true">로그인 준비 중</button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-lg font-bold text-ink">허용되지 않은 계정이에요</p>
          <p className="mt-1 text-base text-ink-soft">허용된 계정으로 다시 로그인해 주세요.</p>
          <div className="mt-4">
            <button type="button" className={btnGhost} onClick={() => void signOut({ callbackUrl: '/' })}>로그아웃</button>
          </div>
        </>
      )}
    </Card>
  );
}
