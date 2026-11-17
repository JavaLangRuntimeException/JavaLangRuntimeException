import { describeError, isAuthError } from "@/api/errors";

/** API のエラー。Access のセッション切れは、読み直せば Access のログインに回るのでそう案内する */
export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (isAuthError(error)) {
    return (
      <div role="alert" className="rounded-md border border-line bg-surface px-4 py-4">
        <p className="font-semibold text-ink">ログインの有効期限が切れています</p>
        <p className="mt-1 text-ink-2">
          Cloudflare Access のセッションがないか、期限が切れました。ページを読み直すと、Google でもう一度ログインできます。
        </p>
        <a
          href={window.location.href}
          className="mt-3 inline-block rounded border border-line-strong px-3 py-1.5 font-medium text-accent hover:bg-accent-soft"
        >
          読み直してログインする
        </a>
      </div>
    );
  }
  return (
    <div role="alert" className="rounded-md border border-line bg-surface px-4 py-4">
      <p className="font-semibold text-bad">{describeError(error)}</p>
      {error instanceof Error && <p className="mt-1 font-mono text-xs break-all text-muted">{error.message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded border border-line-strong px-3 py-1.5 font-medium text-ink hover:bg-surface-2"
        >
          もう一度読み込む
        </button>
      )}
    </div>
  );
}
