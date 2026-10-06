import { Link } from "react-router";
import type { LinkCard } from "@/entities/link";
import { cx } from "@/utils/cx";

const cardClass =
  "group flex h-full flex-col overflow-hidden rounded-xl border border-separator-border bg-background-primary-default outline-none lift hover:border-border-button-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring";

function CardBody({ item }: { item: LinkCard }) {
  // 写真（/image*.png）は面いっぱい。ロゴは同じ大きさで真ん中に置き、普段は控えめ（ホバー・フォーカスで本来の色）
  const photo = item.imgSrc.startsWith("/image");
  return (
    <>
      <div className="flex aspect-[16/9] w-full items-center justify-center overflow-hidden border-b border-separator-border bg-background-secondary-default">
        <img
          src={item.imgSrc}
          alt={item.title}
          loading="lazy"
          className={cx(
            "transition-[scale,filter,opacity] duration-500 ease-out motion-reduce:transition-none",
            photo
              ? "size-full object-cover group-hover:scale-105"
              : "h-12 w-auto max-w-[45%] rounded-md object-contain opacity-70 grayscale group-hover:opacity-100 group-hover:grayscale-0 group-focus-visible:opacity-100 group-focus-visible:grayscale-0",
          )}
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-5">
        <h3 className="text-[1.0625rem] font-semibold text-text-primary transition-colors group-hover:text-accent-300">{item.title}</h3>
        <p className="text-body-2-regular text-text-secondary">{item.description}</p>
        {/* 旧サイトではカードの裏面にあった一言。常に見せる */}
        <p className="mt-auto whitespace-pre-line pt-4 text-[0.875rem] leading-[1.75] text-text-tertiary">{item.backText}</p>
      </div>
    </>
  );
}

/** リンク集のカード */
export function LinkCardsGrid({ cards }: { cards: LinkCard[] }) {
  if (!cards || cards.length === 0) {
    return <p className="text-center text-text-secondary">リンクを読み込み中...</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((item, idx) => {
        const internal = item.href.startsWith("/");
        return (
          <li key={idx}>
            {internal ? (
              <Link to={item.href} className={cardClass}>
                <CardBody item={item} />
              </Link>
            ) : (
              <a href={item.href} target="_blank" rel="noreferrer" className={cardClass}>
                <CardBody item={item} />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
