import { useConnpassEvents } from "@/entities/event";
import { Section, Skeleton } from "@/shared/ui/layout";

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** connpass で主催しているイベント */
export function ConnpassEventCards() {
  const { data: events, isPending } = useConnpassEvents();

  return (
    <Section
      id="events"
      title="Organized Events"
    >
      {isPending && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <p className="text-body-2-regular text-text-tertiary">イベント取得中...</p>
          <Skeleton className="h-36" />
        </div>
      )}
      {!isPending && (events ?? []).length === 0 && <p className="text-body-2-regular text-text-tertiary">直近の主催イベントはありません</p>}
      {!isPending && events && events.length > 0 && (
        <ul className="flex flex-col gap-3">
          {events.map((event) => (
            <li key={String(event.eventId)}>
              <a
                href={event.eventUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col overflow-hidden rounded-xl border border-border-button-default bg-background-primary-default outline-none lift focus-visible:ring-2 focus-visible:ring-border-focus-ring sm:flex-row"
              >
                {event.imageUrl && (
                  <img src={event.imageUrl} alt="" loading="lazy" className="aspect-[2/1] w-full object-cover sm:aspect-auto sm:w-56" />
                )}
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <h3 className="line-clamp-2 text-headline-semibold text-text-primary">{event.title}</h3>
                  <dl className="flex flex-col gap-1.5 text-body-2-regular text-text-secondary">
                    <div className="flex items-center gap-2">
                      <dt className="meta shrink-0">場所</dt>
                      <dd className="line-clamp-1">{event.place}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="meta shrink-0">日時</dt>
                      <dd>{formatDate(event.startedAt)}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="sr-only">参加者</dt>
                      <dd>
                        参加者: {event.accepted}/{event.limit || "∞"}
                        {event.waiting > 0 && ` (補欠: ${event.waiting})`}
                      </dd>
                    </div>
                  </dl>
                  <span className="mt-auto inline-flex items-center gap-1 text-body-2-semibold text-accent-300">
                    詳細を見る
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
