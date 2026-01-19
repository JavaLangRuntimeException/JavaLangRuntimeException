"use client";

import { signIn, useSession, signOut } from "next-auth/react";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AdminLoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // URLパラメータからエラーをチェック
    const errorParam = searchParams.get('error');
    if (errorParam === 'AccessDenied') {
      setError('アクセスが拒否されました。許可されたアカウントでログインしてください。');
      // セッションがあればクリア
      if (session) {
        signOut({ redirect: false });
      }
      return;
    }

    // セッションがあれば直接管理者ページにリダイレクト
    if (session?.user?.email && !errorParam) {
      router.push("/admin");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email, searchParams]);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    setError(null);
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
        <div className="text-white text-xl">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center p-4">
      <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-8 w-full max-w-md border border-gray-700">
        <h1 className="text-2xl font-bold text-white text-center mb-6">
          Admin Login
        </h1>

        {error && (
          <div className="bg-red-500/20 border-2 border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-semibold">アクセス拒否</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {!session && (
          <div className="space-y-4">
            {!error && (
              <p className="text-gray-300 text-center mb-6">
                許可されたGoogleアカウントでログインしてください
              </p>
            )}
            <button
              onClick={() => {
                setError(null);
                signIn("google");
              }}
              className="w-full bg-white text-gray-900 font-medium py-3 px-4 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {error ? '別のアカウントで再ログイン' : 'Googleでログイン'}
            </button>
          </div>
        )}

        {session && (
          <div className="text-center text-gray-300">
            <p className="mb-4">{session.user?.email} でログイン中</p>
            <p className="text-sm mb-6">管理者ページにリダイレクトしています...</p>
            <button
              onClick={handleLogout}
              className="w-full text-red-400 hover:text-red-300 text-sm transition-colors"
            >
              ログアウト
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
        <div className="text-white text-xl">読み込み中...</div>
      </div>
    }>
      <AdminLoginContent />
    </Suspense>
  );
}
