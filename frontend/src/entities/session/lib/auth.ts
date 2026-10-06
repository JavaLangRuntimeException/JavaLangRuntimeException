// ログイン・ログアウトは identity サービスの HTTP（旧 NextAuth と同じ /api/auth/*）。ブラウザごと移動する

/** Google でログイン（戻り先は同じサイトのパスだけ） */
export function signIn(callbackUrl = "/admin") {
  window.location.assign(`/api/auth/signin/google?callbackUrl=${encodeURIComponent(callbackUrl)}`);
}

/** ログアウトしてから callbackUrl へ移動する */
export function signOutAndGo(callbackUrl = "/") {
  window.location.assign(`/api/auth/signout?callbackUrl=${encodeURIComponent(callbackUrl)}`);
}

/** ログアウトだけする（画面は移動しない。旧 signOut({ redirect: false })） */
export async function signOutQuietly() {
  try {
    await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" });
  } catch {
    // 失敗しても画面の状態は未ログインに戻す
  }
}
