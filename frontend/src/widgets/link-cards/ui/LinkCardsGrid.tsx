import { Link } from "react-router";
import { RiArrowRightUpLine, RiArrowRightLine } from "@remixicon/react";
import type { LinkCard } from "@/entities/link";
import { cx } from "@/utils/cx";

const cardClass =
  "group flex h-full flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default outline-none lift focus-visible:ring-2 focus-visible:ring-border-focus-ring";

function CardBody({ item, external }: { item: LinkCard; external: boolean }) {
  const Arrow = external ? RiArrowRightUpLine : RiArrowRightLine;
  return (
    <>
      <div className="aspect-[2/1] w-full overflow-hidden border-b border-separator-border bg-background-primary-default">
        {/* 写真（/image*.png）は面いっぱい、ロゴは余白を取って収める */}
        <img
          src={item.imgSrc}
          alt={item.title}
          loading="lazy"
          className={cx("size-full transition-[scale] duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none", item.imgSrc.startsWith("/image") ? "object-cover" : "object-contain p-8")}
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-headline-semibold text-text-primary">{item.title}</h3>
          <Arrow className="mt-0.5 size-4 shrink-0 text-foreground-icon-tertiary transition-colors group-hover:text-accent-600" aria-hidden />
        </div>
        <p className="text-body-2-medium text-text-secondary">{item.description}</p>
        {/* 旧サイトではカードの裏面にあった一言。常に見せる */}
        <p className="mt-auto whitespace-pre-line border-t border-separator-border pt-3 text-body-2-regular text-text-tertiary">{item.backText}</p>
      </div>
    </>
  );
}

/** リンク集のカード */
export function LinkCardsGrid({ cards }: { cards: LinkCard[] }) {
  if (!cards || cards.length === 0) {
    return <p className="text-center text-body-regular text-text-secondary">リンクを読み込み中...</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((item, idx) => {
        const internal = item.href.startsWith("/");
        return (
          <li key={idx}>
            {internal ? (
              <Link to={item.href} className={cardClass}>
                <CardBody item={item} external={false} />
              </Link>
            ) : (
              <a href={item.href} target="_blank" rel="noreferrer" className={cardClass}>
                <CardBody item={item} external />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
