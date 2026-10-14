import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { isAllowed } from '@/lib/allowed';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  trustHost: true,
  callbacks: {
    // 허용 목록에 없는 구글 계정은 로그인 자체를 거부
    signIn({ profile }) {
      return profile?.email_verified !== false && isAllowed(profile?.email);
    },
  },
  pages: { error: '/' },
});
