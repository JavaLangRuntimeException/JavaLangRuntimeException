import { cx } from "@/utils/cx";

export interface BlogArticleCardProps {
  title: string;
  description?: string;
  url: string;
  image?: string;
  tags?: string[];
}

/** 記事のカード（Qiita へのリンク）。画像・タイトル・説明・タグ（最大 8 個）・「記事を読む →」 */
export function BlogArticleCard({ title, description, url, image, tags = [] }: BlogArticleCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        "group flex flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default",
        "lift hover:bg-background-primary-hover",
        "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
      )}
    >
      {image && (
        <div className="aspect-[1200/630] w-full overflow-hidden border-b border-separator-border bg-background-secondary-default">
          <img src={image} alt={title || "Qiita 記事一覧"} loading="lazy" className="size-full object-cover" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h2 className="line-clamp-2 text-headline-semibold text-text-primary group-hover:text-accent-300">{title}</h2>
        {description && <p className="line-clamp-4 text-body-2-regular text-text-secondary">{description}</p>}
        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="タグ">
            {tags.slice(0, 8).map((tag) => (
              <li key={tag} className="rounded-md bg-background-secondary-default px-2 py-0.5 text-caption-1-medium text-text-secondary">
                {tag}
              </li>
            ))}
          </ul>
        )}
        <span className="mt-auto pt-1 text-body-2-semibold text-accent-600">
          記事を読む <span aria-hidden="true">→</span>
        </span>
      </div>
    </a>
  );
}
