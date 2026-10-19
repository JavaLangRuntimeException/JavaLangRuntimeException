import { signOutAccess } from "@/shared/lib/access";
import { useT } from "@/shared/lib/i18n";
import { cx } from "@/utils/cx";

// Cloudflare Access からのログアウト（stg・dev01〜03 と /admin）。別の Google アカウントで入り直すときに使う
export function AccessLogoutButton({ className }: { className?: string }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => void signOutAccess()}
      className={cx(
        "meta shrink-0 rounded-lg border border-separator-border px-2 py-0.5 text-caption-1-medium text-text-secondary outline-none transition-colors",
        "hover:bg-background-secondary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring active:scale-[.97]",
        className,
      )}
    >
      {t({ ja: "ログアウト", en: "Sign out" })}
    </button>
  );
}
