import { Link } from "react-router";
import { useT } from "@/shared/lib/i18n";

export function NotFoundPage() {
  const t = useT();
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-5xl flex-col items-start justify-center gap-3 px-4">
      <p className="text-caption-1-semibold text-text-tertiary">404</p>
      <h1 className="text-title-2-medium text-text-primary">{t({ ja: "ページが見つかりませんでした。", en: "This page could not be found." })}</h1>
      <Link to="/" className="text-body-medium text-accent-300 underline-offset-4 hover:underline">
        taramanji
      </Link>
    </main>
  );
}
