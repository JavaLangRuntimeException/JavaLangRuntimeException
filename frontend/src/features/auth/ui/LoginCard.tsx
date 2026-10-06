import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { RiErrorWarningLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { SocialButton } from "@/components/base/social-button/social-button";
import { signIn, signOutQuietly, useClearSession, useSession } from "@/entities/session";

/** 管理者ログイン（旧 src/app/admin/login/page.tsx と同じ流れと文言） */
export function LoginCard() {
  const { user, isLoading } = useSession();
  const clearSession = useClearSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "AccessDenied") {
      setError("アクセスが拒否されました。許可されたアカウントでログインしてください。");
      // セッションがあればクリア
      if (user) {
        void signOutQuietly().then(clearSession);
      }
      return;
    }
    // セッションがあれば直接管理者ページにリダイレクト
    if (user?.email && !errorParam) {
      navigate("/admin");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, searchParams]);

  const handleLogout = async () => {
    await signOutQuietly();
    clearSession();
    setError(null);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background-secondary-default">
        <p className="text-body-regular text-text-secondary">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background-secondary-default p-4">
      <div className="w-full max-w-md rounded-3xl border border-border-button-default bg-background-primary-default p-8 shadow-xs">
        <h1 className="mb-6 text-center text-title-3-semibold text-text-primary">Admin Login</h1>

        {error && (
          <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border border-border-error-default px-4 py-3 text-text-error-primary">
            <RiErrorWarningLine className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-body-semibold">アクセス拒否</p>
              <p className="mt-1 text-body-2-regular">{error}</p>
            </div>
          </div>
        )}

        {!user && (
          <div className="flex flex-col gap-4">
            {!error && <p className="mb-2 text-center text-body-regular text-text-secondary">許可されたGoogleアカウントでログインしてください</p>}
            <SocialButton
              brand="google"
              appearance="white"
              fullWidth
              onClick={() => {
                setError(null);
                signIn("/admin");
              }}
            >
              {error ? "別のアカウントで再ログイン" : "Googleでログイン"}
            </SocialButton>
          </div>
        )}

        {user && (
          <div className="text-center">
            <p className="mb-4 text-body-regular text-text-primary">{user.email} でログイン中</p>
            <p className="mb-6 text-body-2-regular text-text-secondary">管理者ページにリダイレクトしています...</p>
            <Button variant="ghost" size="small" className="w-full text-text-error-primary" onClick={handleLogout}>
              ログアウト
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
