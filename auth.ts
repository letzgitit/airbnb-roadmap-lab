import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { isAllowed } from '@/lib/allowed';

// AUTH_SECRET·AUTH_GOOGLE_ID·AUTH_GOOGLE_SECRET 은 env 에서 자동으로 읽힌다(없으면 프로덕션에서 Auth.js 가 에러로 멈춤).
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt', maxAge: 14 * 24 * 3600 },
  // Vercel 은 Host 헤더를 플랫폼이 정하므로 믿어도 된다. 다른 곳에 올리면 AUTH_URL 을 지정할 것.
  trustHost: true,
  callbacks: {
    // 허용 목록에 있고 구글이 이메일 소유를 확인한 계정만 로그인. (요청마다 lib/session.ts 에서 허용 목록을 다시 본다)
    signIn({ account, profile }) {
      return account?.provider === 'google' && profile?.email_verified === true && isAllowed(profile?.email);
    },
  },
  pages: { error: '/' },
});
