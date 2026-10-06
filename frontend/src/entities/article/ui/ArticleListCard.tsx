import { RiArrowRightLine } from "@remixicon/react";
import type { ArticleOgp } from "../model/types";

/** 記事 1 件（タイトル・説明・タグ）。外部（Qiita）へのリンク */
export function ArticleListCard({ article }: { article: ArticleOgp }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-4 overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default p-5 outline-none lift focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      {article.images && article.images.length > 0 && (
        <img src={article.images[0]} alt="" loading="lazy" className="hidden aspect-[1.91/1] w-40 shrink-0 rounded-xl object-cover sm:block" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="line-clamp-2 text-headline-semibold text-text-primary">{article.title}</h3>
        {article.description && <p className="line-clamp-2 text-body-2-regular text-text-secondary">{article.description}</p>}
        {article.tags && article.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {article.tags.slice(0, 5).map((tag, i) => (
              <li key={i} className="rounded-md bg-background-secondary-default px-2 py-0.5 text-caption-1-medium text-text-secondary">
                {tag}
              </li>
            ))}
          </ul>
        )}
        <span className="mt-1 inline-flex items-center gap-1 text-body-2-semibold text-accent-600">
          記事を読む
          <RiArrowRightLine className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
        </span>
      </div>
    </a>
  );
}
