import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { SocialButton } from "@/components/base/social-button/social-button";
import { signIn, signOutQuietly, useClearSession, useSession } from "@/entities/session";
import { useT } from "@/shared/lib/i18n";

/** 管理者ログイン（旧 src/app/admin/login/page.tsx と同じ流れと文言） */
export function LoginCard() {
  const { user, isLoading } = useSession();
  const clearSession = useClearSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // 今は「アクセス拒否」だけ（言語を切り替えても文言が追従するよう、文字列ではなく有無で持つ）
  const [error, setError] = useState(false);
  const t = useT();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "AccessDenied") {
      setError(true);
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
    setError(false);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background-secondary-default">
        <p className="text-body-regular text-text-secondary">{t({ ja: "読み込み中...", en: "Loading..." })}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background-secondary-default p-4">
      <div className="w-full max-w-md rounded-xl border border-border-button-default bg-background-primary-default p-8 shadow-xs">
        <h1 className="mb-6 text-center text-title-3-semibold text-text-primary">Admin Login</h1>

        {error && (
          <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-border-error-default px-4 py-3 text-text-error-primary">
            <div>
              <p className="text-body-semibold">{t({ ja: "アクセス拒否", en: "Access denied" })}</p>
              <p className="mt-1 text-body-2-regular">
                {t({ ja: "アクセスが拒否されました。許可されたアカウントでログインしてください。", en: "Access was denied. Please sign in with an authorized account." })}
              </p>
            </div>
          </div>
        )}

        {!user && (
          <div className="flex flex-col gap-4">
            {!error && <p className="mb-2 text-center text-body-regular text-text-secondary">{t({ ja: "許可されたGoogleアカウントでログインしてください", en: "Sign in with an authorized Google account" })}</p>}
            <SocialButton
              brand="google"
              appearance="white"
              fullWidth
              onClick={() => {
                setError(false);
                signIn("/admin");
              }}
            >
              {error ? t({ ja: "別のアカウントで再ログイン", en: "Sign in with another account" }) : t({ ja: "Googleでログイン", en: "Sign in with Google" })}
            </SocialButton>
          </div>
        )}

        {user && (
          <div className="text-center">
            <p className="mb-4 text-body-regular text-text-primary">{t({ ja: `${user.email} でログイン中`, en: `Signed in as ${user.email}` })}</p>
            <p className="mb-6 text-body-2-regular text-text-secondary">{t({ ja: "管理者ページにリダイレクトしています...", en: "Redirecting to the admin page..." })}</p>
            <Button variant="ghost" size="small" className="w-full text-text-error-primary" onClick={handleLogout}>
              {t({ ja: "ログアウト", en: "Sign out" })}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
