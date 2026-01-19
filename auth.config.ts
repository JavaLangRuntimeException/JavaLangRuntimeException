import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnAdmin = nextUrl.pathname.startsWith("/admin");
      const isOnAdminLogin = nextUrl.pathname === "/admin/login";

      if (isOnAdmin && !isOnAdminLogin) {
        if (!isLoggedIn) return false;

        // 許可されたメールアドレスかチェック
        const allowedEmails = (process.env.ADMIN_EMAIL || "")
          .split(",")
          .map((e) => e.trim().toLowerCase());

        if (!auth.user?.email || !allowedEmails.includes(auth.user.email.toLowerCase())) {
          return false;
        }
      }

      return true;
    },
  },
  providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;

