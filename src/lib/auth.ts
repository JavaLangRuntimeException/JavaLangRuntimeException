import NextAuth from "next-auth";
import Google from "next-auth/providers/google";


// 許可されたメールアドレスかどうかを確認
export function isAllowedAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowedEmails = (process.env.ADMIN_EMAIL || "").split(",").map((e) => e.trim().toLowerCase());
  return allowedEmails.includes(email.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
  callbacks: {
    async signIn({ user }) {
      // 許可されたメールアドレスのみサインインを許可
      const allowed = isAllowedAdmin(user.email);
      if (!allowed) {
        console.log(`Access denied for ${user.email} - not in allowed admin list`);
        return false;
      }
      console.log(`Access granted for ${user.email}`);
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
  trustHost: true,
});
